// Run with STONE_FIXTURES_DIR pointing to the four supplied PDFs.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {analyseDesign,loadEngineAssets,evaluateTemplate,renderTemplate} from '../lib/template-engine';
import {compileDocument} from '../lib/document-template';
import {fetchGoogleFont,fontRequest} from '../lib/google-fonts';
const originalFetch=globalThis.fetch;
let calls=0;
globalThis.fetch=async(_input:any,init:any)=>{assert.equal(init.redirect,'manual');calls++;return calls===1?new Response('@font-face{src:url(https://fonts.gstatic.com/test.woff)}'):new Response(new Uint8Array([1,2,3]));};
assert.deepEqual((await fetchGoogleFont('Crimson Text',400,false))?.files,['AQID']);
assert.equal(fontRequest('HelveticaNeueLTStd-Bd').weight,700);
globalThis.fetch=async(input:any)=>{const p='public'+new URL(String(input),'https://test.local').pathname;return fs.existsSync(p)?new Response(fs.readFileSync(p)):new Response('',{status:404});};
const assets=await loadEngineAssets(),folder=process.env.STONE_FIXTURES_DIR;
if(!folder)throw Error('Set STONE_FIXTURES_DIR to the supplied PDF fixtures.');
fs.mkdirSync('work/stone-qa',{recursive:true});
for(const name of (process.env.STONE_TEST_NAMES??'listed,sold,brochure,signboard').split(',')){
 const doc=await PDFDocument.load(fs.readFileSync(path.join(folder,name+'.pdf'))),pages=[];
 // Normalize fixture origins as part of document preparation before engine analysis.
 for(const p of doc.getPages()){const b=p.getMediaBox();p.translateContent(-b.x,-b.y);p.setMediaBox(0,0,b.width,b.height);p.setCropBox(0,0,b.width,b.height);}
 const source=await doc.save();
 for(let i=0;i<doc.getPageCount();i++){
  const a=await analyseDesign(source,name+'.pdf',i,assets);
  // Use the source page frame for this engine regression; UI dimension setup is separate.
  a.spec={...a.spec,faceWidth:a.width*25.4/72-4,faceHeight:a.height*25.4/72-4,bleed:2,sourceIncludesBleed:true,product:'other_print',productConfirmed:true,sizeConfirmed:true,bleedConfirmed:true,marks:false};
  for(const r of a.runs)for(const c of r.text)assert(a.fonts[r.fontName]?.glyphs[String(c.codePointAt(0))],`${name}: missing ${c} in ${r.fontName}`);
  if(name==='signboard')assert.equal(a.media?.find(s=>s.id==='media_1')?.role,'fixed');
  pages.push(a);
 }
 const compiled=await compileDocument(source,pages,name,assets);const t=JSON.parse(JSON.stringify(compiled.manifest));
 if(name==='brochure')assert(t.fields.length>60);
 if(name==='listed'||name==='sold')assert(!t.printIssues.some((x:string)=>x.includes('fixed vector colour')),name+' colour warning');
 const check=evaluateTemplate(t,{},false);assert(check.valid,JSON.stringify(check.errors));
 const result=await renderTemplate(compiled.base,t,{},false,assets);assert.equal((await PDFDocument.load(result)).getPageCount(),doc.getPageCount());
 fs.writeFileSync(`work/stone-qa/${name}-base.pdf`,compiled.base);fs.writeFileSync(`work/stone-qa/${name}.json`,JSON.stringify(t));fs.writeFileSync(`work/stone-qa/${name}-proof.pdf`,result);
 console.log(`PASS ${name}: ${t.fields.length} fields, ${pages.length} pages, embedded punctuation, compile/reopen/proof${name==='signboard'?', fixed background':''}`);
}
globalThis.fetch=originalFetch;
