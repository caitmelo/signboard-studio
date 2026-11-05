import {PDFDocument} from 'pdf-lib';
/** Rebase the full PDF coordinate system, never just its boxes. */
export async function normalizePageOrigins(data:Uint8Array){
 const doc=await PDFDocument.load(data,{updateMetadata:false});let changed=false;
 for(const page of doc.getPages()){
  const media=page.getMediaBox();if(Math.abs(media.x)<1e-7&&Math.abs(media.y)<1e-7)continue;
  const crop=page.getCropBox(),trim=page.getTrimBox(),bleed=page.getBleedBox(),art=page.getArtBox();
  page.translateContent(-media.x,-media.y);page.setMediaBox(0,0,media.width,media.height);
  page.setCropBox(crop.x-media.x,crop.y-media.y,crop.width,crop.height);page.setTrimBox(trim.x-media.x,trim.y-media.y,trim.width,trim.height);page.setBleedBox(bleed.x-media.x,bleed.y-media.y,bleed.width,bleed.height);page.setArtBox(art.x-media.x,art.y-media.y,art.width,art.height);changed=true;
 }
 return changed?doc.save():data;
}
