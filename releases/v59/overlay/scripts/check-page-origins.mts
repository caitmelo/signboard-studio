import fs from 'node:fs';import assert from 'node:assert/strict';import {PDFDocument} from 'pdf-lib';import {normalizePageOrigins} from '../lib/page-origins';import {optimisePdf} from '../lib/pdf-upload';import {printGeometry,exportScale} from '../lib/print-specs';import {fetchGoogleFont} from '../lib/google-fonts';
fs.mkdirSync('work/origin-qa',{recursive:true});
for(const name of ['listed','sold','brochure']){
 const input=new Uint8Array(fs.readFileSync(`../fixtures/${name}.pdf`)),doc=await PDFDocument.load(input);const clean=await optimisePdf(input,name+'.pdf'),after=await PDFDocument.load(clean);
 for(const[i,p]of after.getPages().entries()){const before=doc.getPage(i);assert(Math.abs(before.getMediaBox().x*25.4/72-3)<.001);assert.equal(p.getMediaBox().x,0);assert.equal(p.getMediaBox().y,0);assert.equal(p.getWidth(),before.getWidth());assert.equal(p.getHeight(),before.getHeight());assert.equal(p.getTrimBox().x,0);}
 assert.equal(await normalizePageOrigins(clean),clean,'Normalization must be idempotent');fs.writeFileSync(`work/origin-qa/${name}.pdf`,clean);console.log('PASS',name,'origin normalized, dimensions retained, no repeated shift');
}
for(const product of ['mailcard','brochure']as const){const spec={product,faceWidth:210,faceHeight:99,bleed:2,sourceIncludesBleed:true,marks:false};const g=printGeometry(spec);assert.equal(g.width,214);assert.equal(g.height,103);assert.equal(g.marks,false);assert.equal(exportScale(spec),1);}
const sign=printGeometry({product:'edgewrap',faceWidth:1220,faceHeight:2440,bleed:65,sourceIncludesBleed:true,marks:true});assert.equal(sign.marks,true);assert.equal(sign.width/4,337.5);assert.equal(sign.height/4,642.5);
globalThis.fetch=async()=>{throw Error('Known unavailable fonts should not request Google');};for(const font of ['SignPainterHouseScript','Sign Painter House Script','Helvetica Neue LT Std','EOS Icons'])assert.equal(await fetchGoogleFont(font,400,false),null);
console.log('PASS Sprint dimensions, paper no crop marks, signboard registration marks, font routing');
