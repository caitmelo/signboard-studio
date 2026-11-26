import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {PDFDocument,rgb} from 'pdf-lib';
import {keepUploadedSize,sourcePlacement} from '../lib/size-resolution';
import {layoutIssues,evaluateTemplate,renderTemplate} from '../lib/template-engine';
const MM=72/25.4;
const spec:any={faceWidth:210,faceHeight:297,bleed:2,sourceIncludesBleed:false,marks:false,product:'brochure',productConfirmed:true,bleedConfirmed:true};
assert.ok(layoutIssues(spec,300,400).length);
const original=keepUploadedSize(spec,300,400);assert.equal(layoutIssues(original,300,400).length,0);assert.ok(Math.abs(original.faceWidth-300/MM)<.0001);
const sign=keepUploadedSize({...spec,product:'edgewrap',bleed:65,sourceIncludesBleed:true},337.5*MM,490.5*MM);assert.ok(Math.abs(sign.faceWidth-1220)<.0001);assert.ok(Math.abs(sign.faceHeight-1832)<.0001);
const fitted={...spec,fitToProduct:true};assert.deepEqual(layoutIssues(fitted,300,400),[]);assert.ok(layoutIssues(fitted,0,400).length,'Invalid geometry must still fail');
const place=sourcePlacement(fitted,300,400);assert.equal(place.x,0);assert.ok(place.y>0);assert.ok(place.scale*300<=210*MM+.01);assert.ok(place.scale*400<=297*MM+.01);
const doc=await PDFDocument.create();doc.addPage([300,400]).drawRectangle({x:0,y:0,width:300,height:400,color:rgb(0,0,0)});
const t:any={schemaVersion:1,name:'Size test',sourceName:'test.pdf',sourceWidth:300,sourceHeight:400,fields:[],fonts:{},groups:[],warnings:[],printIssues:[],spec:fitted};
assert.ok(evaluateTemplate(t,{},false).valid);
const assets:any={table:new Uint8Array(readFileSync('public/template/rgb-to-cmyk-33.bin')),icc:new Uint8Array(readFileSync('public/template/colour/CGATS001Compat-v2-micro.icc'))};
for(const target of [fitted,original]){const output=await renderTemplate(await doc.save(),{...t,spec:target},{},false,assets);const p=(await PDFDocument.load(output)).getPage(0);assert.ok(Math.abs(p.getTrimBox().width-target.faceWidth*MM)<.001);assert.ok(Math.abs(p.getTrimBox().height-target.faceHeight*MM)<.001);}
console.log('PASS original-size recovery, 25% signboard dimensions, centred proportional fit, valid geometry gate, exact exported TrimBoxes.');
