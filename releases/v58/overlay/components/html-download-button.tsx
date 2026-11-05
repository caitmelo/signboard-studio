'use client';
import {useState} from 'react';
import {Code2,Loader2} from 'lucide-react';
import {Button} from './ui/button';
import {pdfToHtml} from '@/lib/pdf-html';

export function HtmlDownloadButton({getPdf,name,disabled=false,className}:{getPdf:()=>Promise<Uint8Array>;name:string;disabled?:boolean;className?:string}){
 const[busy,setBusy]=useState(false),[progress,setProgress]=useState(''),[error,setError]=useState('');
 async function download(){
  if(busy||disabled)return;setBusy(true);setError('');setProgress('Preparing HTML…');
  try{
   const html=await pdfToHtml(await getPdf(),name,(page,total)=>setProgress(`Preparing HTML ${page}/${total}…`));
   const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
   const link=document.createElement('a');link.href=url;link.download=name.replace(/[^\p{L}\p{N}_-]+/gu,'_')+'.html';
   document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(e instanceof Error?e.message:'HTML could not be generated. Please try again.');}
  finally{setBusy(false);setProgress('');}
 }
 return <><Button variant="outline" size="lg" className={className} disabled={disabled||busy} onClick={download}>{busy?<Loader2 size={18} className="spin"/>:<Code2 size={18}/>}<span aria-live="polite">{busy?progress:'Download HTML'}</span></Button>{error&&<p className="notice error" role="alert">{error}</p>}</>;
}
