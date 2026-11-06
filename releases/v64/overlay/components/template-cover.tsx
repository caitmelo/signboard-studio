"use client";
import {useEffect,useRef,useState} from 'react';
import {thumbnailCrop,type ThumbnailFrame} from '@/lib/thumbnail-frame';

export function TemplateCover({id,name}:{id:string;name:string}){
 const root=useRef<HTMLDivElement>(null),canvas=useRef<HTMLCanvasElement>(null);
 const [failed,setFailed]=useState(false),[ready,setReady]=useState(false);
 useEffect(()=>{
  let active=true,started=false;const controller=new AbortController();
  async function draw(){
   if(started)return;started=true;
   try{
    const image=new Image();image.src=`/api/templates/${id}/assets/thumbnail`;
    const [,frame]=await Promise.all([image.decode(),fetch(`/api/templates/${id}/preview-frame`,{signal:controller.signal}).then(async r=>r.ok?await r.json() as ThumbnailFrame:null)]);
    if(!active||!canvas.current)return;
    const crop=frame&&thumbnailCrop(image.naturalWidth,image.naturalHeight,frame);
    const box=crop??{x:0,y:0,width:image.naturalWidth,height:image.naturalHeight};
    canvas.current.width=Math.round(box.width);canvas.current.height=Math.round(box.height);
    canvas.current.getContext('2d')!.drawImage(image,box.x,box.y,box.width,box.height,0,0,canvas.current.width,canvas.current.height);
    setReady(true);
   }catch{if(active)setFailed(true);}
  }
  const observer=new IntersectionObserver(entries=>{if(entries.some(e=>e.isIntersecting)){observer.disconnect();void draw();}},{rootMargin:'200px'});
  if(root.current)observer.observe(root.current);
  return()=>{active=false;controller.abort();observer.disconnect();};
 },[id]);
 return <div ref={root} className="template-cover" aria-busy={!ready&&!failed}>{failed?<img src={`/api/templates/${id}/assets/thumbnail`} alt={`${name} preview`}/>:<canvas ref={canvas} role="img" aria-label={`${name} · finished size preview`} style={{visibility:ready?'visible':'hidden'}}/>}</div>;
}
