"use client";
import {useState} from 'react';
import {Button} from './ui/button';
import {FontUpload} from './font-upload';
import {fontFromFile,resetFontCache} from '@/lib/template-engine';
import {acceptAlternative,type FontNeed} from '@/lib/font-choices';
import type {FontData} from '@/lib/template-types';
export async function uploadLicensedFont(name:string,file:File,licensed:boolean){
 if(!licensed)throw Error('Confirm you have licensed permission to use this font.');
 if(file.size>12*1024*1024)throw Error('Choose a font smaller than 12 MB.');
 const bytes=new Uint8Array(await file.arrayBuffer()),font=fontFromFile(bytes,name);
 const result=await fetch(`/api/fonts/installed?${new URLSearchParams({name})}`,{method:'PUT',headers:{'Content-Type':'application/octet-stream','X-Font-License-Confirmed':'true'},body:bytes.slice().buffer});
 if(!result.ok){const body=await result.json() as {error?:string};throw Error(body.error??'The font could not be saved. Please retry.');}
 resetFontCache();return {...font,choice:{kind:'upload' as const,licenseConfirmed:true,confirmedAt:new Date().toISOString()}};
}
export function MissingFonts({needs,onResolve,disabled=false}:{needs:FontNeed[];onResolve:(name:string,font:FontData)=>void|Promise<void>;disabled?:boolean}){
 const[busy,setBusy]=useState(''),[error,setError]=useState('');if(!needs.length)return null;
 async function resolve(need:FontNeed,file?:File,licensed=false){if(busy||disabled)return;setBusy(need.name);setError('');try{const font=file?await uploadLicensedFont(need.name,file,licensed):acceptAlternative(need.name,need.font);await onResolve(need.name,font);}catch(e){setError(e instanceof Error?e.message:'Could not apply this font.');}finally{setBusy('');}}
 return <section className="missing-fonts" aria-label="Missing fonts"><h2>Choose how to handle missing fonts</h2><p>We recognised these fonts, but don’t have the full originals. Choose an option for each before saving or downloading.</p>{needs.map(need=><div className="missing-font-card" key={need.name}><h3>{need.name}</h3><p>Page{need.pages.length>1?'s':''} {need.pages.join(', ')}{need.font?.subset?' · Only some characters are embedded in the PDF.':''}</p><div className="font-choice-options"><div><strong>1. Upload the original font</strong><FontUpload name={need.name} busy={!!busy||disabled} onUpload={(file,licensed)=>void resolve(need,file,licensed)}/></div><div><strong>2. Use the closest available alternative</strong><p>Suggested: <b>{need.replacement}</b>. Original letters keep their appearance and position; missing characters use this alternative. Check the proof, as new lettering may look slightly different.</p>{/icon|symbol|dingbat/i.test(need.name)&&<p>Private-use icons may still require the original font; we won’t guess their meaning.</p>}<Button type="button" disabled={!!busy||disabled} onClick={()=>void resolve(need)}>Proceed with {need.replacement}</Button></div></div>{busy===need.name&&<p role="status">Applying font…</p>}</div>)}{error&&<p role="alert" className="notice error">{error}</p>}</section>;
}
