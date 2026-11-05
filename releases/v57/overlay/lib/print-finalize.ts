import {detachPrintText,attachPrintText} from './print-text-layer';
import {PDFDocument,PDFDict,PDFName,PDFRawStream} from 'pdf-lib';
import type {SavedTemplate} from './template-types';
import {isSignboard} from './print-specs';
import {profileBytes} from './document-colour';
async function printBoxes(input:Uint8Array){const doc=await PDFDocument.load(input);return doc.getPages().map(page=>[page.getMediaBox(),page.getTrimBox(),page.getBleedBox()]);}
/** pdfwrite converts transparency rather than relabelling a PDF 1.7 header. */
export async function finalizePrintPdf(input:Uint8Array,template:SavedTemplate,icc:Uint8Array){
 const boxes=await printBoxes(input);
 const {background,layers}=await detachPrintText(input);input=background;
 const signboard=isSignboard(template.spec);
 const version=signboard&&template.spec.product!=='pointer'?'1.7':'1.3';
 const pdf=await new Promise<Uint8Array>((resolve,reject)=>{
  const worker=new Worker('/print/worker.js?v=47');
  const timer=setTimeout(()=>{worker.terminate();reject(Error('Print conversion timed out. Please retry with one document open.'));},180000);
  const done=()=>{clearTimeout(timer);worker.terminate();};
  worker.onmessage=({data})=>{done();data.error?reject(Error(data.error)):resolve(data.pdf);};
  worker.onerror=()=>{done();reject(Error('The print converter could not start. Reload and try again.'));};
  try{worker.postMessage({pdf:input,version,icc:template.outputProfile?profileBytes(template.outputProfile):icc},[input.buffer as ArrayBuffer]);}catch(e){done();reject(e);}
 });
 if(new TextDecoder().decode(pdf.subarray(0,8))!==`%PDF-${version}`)throw Error('Print export did not produce PDF 1.3.');
 const after=await PDFDocument.load(pdf);
 if(boxes.length!==after.getPageCount())throw Error('Print conversion changed the page count.');
 for(const [i,page]of after.getPages().entries())for(const key of ['getMediaBox','getTrimBox','getBleedBox'] as const){const a=boxes[i][['getMediaBox','getTrimBox','getBleedBox'].indexOf(key)],b=page[key]();if(['x','y','width','height'].some(k=>Math.abs(a[k as keyof typeof a]-b[k as keyof typeof b])>.1))throw Error('Print conversion changed the print dimensions.');}
 for(const [,object]of after.context.enumerateIndirectObjects()){
  const d=object instanceof PDFRawStream?object.dict:object instanceof PDFDict?object:null;if(!d)continue;
  if(d.get(PDFName.of('Type'))?.toString()==='/Font'||(version==='1.3'&&d.has(PDFName.of('SMask'))))throw Error('Print conversion left fonts or transparency in the file.');
  const cs=d.get(PDFName.of('ColorSpace'))?.toString()??'';if(/DeviceRGB|Separation|DeviceN/.test(cs))throw Error('Print conversion left a non-process colour space.');
 }
 return attachPrintText(pdf,layers,version);
}
