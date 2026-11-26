"use client";
import {useEffect,useRef,useState} from 'react';
import {Button} from './ui/button';
import {sendOffDesign,type SendOffInput,type FinalDesign} from '@/lib/send-off';
import {saveFinalDesign} from '@/lib/final-designs';
import {evaluateTemplate,loadEngineAssets} from '@/lib/template-engine';
import {evaluateMedia} from '@/lib/template-media';
import {missingFonts} from '@/lib/font-choices';
import {renderPythonTemplate} from '@/lib/python-engine';
export function SendOff({input,disabled=false,onBusyChange}:{input:SendOffInput|null;disabled?:boolean;onBusyChange?:(busy:boolean)=>void}){
 const[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState<FinalDesign|null>(null),[url,setUrl]=useState('');const lock=useRef(false);
 // Any edit invalidates the visible completion, but never overwrites the saved final.
 useEffect(()=>{setResult(null);setError('');},[input?.base,input?.manifest,input?.values,input?.content,input?.media,input?.oneAgent,input?.cropMarks]);
 useEffect(()=>{if(!result){setUrl('');return;}const next=URL.createObjectURL(new Blob([result.pdf.slice().buffer],{type:'application/pdf'}));setUrl(next);const a=document.createElement('a');a.href=next;a.download=result.filename;document.body.appendChild(a);a.click();a.remove();return()=>URL.revokeObjectURL(next);},[result]);
 async function send(){if(lock.current||disabled||!input)return;lock.current=true;setBusy(true);setError('');onBusyChange?.(true);try{const snapshot=structuredClone(input);const final=await sendOffDesign(snapshot,{validate:s=>{const text=evaluateTemplate(s.manifest,s.values,s.oneAgent,s.content),media=evaluateMedia(s.manifest,s.media);const issues=[...s.manifest.printIssues,...text.errors,...text.printIssues,...media.errors,...media.printIssues];if(missingFonts(s.manifest.pages??[s.manifest],s.values).length)issues.push('Resolve the missing fonts before sending off.');if(issues.length)throw Error([...new Set(issues)].join(' '));},render:async s=>renderPythonTemplate(s.base,s.manifest,s.values,s.oneAgent,await loadEngineAssets(),s.media,s.content,'print',s.cropMarks),persist:saveFinalDesign});setResult(final);}catch(e){setError(e instanceof Error?e.message:'Could not save the final. Your design remains open.');}finally{lock.current=false;setBusy(false);onBusyChange?.(false);}}
 return <section aria-label="Send off"><p>Send off approves this design, saves a final copy on this browser and downloads its print PDF.</p>{result?<div role="status"><strong>Approved and saved as final.</strong><p>Your print PDF download has started. Nothing was submitted to a printer or email.</p>{url&&<a href={url} download={result.filename}>Download approved print PDF again</a>}<p><a href={`/finals?id=${result.id}`}>View saved final</a></p></div>:<Button disabled={disabled||busy||!input} onClick={send}>{busy?'Preparing and saving final…':'Send off'}</Button>}{error&&<p role="alert" className="notice error">{error}</p>}</section>;
}
