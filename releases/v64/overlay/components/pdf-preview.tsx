"use client";
import { useEffect, useRef, useState } from "react";
import { Loader2, AlertCircle } from "lucide-react";
import type { TextRun, MediaSlot } from "@/lib/template-types";

export function PdfPreview({data,pageIndex=0,zoom=1,finishedSize=false,runs=[],media=[],selectionMode=false,onRegionSelected,selected,onSelect,onThumbnail,label="PDF artwork"}:{data:Uint8Array|null;pageIndex?:number;zoom?:number;finishedSize?:boolean;runs?:TextRun[];media?:MediaSlot[];selectionMode?:boolean;onRegionSelected?:(box:{x:number;y:number;width:number;height:number})=>void;selected?:string;onSelect?:(id:string)=>void;onThumbnail?:(blob:Blob)=>void;label?:string}){
  const root=useRef<HTMLDivElement>(null);const canvas=useRef<HTMLCanvasElement>(null);const counter=useRef(0);const thumbnail=useRef(onThumbnail);thumbnail.current=onThumbnail;
  const dragStart=useRef<number[]|null>(null);const[selection,setSelection]=useState<number[][]|null>(null);
  const[size,setSize]=useState([1,1.45]);const[busy,setBusy]=useState(false);const[error,setError]=useState("");
  useEffect(()=>{
    const current=++counter.current;if(!data)return;
    const scroller=root.current?.closest('.import-preview');
    const scrollTop=scroller?.scrollTop??0,scrollLeft=scroller?.scrollLeft??0;
    setBusy(true);setError("");let loading:any;const timer=setTimeout(async()=>{
      try{const url="/pdfjs/pdf.mjs";const lib=await import(/* @vite-ignore */ url);lib.GlobalWorkerOptions.workerSrc="/pdfjs/pdf.worker.mjs";
        let previewData=data.slice();
        if(finishedSize){const {PDFDocument}=await import("pdf-lib");const pdf=await PDFDocument.load(previewData);for(const p of pdf.getPages()){const t=p.getTrimBox();p.setCropBox(t.x,t.y,t.width,t.height);}previewData=new Uint8Array(await pdf.save());}
        loading=lib.getDocument({data:previewData,useWasm:true,useWorkerFetch:true,wasmUrl:"/pdfjs/wasm/",iccUrl:"/template/colour/",standardFontDataUrl:"/pdfjs/standard_fonts/",isEvalSupported:false});
        const doc=await loading.promise;const page=await doc.getPage(pageIndex+1);const natural=page.getViewport({scale:1});const viewport=page.getViewport({scale:Math.min(1000*Math.min(zoom,3)/natural.width,2000*Math.min(zoom,3)/natural.height)});
        const buffer=document.createElement("canvas");buffer.width=Math.ceil(viewport.width);buffer.height=Math.ceil(viewport.height);
        await page.render({canvas:buffer,canvasContext:buffer.getContext("2d"),viewport}).promise;
        if(current===counter.current&&canvas.current){setSize([natural.width,natural.height]);canvas.current.width=buffer.width;canvas.current.height=buffer.height;canvas.current.getContext("2d")?.drawImage(buffer,0,0);setBusy(false);requestAnimationFrame(()=>{if(current===counter.current&&scroller){scroller.scrollTop=scrollTop;scroller.scrollLeft=scrollLeft;}});if(thumbnail.current){const small=document.createElement("canvas");const ratio=Math.min(360/buffer.width,720/buffer.height,1);small.width=Math.round(buffer.width*ratio);small.height=Math.round(buffer.height*ratio);small.getContext("2d")?.drawImage(buffer,0,0,small.width,small.height);small.toBlob(blob=>{if(blob&&current===counter.current)thumbnail.current?.(blob);},"image/png");}}
        await doc.destroy();
      }catch(e){if(current===counter.current){setError(e instanceof Error?e.message:"The PDF preview could not load.");setBusy(false);}}
    },120);
    return()=>{clearTimeout(timer);loading?.destroy().catch(()=>{});};
  },[data,pageIndex,zoom,finishedSize]);
  function point(e:React.PointerEvent<HTMLDivElement>){const r=e.currentTarget.getBoundingClientRect();return[Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))];}
  return <div ref={root} className="import-pdf" style={{aspectRatio:`${size[0]}/${size[1]}`}}><canvas ref={canvas} aria-label={label}/>{selectionMode&&<div className="qr-region-picker" onPointerDown={e=>{e.currentTarget.setPointerCapture(e.pointerId);const p=point(e);dragStart.current=p;setSelection([p,p]);}} onPointerMove={e=>{if(dragStart.current)setSelection([dragStart.current,point(e)]);}} onPointerUp={e=>{if(!dragStart.current)return;const a=dragStart.current,b=point(e);dragStart.current=null;setSelection(null);const x=Math.min(a[0],b[0])*size[0],y=(1-Math.max(a[1],b[1]))*size[1],width=Math.abs(a[0]-b[0])*size[0],height=Math.abs(a[1]-b[1])*size[1];if(width>5&&height>5)onRegionSelected?.({x,y,width,height});}} onPointerCancel={()=>{dragStart.current=null;setSelection(null);}}>{selection&&<div className="qr-region-rectangle" style={{left:`${Math.min(selection[0][0],selection[1][0])*100}%`,top:`${Math.min(selection[0][1],selection[1][1])*100}%`,width:`${Math.abs(selection[0][0]-selection[1][0])*100}%`,height:`${Math.abs(selection[0][1]-selection[1][1])*100}%`}}/>}</div>}{!busy&&!error&&media.map(slot=><button type="button" key={slot.id} aria-label={`Select ${slot.label}`} onClick={()=>onSelect?.(slot.id)} className={`media-hotspot ${selected===slot.id?'selected':''}`} style={{left:`${slot.x/size[0]*100}%`,top:`${(size[1]-slot.y-slot.height)/size[1]*100}%`,width:`${slot.width/size[0]*100}%`,height:`${slot.height/size[1]*100}%`}}><span>{slot.label}</span></button>)}{!busy&&!error&&runs.map(run=><button key={run.id} type="button" title={`${run.text} · ${run.role==="fixed"?"Fixed artwork":run.label}`} aria-label={`Select ${run.text}`} className={`text-hotspot ${run.role!=="fixed"?"dynamic":""} ${selected===run.id?"selected":""}`} style={{left:`${run.x/size[0]*100}%`,top:`${(size[1]-run.y-run.size)/size[1]*100}%`,width:`${Math.max(run.width,run.size*.5)/size[0]*100}%`,height:`${run.size*1.35/size[1]*100}%`}} onClick={()=>onSelect?.(run.id)}/>)}{busy&&<div className="pdf-progress"><Loader2 className="spin" size={16}/> Updating preview</div>}{error&&<div className="pdf-error"><AlertCircle size={22}/><p>{error}</p></div>}</div>;
}
