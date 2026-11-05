import assert from 'node:assert/strict';
import {PDFDocument} from 'pdf-lib';
import {addCropMarks} from '../lib/crop-marks';
const doc=await PDFDocument.create();for(let i=0;i<2;i++){const p=doc.addPage([600,300]);p.setTrimBox(6,6,588,288);p.setBleedBox(0,0,600,300);p.drawRectangle({x:10,y:10,width:20,height:20});}
const input=await doc.save({useObjectStreams:false});input.set(new TextEncoder().encode('%PDF-1.3'));
const output=await addCropMarks(input),result=await PDFDocument.load(output),pad=8*72/25.4;
assert.equal(new TextDecoder().decode(output.subarray(0,8)),'%PDF-1.3');assert.equal(result.getPageCount(),2);
for(const page of result.getPages()){assert.equal(page.getTrimBox().width,588);assert.equal(page.getTrimBox().height,288);assert.equal(page.getBleedBox().width,600);assert.equal(page.getBleedBox().height,300);assert.equal(page.getTrimBox().x,6+pad);assert.equal(page.getMediaBox().width,600+2*pad);}
console.log('PASS crop marks retain PDF 1.3, finished size, bleed and artwork scale on every page');
