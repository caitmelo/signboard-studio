import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';
import type {PrintSpec} from './template-types';
import {bleedInsets,isSignboard,needsBleed} from './print-specs';
import {colourConverter} from './template-colour';
export type EdgeRaster={width:number;height:number;data:Uint8Array|Uint8ClampedArray};
export function requiresPaperBleed(spec:PrintSpec){return needsBleed(spec)&&!isSignboard(spec)&&!spec.sourceIncludesBleed;}

// Extend the outermost artwork pixels through the bleed only. The trim face,
// its original vector artwork, text positions and photo framing are unchanged.
export async function extendPaperBleed(data:Uint8Array,index:number,spec:PrintSpec,raster:EdgeRaster,table:Uint8Array){
 if(!requiresPaperBleed(spec))return data;
 const doc=await PDFDocument.load(data),page=doc.getPage(index),MM=72/25.4,b=bleedInsets(spec);
 const w=page.getWidth(),h=page.getHeight(),factor=w/(spec.faceWidth*MM),left=b.left*MM*factor,right=b.right*MM*factor,top=b.top*MM*factor,bottom=b.bottom*MM*factor;
 if(Math.abs(w/h-spec.faceWidth/spec.faceHeight)>.005)throw Error('Confirm the page proportions before adding bleed.');
 const {width:rw,height:rh}=raster;if(rw<1||rh<1||raster.data.length!==rw*rh*4)throw Error('Invalid artwork edge image');
 const convert=colourConverter(table),resources=page.node.Resources()??doc.context.obj({});
 const objects=resources.lookupMaybe(PDFName.of('XObject'),PDFDict)??doc.context.obj({});
 resources.set(PDFName.of('XObject'),objects);page.node.set(PDFName.of('Resources'),resources);
 const strips=[{x:0,y:bottom,w:left,h,points:Array.from({length:rh},(_,y)=>y*rw),iw:1,ih:rh},{x:left+w,y:bottom,w:right,h,points:Array.from({length:rh},(_,y)=>y*rw+rw-1),iw:1,ih:rh},{x:left,y:bottom+h,w,h:top,points:Array.from({length:rw},(_,x)=>x),iw:rw,ih:1},{x:left,y:0,w,h:bottom,points:Array.from({length:rw},(_,x)=>(rh-1)*rw+x),iw:rw,ih:1},...[[0,0,left,bottom,(rh-1)*rw],[left+w,0,right,bottom,rh*rw-1],[0,bottom+h,left,top,0],[left+w,bottom+h,right,top,rw-1]].map(([x,y,w,h,p])=>({x,y,w,h,points:[p],iw:1,ih:1}))];
 let commands='';for(const [i,s]of strips.entries()){const pixels=new Uint8Array(s.points.length*4);s.points.forEach((p,j)=>pixels.set(convert([raster.data[p*4]/255,raster.data[p*4+1]/255,raster.data[p*4+2]/255]).map(v=>Math.round(v*255)),j*4));const key=PDFName.of('StudioBleed'+i);if(objects.has(key))throw Error('This artwork already contains generated bleed');objects.set(key,doc.context.register(doc.context.flateStream(pixels,{Type:'XObject',Subtype:'Image',Width:s.iw,Height:s.ih,ColorSpace:'DeviceCMYK',BitsPerComponent:8,Interpolate:true,StudioGeneratedBleed:true})));commands+=`q ${s.w} 0 0 ${s.h} ${s.x} ${s.y} cm ${key} Do Q\n`;}
 const origin=page.getMediaBox();page.translateContent(left-origin.x,bottom-origin.y);page.node.addContentStream(doc.context.register(doc.context.flateStream(commands)));
 page.setMediaBox(0,0,w+left+right,h+top+bottom);page.setCropBox(0,0,w+left+right,h+top+bottom);page.setBleedBox(0,0,w+left+right,h+top+bottom);page.setTrimBox(left,bottom,w,h);
 return doc.save();
}
export async function renderBleedEdges(data:Uint8Array,index:number):Promise<EdgeRaster>{
 const url='/pdfjs/pdf.mjs',lib=await import(/* @vite-ignore */url);lib.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
 const task=lib.getDocument({data:data.slice(),isEvalSupported:false,wasmUrl:'/pdfjs/wasm/',standardFontDataUrl:'/pdfjs/standard_fonts/'});
 try{const doc=await task.promise,page=await doc.getPage(index+1),original=page.getViewport({scale:1}),scale=Math.min(300/72,Math.sqrt(12_000_000/(original.width*original.height))),viewport=page.getViewport({scale}),canvas=document.createElement('canvas');canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);try{const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('Artwork preview could not load');await page.render({canvas,canvasContext:context,viewport,background:'rgb(255,255,255)'}).promise;return{width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data}}finally{canvas.width=canvas.height=0}}finally{await task.destroy()}
}
