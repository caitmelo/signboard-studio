import {addMissingTemplateBleed} from './missing-bleed';
import {addCropMarks} from './crop-marks';
import {finalizePrintPdf} from './print-finalize';
import type {SavedTemplate,MediaValues,ContentValues} from './template-types';
import type {EngineAssets} from './template-engine';
import {evaluateTemplate} from './template-engine';
import {evaluateMedia} from './template-media';
import {normalizeSavedTemplate} from './print-specs';
let worker:Worker|undefined;let seq=0;const pending=new Map<number,{resolve:(v:any)=>void;reject:(e:Error)=>void}>();
export function base64(data:Uint8Array){let s='';for(let i=0;i<data.length;i+=16384)s+=String.fromCharCode(...data.subarray(i,i+16384));return btoa(s);}
function bytes(s:string){return Uint8Array.from(atob(s),c=>c.charCodeAt(0));}
function callWorker(action:string,payload:unknown):Promise<any>{
 if(!worker){worker=new Worker('/python/worker.js?v=47');worker.onmessage=({data})=>{const p=pending.get(data.id);if(!p)return;pending.delete(data.id);data.error?p.reject(new Error(data.error)):p.resolve(data.result);};worker.onerror=()=>{for(const p of pending.values())p.reject(new Error('Python could not start. Reload the page and try again.'));pending.clear();worker?.terminate();worker=undefined;};}
 const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});try{worker!.postMessage({id,action,payload});}catch(e){pending.delete(id);reject(e);}});
}
let runtime:Promise<string>|undefined;
function runtimeKind(){return runtime??=fetch('/runtime.json').then(r=>r.json() as Promise<{engine:string}>).then(v=>v.engine);}
export async function renderPythonTemplate(base:Uint8Array,template:SavedTemplate,values:Record<string,string>,oneAgent:boolean,engineAssets:EngineAssets,media:MediaValues={},content:ContentValues={},mode?:'proof'|'print',cropMarks=false){
 const jobMedia:Record<string,any>={};const assets:Record<string,any>={};
 for(const[key,v]of Object.entries(media)){
  if(v.kind==='qr')jobMedia[key]={url:v.url};
  else if(v.kind==='image'){const assetId=v.image.assetId??key;assets[assetId]={pdfBase64:base64(v.image.pdf),width:v.image.width,height:v.image.height};jobMedia[key]={assetId,fit:v.fit,focalX:v.focalX,focalY:v.focalY};}
  else jobMedia[key]={sourceSlot:v.slotId,fit:v.fit,focalX:v.focalX,focalY:v.focalY};
 }
 template=normalizeSavedTemplate(template);
 const prepared=await addMissingTemplateBleed(base,template);base=prepared.base;template=prepared.template;
 // Setup retains values for fixed runs; only editable keys belong in a render job.
 const textKeys=new Set(template.fields.flatMap(f=>[f.id,...(f.role.startsWith('agent')?[f.role]:[])]));
 values=Object.fromEntries(Object.entries(values).filter(([key])=>textKeys.has(key)));
 const issues=[...template.printIssues,...evaluateTemplate(template,values,oneAgent,content).printIssues,...evaluateMedia(template,media).printIssues];
 if(mode==='print'&&issues.length)throw new Error('Print checks failed: '+issues.join(' '));
 const payload={template,job:{text:values,oneAgent,content,media:jobMedia,mode:mode??(issues.length?'proof':'print')},assets};
 if(await runtimeKind()==='server-python'){
  const r=await fetch('/api/python/render',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,base:base64(base),icc:base64(engineAssets.icc)})});
  if(!r.ok){const e=await r.json() as {errors?:string[];error?:string};throw new Error(e.errors?.join(' ')??e.error??'Python could not generate the PDF.');}const pdf=new Uint8Array(await r.arrayBuffer());return cropMarks&&mode==='print'?addCropMarks(pdf):pdf;
 }
 const result=await callWorker('render',{...payload,baseBytes:base,iccBytes:engineAssets.icc});if(!pending.size){worker?.terminate();worker=undefined;}const pdf=await finalizePrintPdf(result.pdfBytes instanceof Uint8Array?result.pdfBytes:bytes(result.pdf),template,engineAssets.icc);return cropMarks&&mode==='print'?addCropMarks(pdf):pdf;
}
export async function exportPythonTemplate(id:string){
 const payload:Record<string,string>={};
 for(const name of ['source','base','manifest','thumbnail']){const r=await fetch(`/api/templates/${id}/assets/${name}`);if(!r.ok)throw new Error('The template could not be exported.');let data=new Uint8Array(await r.arrayBuffer());if(name==='manifest'){const manifest=normalizeSavedTemplate(JSON.parse(new TextDecoder().decode(data)));data=new TextEncoder().encode(JSON.stringify(manifest));}payload[name]=base64(data);}
 const result=await callWorker('bundle',payload);downloadBytes(bytes(result),`template-${id}.zip`,'application/zip');
}
export function downloadBytes(data:Uint8Array,name:string,type:string){const url=URL.createObjectURL(new Blob([data.slice().buffer],{type}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}

export async function renderPythonEdgewrap(template:unknown,job:unknown){
 const payload={template,job};
 if(await runtimeKind()==='server-python'){const r=await fetch('/api/python/edgewrap',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok){const e=await r.json() as {errors?:string[];error?:string};throw new Error(e.error??'Python render failed.');}return new Uint8Array(await r.arrayBuffer());}
 return bytes((await callWorker('edgewrap',payload)).pdf);
}
