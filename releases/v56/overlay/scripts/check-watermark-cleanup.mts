import fs from 'node:fs';import assert from 'node:assert/strict';import {PDFDocument,PDFName,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {inspectWatermarks,removeWatermarks} from '../lib/pdf-watermarks';
const dir=process.env.STONE_FIXTURES_DIR;if(!dir)throw Error('Set STONE_FIXTURES_DIR to the supplied PDF fixtures.');
const images=async(data:Uint8Array)=>{const doc=await PDFDocument.load(data);return doc.context.enumerateIndirectObjects().filter(([,v])=>v instanceof PDFRawStream&&v.dict.get(PDFName.of('Subtype'))?.toString()==='/Image').map(([,v])=>Buffer.from((v as PDFRawStream).contents).toString('base64')).sort();};
fs.mkdirSync('work/watermark-qa',{recursive:true});
for(const name of ['listed','sold','brochure','signboard']){
 const data:Uint8Array=new Uint8Array(fs.readFileSync(`${dir}/${name}.pdf`)),original=data.slice(),found=await inspectWatermarks(data);assert.equal(found.length,name==='signboard'?0:2);
 assert.equal(await removeWatermarks(data,[]),data,'No selection returns original bytes');
 const clean=await removeWatermarks(data,found.map(c=>c.id));assert.deepEqual(data,original);assert.deepEqual(await images(clean),await images(data),'Embedded photo bytes must not change');assert.equal((await inspectWatermarks(clean)).length,0);
 assert.equal((await PDFDocument.load(clean)).getPageCount(),(await PDFDocument.load(data)).getPageCount());
 if(found.length){const partial=await removeWatermarks(data,[found[0].id]);assert.equal((await inspectWatermarks(partial)).length,1);}
 await assert.rejects(removeWatermarks(data,['999/999']));
 fs.writeFileSync(`work/watermark-qa/${name}-clean.pdf`,clean);console.log('PASS',name,'candidate count, removal, original preservation, untouched images, selected pages');
}
// Shared nested forms: removing one invocation must not change another.
const doc=await PDFDocument.create(),page=doc.addPage([600,400]),ctx=doc.context;
const gs=ctx.obj({ca:.2,CA:.2});const overlay=ctx.register(ctx.flateStream('/Fade gs\n'+Array.from({length:10},(_,i)=>`${i*20} ${i*15} 15 15 re f`).join('\n'),{Type:'XObject',Subtype:'Form',BBox:[0,0,300,300],Resources:{ExtGState:{Fade:gs}}}));
const photo=ctx.register(ctx.flateStream(new Uint8Array([0,0,0]),{Type:'XObject',Subtype:'Image',Width:1,Height:1,ColorSpace:'DeviceRGB',BitsPerComponent:8}));
const parent=ctx.register(ctx.flateStream('/Photo Do /Overlay Do',{Type:'XObject',Subtype:'Form',BBox:[0,0,600,400],Resources:{XObject:{Photo:photo,Overlay:overlay}}}));
page.node.set(PDFName.of('Resources'),ctx.obj({XObject:{Shared:parent}}));page.node.set(PDFName.of('Contents'),ctx.register(ctx.flateStream('/Shared Do /Shared Do')));
const source=await doc.save(),c=await inspectWatermarks(source);assert.equal(c.length,2);const partial=await removeWatermarks(source,[c[0].id]);assert.equal((await inspectWatermarks(partial)).length,1,'Shared form invocation isolation');
console.log('PASS shared nested forms: only selected invocation removed');
