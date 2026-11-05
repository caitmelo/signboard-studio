import {PDFDocument} from 'pdf-lib';
const MM=72/25.4;
/** Add marks outside bleed without changing finished size or scaling artwork. */
export async function addCropMarks(input:Uint8Array){
 const doc=await PDFDocument.load(input),pad=8*MM;
 for(const page of doc.getPages()){
  const media=page.getMediaBox(),trim=page.getTrimBox(),bleed=page.getBleedBox();
  const dx=pad-media.x,dy=pad-media.y;page.translateContent(dx,dy);
  page.setMediaBox(0,0,media.width+2*pad,media.height+2*pad);page.setCropBox(0,0,media.width+2*pad,media.height+2*pad);
  page.setTrimBox(trim.x+dx,trim.y+dy,trim.width,trim.height);page.setBleedBox(bleed.x+dx,bleed.y+dy,bleed.width,bleed.height);
  const t=page.getTrimBox(),b=page.getBleedBox(),gap=2*MM,len=4*MM;
  const lines:number[][]=[];
  for(const x of [t.x,t.x+t.width]){lines.push([x,b.y-gap-len,x,b.y-gap],[x,b.y+b.height+gap,x,b.y+b.height+gap+len]);}
  for(const y of [t.y,t.y+t.height]){lines.push([b.x-gap-len,y,b.x-gap,y],[b.x+b.width+gap,y,b.x+b.width+gap+len,y]);}
  const raw=['q','0 0 0 1 K','0.25 w',...lines.map(([x,y,a,c])=>`${x} ${y} m ${a} ${c} l S`),'Q'].join('\n');
  page.node.addContentStream(doc.context.register(doc.context.flateStream(raw)));
 }
 const output=await doc.save({useObjectStreams:false});const version=new TextDecoder().decode(input.subarray(0,8));if(version==='%PDF-1.3'||version==='%PDF-1.7')output.set(new TextEncoder().encode(version));return output;
}
