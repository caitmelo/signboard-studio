"use client";
import {useState,useRef} from 'react';
import {Button} from './ui/button';
export function FontUpload({name,busy,onUpload}:{name:string;busy?:boolean;onUpload:(file:File,licensed:boolean)=>void}){
 const[licensed,setLicensed]=useState(false);const input=useRef<HTMLInputElement>(null);
 return <div className="licensed-font-upload"><label><input type="checkbox" checked={licensed} disabled={busy} onChange={e=>setLicensed(e.target.checked)}/>I confirm I have a licence or permission to use this font in this template and its outputs.</label><Button type="button" variant="outline" disabled={busy||!licensed} onClick={()=>input.current?.click()}>Upload {name}</Button><input ref={input} className="sr-only" type="file" accept=".ttf,.otf,.woff" aria-label={`Upload licensed ${name}`} disabled={busy||!licensed} onChange={e=>{const file=e.target.files?.[0];if(file&&licensed)onUpload(file,true);e.target.value='';}}/></div>;
}
