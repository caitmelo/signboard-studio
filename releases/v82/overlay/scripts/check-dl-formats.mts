import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {detectDocument,pickSize} from '../lib/document-setup';
import {applyPrintFormat,formatDescription} from '../lib/print-format';
import {prepareConfirmedPaper} from '../lib/commercial-size';
const MM=72/25.4;
async function fixture(w:number,h:number,name:string,bleed=0){const d=await PDFDocument.create();for(let i=0;i<2;i++){const p=d.addPage([(w+2*bleed)*MM,(h+2*bleed)*MM]);if(bleed)p.setTrimBox(bleed*MM,bleed*MM,w*MM,h*MM);}const bytes=await d.save();return {bytes,setup:await detectDocument(bytes,name)};}
for(const bleed of [0,2,10]){
 const dl=await fixture(210,99,'DL_Just_Listed.pdf',bleed);assert.equal(dl.setup.pageCount,2);assert.equal(dl.setup.spec.format,'dl_mailcard');assert.equal(dl.setup.spec.product,'mailcard');assert.equal(dl.setup.spec.faceWidth,210);assert.equal(dl.setup.spec.faceHeight,99);
 const tri=await fixture(297,210,'A4_Trifold_DL.pdf',bleed);assert.equal(tri.setup.pageCount,2);assert.equal(tri.setup.spec.format,'a4_trifold_dl');assert.equal(tri.setup.spec.faceWidth,297);assert.equal(tri.setup.spec.faceHeight,210);
 const normal=await prepareConfirmedPaper(tri.bytes,0,tri.setup.spec,tri.setup.commercial?.trim);const pdf=await PDFDocument.load(normal.data);assert.equal(pdf.getPageCount(),2);assert.ok(Math.abs(pdf.getPage(0).getTrimBox().width-297*MM)<.001,'Keep all three panels, not one DL card');
}
const flat=await fixture(297,210,'Brochure.pdf');assert.equal(flat.setup.spec.format,'a4_flat','Two A4 pages do not prove folding');const choice=applyPrintFormat(flat.setup.spec,'a4_trifold_dl');assert.equal(choice.faceWidth,297);assert.equal(choice.faceHeight,210);assert.equal(choice.format,'a4_trifold_dl');assert.match(formatDescription(choice,2),/outside and inside/);
const wronglyNamed=await fixture(210,99,'A4_Trifold_DL.pdf');assert.equal(wronglyNamed.setup.spec.format,'dl_mailcard','Physical DL size wins over misleading A4 name');assert.equal(pickSize(choice,'dl').format,'dl_mailcard');
console.log('PASS two-sided DL vs A4 trifold, bleed/margins, full unfolded pages preserved, generic A4 stays flat, filename conflict, explicit format selection.');
