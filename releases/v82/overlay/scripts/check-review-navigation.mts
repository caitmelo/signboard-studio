import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,PDFName} from 'pdf-lib';
import {reviewItems} from '../lib/review-items';
import {previewOverlays} from '../lib/preview-overlays';
import {inspectPdf} from '../lib/pdf-content';
import {colourConverter} from '../lib/template-colour';
const pages:any=[{pageIndex:0,runs:[{id:'a',label:'Address',text:'Street',fontName:'Test'}],media:[]},{pageIndex:1,runs:[],media:[]}];
const grouped=reviewItems(['Page 1: Colour review','Page 2: Colour review','Page 1: Address overlaps'],pages);assert.equal(grouped.length,2);assert.deepEqual(grouped[0].locations.map(l=>l.page),[0,1]);assert.deepEqual(grouped[1].locations[0].ids,['a']);assert.deepEqual(grouped[0].locations[0].ids,[],'Page-wide issue must not invent a frame');
const t:any={schemaVersion:1,name:'test',sourceName:'test',sourceWidth:300,sourceHeight:400,fields:[],fonts:{},groups:[],printIssues:[],warnings:[],media:[{id:'p1_photo',role:'image',x:30,y:50,width:60,height:70}],spec:{faceWidth:150,faceHeight:200,bleed:2,sourceIncludesBleed:false,product:'poster',marks:false,productConfirmed:true,bleedConfirmed:true}};
const out=previewOverlays(t,{},false,{});assert.equal(out.media[0].id,'photo');assert.ok(Math.abs(out.media[0].x-(30*150/300+2)*72/25.4)<.001);
const table=new Uint8Array(readFileSync('public/template/rgb-to-cmyk-33.bin')),icc=new Uint8Array(readFileSync('public/template/colour/CGATS001Compat-v2-micro.icc'));
async function colour(ink:string){const d=await PDFDocument.create(),p=d.addPage([300,400]);const fn=d.context.register(d.context.flateStream('{dup dup dup}',{FunctionType:4,Domain:[0,1],Range:[0,1,0,1,0,1,0,1]}));p.node.set(PDFName.of('Resources'),d.context.obj({ColorSpace:{Ink:['DeviceN',[ink],'DeviceCMYK',fn]}}));p.node.set(PDFName.of('Contents'),d.context.register(d.context.flateStream('/Ink cs .5 scn 10 10 100 100 re f')));return inspectPdf(await d.save(),0,colourConverter(table),icc);}
assert.ok(!(await colour('Black')).printIssues.some(i=>i.includes('fixed vector colour')),'Process black should be preserved without false warning');assert.ok((await colour('BrandGold')).printIssues.some(i=>i.includes('fixed vector colour')),'Unknown spot colour must remain a review concern');
const ui=readFileSync('components/template-builder.tsx','utf8');assert.ok(ui.includes('setOriginalUpload(uploaded)'));assert.ok(ui.includes('Original uploaded PDF · Page'));assert.ok(ui.includes('placeholder="e.g. A4 Trifold DL"'));assert.ok(ui.includes('highlightedIds='));
console.log('PASS grouped page issues, exact field targets, page-wide fallback, transformed photo overlays, process-colour false warning repair, true spot-colour warning retained, original comparison and custom name wiring.');
