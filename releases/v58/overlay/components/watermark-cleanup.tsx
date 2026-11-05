"use client";
import {useEffect,useRef,useState} from 'react';
import {inspectWatermarks,removeWatermarks,type WatermarkCandidate} from '@/lib/pdf-watermarks';
import {PdfPreview} from '@/components/pdf-preview';
import {Checkbox} from '@/components/ui/checkbox';
import {Button} from '@/components/ui/button';
export function WatermarkCleanup({source,disabled,onChange,onBusyChange}:{source:Uint8Array;disabled:boolean;onChange:(result:{data:Uint8Array;count:number}|null)=>void;onBusyChange:(busy:boolean)=>void}){
 const[candidates,setCandidates]=useState<WatermarkCandidate[]>([]),[selected,setSelected]=useState<string[]>([]),[clean,setClean]=useState<Uint8Array|null>(null),[working,setWorking]=useState(true),[error,setError]=useState(''),[page,setPage]=useState(0),[original,setOriginal]=useState(false);
 const revision=useRef(0),change=useRef(onChange),busy=useRef(onBusyChange);change.current=onChange;busy.current=onBusyChange;
 useEffect(()=>{const current=++revision.current;setWorking(true);busy.current(true);setSelected([]);setClean(null);setCandidates([]);setError('');change.current(null);
  inspectWatermarks(source).then(async found=>{if(current!==revision.current)return;setCandidates(found);setPage(found[0]?.pageIndex??0);if(!found.length)return;const ids=found.map(candidate=>candidate.id);const data=await removeWatermarks(source,ids);if(current!==revision.current)return;setSelected(ids);setClean(data);setOriginal(false);change.current({data,count:ids.length});}).catch(e=>{if(current===revision.current)setError(e instanceof Error?e.message:'Watermark review is unavailable for this PDF. The original artwork is unchanged.');}).finally(()=>{if(current===revision.current){setWorking(false);busy.current(false);}});
  return()=>{revision.current++;busy.current(false);};
 },[source]);
 async function toggle(candidate:WatermarkCandidate,checked:boolean){const next=checked?[...selected,candidate.id]:selected.filter(id=>id!==candidate.id),current=++revision.current;setWorking(true);busy.current(true);setError('');
  try{const data=await removeWatermarks(source,next);if(current!==revision.current)return;setSelected(next);setClean(data);setOriginal(false);setPage(candidate.pageIndex);change.current(next.length?{data,count:next.length}:null);}
  catch(e){if(current===revision.current)setError(e instanceof Error?e.message:'The overlay could not be removed.');}
  finally{if(current===revision.current){setWorking(false);busy.current(false);}}
 }
 return <section className="watermark-cleanup" aria-label="Proof watermark removal"><h3>Remove proof watermarks</h3><p className="help-text">Detected proof watermarks are removed automatically. Your original PDF is kept unchanged.</p>
 {working&&<p role="status">{candidates.length?'Updating watermark preview…':'Checking for separate proof overlays…'}</p>}
 {error&&<p className="notice error" role="alert">{error}</p>}
 {!working&&!error&&!candidates.length&&<p className="help-text">No removable proof overlay was detected. Watermarks merged into a photo or flattened artwork need a clean source.</p>}
 {candidates.map((c,i)=><label className="correction-choice" key={c.id}><Checkbox disabled={disabled||working} checked={selected.includes(c.id)} onCheckedChange={v=>void toggle(c,v===true)}/><span>Remove overlay {i+1} · page {c.pageIndex+1}</span></label>)}
 {candidates.length>0&&<><p className="help-text">Removal is already applied. Untick any overlay you want to keep, or compare the original below.</p><div className="document-setup-actions"><Button type="button" variant={original?'default':'outline'} onClick={()=>setOriginal(true)}>Original</Button><Button type="button" variant={!original?'default':'outline'} onClick={()=>setOriginal(false)}>Without selected watermarks</Button></div><label className="control-label">Watermark preview page <select aria-label="Watermark preview page" value={page} onChange={e=>setPage(Number(e.target.value))}>{[...new Set(candidates.map(c=>c.pageIndex))].map(i=><option value={i} key={i}>Page {i+1}</option>)}</select></label><PdfPreview data={original?source:clean??source} pageIndex={page} label={original?'Original PDF with watermark':'PDF after selected watermark removal'}/><p role="status" className="help-text">{selected.length?`${selected.length} overlay${selected.length===1?'':'s'} removed from this import. Open design to continue with the cleaned PDF.`:'No overlays selected. The original PDF will be used.'}</p></>}
 </section>;
}
