import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {detectDocument} from '../lib/document-setup';
import {prepareConfirmedPaper,recommendCommercialSize} from '../lib/commercial-size';
import {layoutIssues} from '../lib/template-engine';
const MM=72/25.4;
async function paper(w:number,h:number,name:string,trim?:number[]){const doc=await PDFDocument.create(),p=doc.addPage([w*MM,h*MM]);if(trim)p.setTrimBox(...trim.map(v=>v*MM) as [number,number,number,number]);const data=await doc.save();return {data,setup:await detectDocument(data,name)};}
for(const [w,h,name,key] of [[148,210,'artwork.pdf','a5'],[152,214,'artwork.pdf','a5'],[168,230,'A5 brochure.pdf','a5'],[301,214,'brochure.pdf','a4']] as const){const {data,setup}=await paper(w,h,name);assert.equal(setup.spec.sizeName,key);assert.ok(setup.commercial);const normal=await prepareConfirmedPaper(data,0,setup.spec,setup.commercial.trim);const doc=await PDFDocument.load(normal.data);const page=doc.getPage(0);assert.equal(layoutIssues(normal.spec,page.getWidth(),page.getHeight()).length,0);}
const explicit=await paper(180,250,'artwork.pdf',[11,13,148,210]);assert.equal(explicit.setup.spec.sizeName,'a5');assert.ok(explicit.setup.commercial?.basis.includes('finished-size box'));
const imposed=await paper(210,297,'A5 on A4 sheet.pdf');assert.equal(imposed.setup.spec.sizeName,'a4','Do not crop an imposed sheet into a single A5');
for(const [w,h,name,key] of [[337.5,490.5,'6x4 edgewrap.pdf','6x4'],[642.5,337.5,'8x4 edgewrap.pdf','8x4']] as const){const {setup}=await paper(w,h,name);assert.equal(setup.spec.sizeName,key);}
const custom=await paper(180,260,'custom.pdf');assert.equal(custom.setup.commercial,undefined);
console.log('PASS A5 with bleed/margins, A4 landscape, asymmetric explicit trim, imposed sheet preservation, quarter-scale 6x4 and 8x4, custom size fallback.');
