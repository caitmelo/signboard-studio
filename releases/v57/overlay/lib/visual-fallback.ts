import {PDFDocument,PDFDict,PDFName,PDFStream} from 'pdf-lib';
import {MM,scenePdf,type Scene} from './design-scene';
import {prepareReference,draftToScene} from './image-draft';
import type {Analysis,PrintSpec} from './template-types';

/** Conservative structural trigger. Ordinary PDFs and image-only pages stay on Path A. */
export async function visualFallbackPages(data:Uint8Array,indexes:number[]){
 const doc=await PDFDocument.load(data),result:number[]=[];
 for(const index of indexes){
  let suspicious=0,total=0;const seen=new Set<PDFDict>();
  const walk=(resources:PDFDict|undefined)=>{if(!resources||seen.has(resources))return;seen.add(resources);
   const fonts=resources.lookupMaybe(PDFName.of('Font'),PDFDict);
   for(const key of fonts?.keys()??[]){const font=fonts!.lookup(key);if(!(font instanceof PDFDict))continue;total++;
    if(font.get(PDFName.of('Subtype'))?.toString()==='/Type3'&&!font.has(PDFName.of('BaseFont')))suspicious++;
   }
   const objects=resources.lookupMaybe(PDFName.of('XObject'),PDFDict);
   for(const key of objects?.keys()??[]){const object=objects!.lookup(key);if(object instanceof PDFStream&&object.dict.get(PDFName.of('Subtype'))?.toString()==='/Form')walk(object.dict.lookupMaybe(PDFName.of('Resources'),PDFDict));}
  };walk(doc.getPage(index).node.Resources());
  if(suspicious>=2&&suspicious/total>=.5)result.push(index);
 }
 return result;
}

export async function reconstructUnreliablePages(data:Uint8Array,name:string,indexes:number[],specs:Map<number,{spec:PrintSpec}>,status:(message:string)=>void){
 const candidates=await visualFallbackPages(data,indexes),scenes=new Map<number,Scene>();
 if(!candidates.length)return{data,scenes};
 const available=await fetch('/api/design-draft');
 if(!available.ok||!(await available.json() as {available?:boolean}).available)throw Error('This PDF needs Path B visual reconstruction, but image recognition is unavailable. Your original is unchanged. Try again once recognition is connected.');
 const doc=await PDFDocument.load(data);
 for(const index of candidates){
  status(`Path B · reconstructing page ${index+1} visually…`);
  const original=doc.getPage(index);
  if(original.getRotation().angle!==0||original.getMediaBox().x!==0||original.getMediaBox().y!==0)throw Error('Path B needs an unrotated PDF with a zero page origin. Export this PDF with normal page orientation and try again.');
  const crop=original.getCropBox();if(crop.x!==0||crop.y!==0||Math.abs(crop.width-original.getWidth())>.1||Math.abs(crop.height-original.getHeight())>.1)throw Error('Path B needs matching crop and media page bounds. Export this PDF without a cropped page viewport and try again.');
  const reference=await prepareReference(new File([data.slice().buffer],name,{type:'application/pdf'}),index);
  const response=await fetch('/api/design-draft',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:reference.preview,width:reference.pixelWidth,height:reference.pixelHeight}),signal:AbortSignal.timeout(240000)});
  const raw=await response.json() as {error?:string};if(!response.ok)throw Error(raw.error||'Visual reconstruction failed. Your original is unchanged; try again.');
  const spec={...specs.get(index)!.spec,faceWidth:original.getWidth()/MM,faceHeight:original.getHeight()/MM,bleed:0};
  const scene=await draftToScene(raw,reference.preview,spec,`${name} — Page ${index+1}`);
  if(!scene.pages[0].elements.some(e=>e.kind==='text'&&e.text.trim()))throw Error(`Path B found no editable text on page ${index+1}. Your original is unchanged; try again.`);
  const replacement=await PDFDocument.load(await scenePdf(scene));const [page]=await doc.copyPages(replacement,[0]);
  for(const key of ['MediaBox','CropBox','TrimBox','BleedBox','ArtBox']){const value=original.node.get(PDFName.of(key));if(value)page.node.set(PDFName.of(key),value);}
  doc.removePage(index);doc.insertPage(index,page);scenes.set(index,scene);
 }
 return{data:await doc.save(),scenes};
}

/** Keep the visual recogniser's paragraphs as groups instead of regrouping PDF fragments. */
export function applyVisualGroups(analysis:Analysis,scene:Scene){
 const used=new Set<string>();analysis.groups=[];
 for(const e of scene.pages[0].elements){
  const x=e.x*MM,y=analysis.height-(e.y+e.h)*MM,w=e.w*MM,h=e.h*MM;
  if(e.kind==='text'){
   const fields=analysis.runs.filter(r=>!used.has(r.id)&&r.x>=x-.5&&r.x<x+w+.5&&r.y>=y-.5&&r.y<y+h+.5);
   for(const r of fields){used.add(r.id);r.role='custom';r.label=e.label;r.clip=[x,y,x+w,y+h];}
   if(fields.length)analysis.groups.push({id:e.id,key:'field_'+e.id.replace(/-/g,''),kind:'text',label:e.label,fieldIds:fields.map(r=>r.id)});
  }
 }
 analysis.warnings.push('Path B: reconstructed visually because the PDF uses fragmented, unnamed Type 3 fonts. Check all wording, spacing, fonts and image crops against the original before use. Cropped images come from the preview; replace with original high-resolution images for professional printing.');
}
