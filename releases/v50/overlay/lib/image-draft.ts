import {fitDraftText} from './draft-text-fit';
import {loadImage,newElement,MM,type Scene} from './design-scene';
import {draftSchema,type ImageDraft} from './image-draft-schema';
import type {PrintSpec} from './template-types';
export function draftElements(draft:ImageDraft,spec:PrintSpec,aspect:number){const width=Math.min(spec.faceWidth,spec.faceHeight*aspect),height=width/aspect,ox=(spec.faceWidth-width)/2,oy=(spec.faceHeight-height)/2;return draft.elements.map(item=>{const e=newElement(item.kind);e.label=item.label;e.x=ox+item.x*width;e.y=oy+item.y*height;e.w=Math.max(.5,Math.min(item.w,1-item.x)*width);e.h=Math.max(.5,Math.min(item.h,1-item.y)*height);e.text=item.text;e.color=item.color;e.align=item.align;e.shape=item.shape;e.font=item.font==='serif'?`NimbusRomNo9L-${item.bold?'Med':'Reg'}${item.italic?'Ita':''}`:`Poppins-${item.bold?(item.italic?'BoldItalic':'Bold'):(item.italic?'Italic':'Regular')}`;e.size=Math.max(1,item.fontHeight*height*MM);e.lineHeight=item.lineHeight??1.15;return e})}
export type PreparedReference={preview:string;aspect:number;name:string;pixelWidth:number;pixelHeight:number;fileName:string;pageCount:number;pageIndex:number;isPdf:boolean};
export async function prepareReference(file:File,pageIndex=0):Promise<PreparedReference>{
 
 const header=new TextDecoder().decode(await file.slice(0,1024).arrayBuffer());
 const isPdf=file.type==='application/pdf'||/\.pdf$/i.test(file.name)||header.includes('%PDF-');
 const name=file.name.replace(/\.[^.]+$/,'');
 if(isPdf){
  const url='/pdfjs/pdf.mjs';const lib=await import(/* @vite-ignore */ url);lib.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
  const task=lib.getDocument({data:new Uint8Array(await file.arrayBuffer()),useWasm:true,useWorkerFetch:true,wasmUrl:'/pdfjs/wasm/',iccUrl:'/template/colour/',standardFontDataUrl:'/pdfjs/standard_fonts/',isEvalSupported:false});
  try{const doc=await task.promise;if(pageIndex<0||pageIndex>=doc.numPages)throw Error('Choose a page in this PDF.');const page=await doc.getPage(pageIndex+1),natural=page.getViewport({scale:1}),viewport=page.getViewport({scale:Math.min(2048/natural.width,2048/natural.height)});const c=document.createElement('canvas');c.width=Math.ceil(viewport.width);c.height=Math.ceil(viewport.height);await page.render({canvas:c,canvasContext:c.getContext('2d'),viewport,background:'#ffffff'}).promise;return{preview:c.toDataURL('image/jpeg',.95),pixelWidth:c.width,pixelHeight:c.height,aspect:natural.width/natural.height,name:doc.numPages>1?`${name} — Page ${pageIndex+1}`:name,fileName:file.name,pageCount:doc.numPages,pageIndex,isPdf:true};}
  catch(e){throw Error((e as Error).name==='PasswordException'?'This PDF is password protected. Upload an unlocked copy.':'This PDF could not be opened. Check the file and try again.');}
  finally{await task.destroy();}
 }
 const url=URL.createObjectURL(file);
 try{let img:HTMLImageElement;try{img=await loadImage(url)}catch{throw Error('This file cannot be previewed here. Use PDF, JPG, PNG, WebP, GIF, BMP, SVG or AVIF. For HEIC, TIFF or editing-project files, export a PDF or PNG.');}
 const scale=Math.min(1,2048/Math.max(img.width,img.height)),c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.width*scale));c.height=Math.max(1,Math.round(img.height*scale));const g=c.getContext('2d')!;g.fillStyle='#ffffff';g.fillRect(0,0,c.width,c.height);g.drawImage(img,0,0,c.width,c.height);return{preview:c.toDataURL('image/jpeg',.95),pixelWidth:c.width,pixelHeight:c.height,aspect:img.width/img.height,name,fileName:file.name,pageCount:1,pageIndex:0,isPdf:false};}
 finally{URL.revokeObjectURL(url)}
}
export async function draftToScene(raw:unknown,reference:string,spec:PrintSpec,name:string):Promise<Scene>{const draft=draftSchema.parse(raw),img=await loadImage(reference),elements=draftElements(draft,spec,img.width/img.height);for(let i=0;i<elements.length;i++){const e=elements[i],box=draft.elements[i];if(e.kind!=='image')continue;e.fit='contain';const c=document.createElement('canvas');c.width=Math.max(1,Math.round(Math.min(box.w,1-box.x)*img.width));c.height=Math.max(1,Math.round(Math.min(box.h,1-box.y)*img.height));c.getContext('2d')!.drawImage(img,box.x*img.width,box.y*img.height,c.width,c.height,0,0,c.width,c.height);e.src=c.toDataURL('image/png')}
 const cleaned=removeDuplicateDraftText(elements);
 await fitDraftText(cleaned);
 return{version:1,name,spec,pages:[{background:draft.background,elements:cleaned}],reference:{src:reference,notes:['Draft from image: check all text, spacing and fonts. Replace screenshot photo crops with original images before printing.',...draft.notes]}}}

// A recogniser can emit both a paragraph and its inline bold address. Keep the
// complete editable paragraph, never draw the same words over it a second time.
export function removeDuplicateDraftText(elements:ReturnType<typeof draftElements>){
 const normal=(s:string)=>s.replace(/\s+/g,' ').trim();
 return elements.filter((e,index)=>e.kind!=='text'||!elements.some((other,j)=>{
  if(index===j||other.kind!=='text')return false;
  const text=normal(e.text),parent=normal(other.text);
  if(!text||!parent.includes(text)||(parent.length===text.length&&j>index))return false;
  const area=Math.max(0,Math.min(e.x+e.w,other.x+other.w)-Math.max(e.x,other.x))*Math.max(0,Math.min(e.y+e.h,other.y+other.h)-Math.max(e.y,other.y));
  return area/(e.w*e.h)>.6;
 }));
}
