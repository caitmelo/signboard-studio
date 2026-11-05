import fs from 'node:fs';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {createRequire} from 'node:module';const {PNG}=createRequire(import.meta.url)('pngjs');import {PDFDocument} from 'pdf-lib';import {optimisePdf} from '../lib/pdf-upload';import {extendPaperBleed} from '../lib/paper-bleed';import {detectDocument} from '../lib/document-setup';
fs.mkdirSync('work/bleed-qa',{recursive:true});const table=new Uint8Array(fs.readFileSync('public/template/rgb-to-cmyk-33.bin'));
for(const name of ['listed','sold','brochure']){
 let data:Uint8Array=await optimisePdf(new Uint8Array(fs.readFileSync(`../fixtures/${name}.pdf`)),name+'.pdf');fs.writeFileSync(`work/bleed-qa/${name}-source.pdf`,data);
 const original=await PDFDocument.load(data);
 for(let i=0;i<original.getPageCount();i++){
  const setup=await detectDocument(data,name+'.pdf',i);assert.equal(setup.spec.sourceIncludesBleed,false);const prefix=`work/bleed-qa/${name}-${i}`;
  execFileSync('pdftoppm',['-f',String(i+1),'-singlefile','-r','100','-png',`work/bleed-qa/${name}-source.pdf`,prefix]);const png=PNG.sync.read(fs.readFileSync(prefix+'.png'));
  data=await extendPaperBleed(data,i,setup.spec,{width:png.width,height:png.height,data:png.data},table);
 }
 const out=await PDFDocument.load(data);for(const p of out.getPages()){const t=p.getTrimBox();assert(Math.abs(t.x*25.4/72-2)<.001);p.setCropBox(t.x,t.y,t.width,t.height);}
 fs.writeFileSync(`work/bleed-qa/${name}-trim.pdf`,await out.save());console.log('PASS',name,'actual import bleed path and 2mm trim');
}
