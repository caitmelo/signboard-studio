import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument} from 'pdf-lib';
import {evaluateTemplate,renderTemplate} from '../lib/template-engine';
const text='addresses, The Glades Estate.';
const glyph={advance:500,bounds:[-20,-220,510,800],path:'0 0 m 400 0 l 400 700 l 0 700 l h'};
const font={name:'Fixture',unitsPerEm:1000,glyphs:Object.fromEntries([...new Set(text+'LONGER')].map(c=>[String(c.codePointAt(0)),glyph]))};
const field={id:'body',label:text,text,fontName:'Fixture',size:10,x:50,y:100,width:text.length*5,positions:[...text].map((_,i)=>i*5),horizontalScale:1,charSpace:0,wordSpace:0,align:'left',role:'custom',clip:[50,99,200,107],color:[0,0,0,1]};
const template:any={schemaVersion:1,name:'Original frame',sourceName:'fixture.pdf',sourceWidth:300,sourceHeight:400,fields:[field],fonts:{Fixture:font},groups:[],warnings:[],printIssues:[],spec:{faceWidth:300*25.4/72,faceHeight:400*25.4/72,bleed:2,sourceIncludesBleed:false,marks:false,product:'other_print',productConfirmed:true,bleedConfirmed:true}};
const original=evaluateTemplate(template,{},false);assert.equal(original.valid,true,original.errors.join(';'));assert.equal(original.fields[0].size,10);assert.equal(original.fields[0].x,50);assert.deepEqual(original.fields[0].clip,field.clip);assert.deepEqual(original.fields[0].offsets,field.positions);
for(const align of ['left','center','right']){
 const t=structuredClone(template);t.fields[0].align=align;t.fields[0].clip=[45,95,200,110];
 const edited=evaluateTemplate(t,{body:'LONGER '.repeat(6)},false);assert.equal(edited.valid,true,edited.errors.join(';'));const f=edited.fields[0];assert.ok(f.size<10);assert.ok(f.inkRight<=200.2);assert.ok(f.inkLeft>=44.8);assert.equal(f.y,100);
 if(align==='right')assert.ok(Math.abs(f.x+f.width-field.x-field.width)<.001);
 if(align==='center')assert.ok(Math.abs(f.x+f.width/2-field.x-field.width/2)<.001);
}
const doc=await PDFDocument.create();doc.addPage([300,400]);const assets={poppins:font as any,table:new Uint8Array(readFileSync('public/template/rgb-to-cmyk-33.bin')),icc:new Uint8Array(readFileSync('public/template/colour/CGATS001Compat-v2-micro.icc'))};
const result=await renderTemplate(await doc.save(),template,{},false,assets);assert.equal((await PDFDocument.load(result)).getPageCount(),1);
const ui=readFileSync('components/template-builder.tsx','utf8');assert.ok(!ui.includes("hidden={view!=='edit'}"));
console.log('PASS original clipped text renders unchanged; longer edits fit with left/centre/right anchors; editor controls are not approval-gated.');
