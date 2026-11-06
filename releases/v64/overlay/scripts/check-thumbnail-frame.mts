import assert from 'node:assert/strict';
import {thumbnailCrop} from '../lib/thumbnail-frame';
import {printGeometry} from '../lib/print-specs';
import type {PrintSpec} from '../lib/template-types';

for(const spec of [
 {product:'edgewrap',faceWidth:325,faceHeight:605,bleed:65},
 {product:'pointer',faceWidth:600,faceHeight:900,bleed:2},
 {product:'brochure',faceWidth:210,faceHeight:297,bleed:2},
 {product:'mailcard',faceWidth:210,faceHeight:99,bleed:2},
 {product:'letter',faceWidth:210,faceHeight:297,bleed:0},
] as PrintSpec[]){
 const g=printGeometry(spec),frame={sheetWidth:g.width,sheetHeight:g.height,x:g.trimX,y:g.trimY,width:spec.faceWidth,height:spec.faceHeight};
 const crop=thumbnailCrop(g.width*2,g.height*2,frame)!;
 assert.ok(crop);assert.equal(crop.width,spec.faceWidth*2);assert.equal(crop.height,spec.faceHeight*2);
 assert.ok(Math.abs(crop.x-g.trimX*2)<1e-8);assert.ok(Math.abs(crop.y-(g.height-g.trimY-spec.faceHeight)*2)<1e-8);
 // A print-sheet crop must not change if the PDF is supplied at 25%.
 const quarter=thumbnailCrop(g.width/4,g.height/4,frame)!;
 assert.ok(Math.abs(quarter.width/crop.width-1/8)<1e-8);
}
const frame={sheetWidth:455,sheetHeight:735,x:65,y:65,width:325,height:605};
assert.equal(thumbnailCrop(325,605,frame),null,'do not crop a finished-size thumbnail again');
assert.equal(thumbnailCrop(300,200,frame),null,'do not crop mismatched page sizes');
assert.equal(thumbnailCrop(455,735,{...frame,width:1000}),null);
console.log('PASS: finished-size crops, asymmetric registration slug, paper bleed, scale, and mismatched-thumbnail guard');
