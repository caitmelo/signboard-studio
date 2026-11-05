import {PDFDocument,PDFName,PDFArray,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
// Editable text is already outlined in process CMYK. Convert transparent
// background artwork separately so PDF 1.3 flattening cannot rasterise the text.
export async function detachPrintText(input:Uint8Array){
 const doc=await PDFDocument.load(input),layers:Uint8Array[][]=[];
 for(const page of doc.getPages()){
  const value=page.node.Contents(),refs=value instanceof PDFArray?value.asArray():value?[value]:[],keep=[];const text:Uint8Array[]=[];
  for(const ref of refs){const stream=doc.context.lookup(ref);if(stream instanceof PDFRawStream&&stream.dict.has(PDFName.of('StudioVectorText')))text.push(decodePDFRawStream(stream).decode());else keep.push(ref);}
  page.node.set(PDFName.of('Contents'),doc.context.obj(keep));layers.push(text);
 }
 return {background:await doc.save({useObjectStreams:false}),layers};
}
export async function attachPrintText(input:Uint8Array,layers:Uint8Array[][],version:'1.3'|'1.7'){
 const doc=await PDFDocument.load(input);if(doc.getPageCount()!==layers.length)throw Error('Print conversion changed the page count.');
 for(const[i,page]of doc.getPages().entries())for(const raw of layers[i])page.node.addContentStream(doc.context.register(doc.context.flateStream(raw)));
 // The input has already been converted and verified by Ghostscript. Only
 // PDF 1.3 path operators are appended, with object streams disabled. pdf-lib
 // writes a generic 1.7 header; restore the verified version without moving xrefs.
 const output=await doc.save({useObjectStreams:false});output.set(new TextEncoder().encode('%PDF-'+version),0);return output;
}
