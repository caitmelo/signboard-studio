import {normalizePageOrigins} from './page-origins';
import {PDFDocument} from 'pdf-lib';
import {PAPER_SIZES} from './print-specs';
// Structural compression is lossless: images, fonts, vectors and colour
// profiles are not rasterised, downsampled or recompressed with JPEG loss.
export async function optimisePdf(data:Uint8Array,fileName=''){
 data=await normalizePageOrigins(data);
 const paper=fileName.match(/\b(a[0-6]|dlx?)\b/i)?.[1].toLowerCase();
 const preparePaper=paper&&!/letter/i.test(fileName);
 if(data.length<20*1024*1024&&!preparePaper)return data;
 const doc=await PDFDocument.load(data,{updateMetadata:false});
 let trimmed=false;
 if(preparePaper){const [short,long]=PAPER_SIZES[paper];for(const page of doc.getPages()){
  const w=page.getWidth()*25.4/72,h=page.getHeight()*25.4/72,tri=/tri[ -]?fold/i.test(fileName);
  const fw=w>h?(tri?short*3-1:long):(tri?long:short),fh=w>h?(tri?long:short):(tri?short*3-1:long);
  const mx=(w-fw)/2,my=(h-fh)/2;
  // Recognise a full-size sheet with 3–5 mm uniform surplus bleed. Remove
  // only the excess outside the required 2 mm; retain the entire trim face.
  if(mx>=2.9&&mx<=5.1&&Math.abs(mx-my)<.05&&Math.abs(mx-Math.round(mx))<.05){const cut=(mx-2)*72/25.4,nw=(fw+4)*72/25.4,nh=(fh+4)*72/25.4;page.translateContent(-cut,-cut);page.setMediaBox(0,0,nw,nh);page.setCropBox(0,0,nw,nh);page.setBleedBox(0,0,nw,nh);page.setTrimBox(2*72/25.4,2*72/25.4,fw*72/25.4,fh*72/25.4);trimmed=true;}
 }}
 const compact=await doc.save({useObjectStreams:true,objectsPerTick:50});
 return trimmed||compact.length<data.length?compact:data;
}
async function checked(response:Response){const value=await response.json() as any;if(!response.ok)throw new Error(value.error||'The file could not be saved.');return value;}
export type UploadProgress={loaded:number;total:number;waiting:boolean};
export async function saveRequest(url:string,init:RequestInit={}){
 try{return await fetch(url,{...init,signal:AbortSignal.timeout(60000)});}catch(e){if(e instanceof Error&&(e.name==='TimeoutError'||e.name==='AbortError'))throw new Error('The server did not respond within 60 seconds. Your design is still open. Please retry saving.');throw e;}
}
function uploadBytes(url:string,data:Blob,onProgress?:(progress:UploadProgress)=>void):Promise<void|any>{
 return new Promise((resolve,reject)=>{
  const xhr=new XMLHttpRequest();let timer:ReturnType<typeof setTimeout>;let ended=false;
  const finish=(error?:Error)=>{if(ended)return;ended=true;clearTimeout(timer);if(error){reject(error);return;}try{const result=JSON.parse(xhr.responseText);if(xhr.status<200||xhr.status>=300)throw new Error(result.error||'The file could not be saved.');resolve(result);}catch(e){reject(e);}};
  const touch=()=>{clearTimeout(timer);timer=setTimeout(()=>{finish(new Error('No upload progress for 60 seconds. Your design is still open. Please retry saving.'));xhr.abort();},60000);};
  xhr.open('PUT',url);if(data.type)xhr.setRequestHeader('Content-Type',data.type);
  xhr.upload.onprogress=e=>{touch();onProgress?.({loaded:Math.min(e.loaded,data.size),total:data.size,waiting:false});};
  xhr.upload.onload=()=>{touch();onProgress?.({loaded:data.size,total:data.size,waiting:true});};
  xhr.onload=()=>finish();xhr.onerror=()=>finish(new Error('The upload connection failed. Your design is still open. Please retry saving.'));xhr.onabort=()=>finish(new Error('Upload cancelled. Please retry saving.'));
  touch();xhr.send(data);
 });
}
export async function uploadTemplateAsset(id:string,key:string,data:Blob,onProgress?:(progress:UploadProgress)=>void){
 const url=`/api/templates/${id}/assets/${key}`;
 onProgress?.({loaded:0,total:data.size,waiting:false});
 if(data.size<=(key==='manifest'?8:20)*1024*1024){await uploadBytes(url,data,onProgress);return;}
 const runtime=await saveRequest('/runtime.json').then(r=>r.json() as Promise<{engine:string}>);
 if(runtime.engine==='server-python'){await uploadBytes(url,data,onProgress);return;}
 const endpoint=url+'/multipart';const {uploadId}=await checked(await saveRequest(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'start',size:data.size})}));
 const parts:any[]=[];try{for(let offset=0;offset<data.size;offset+=8*1024*1024){const partNumber=parts.length+1;parts.push(await uploadBytes(`${endpoint}?uploadId=${encodeURIComponent(uploadId)}&partNumber=${partNumber}`,data.slice(offset,offset+8*1024*1024),p=>onProgress?.({...p,loaded:offset+p.loaded,total:data.size})));}
 await checked(await saveRequest(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'complete',uploadId,parts})}));
 }catch(e){void saveRequest(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'abort',uploadId})}).catch(()=>{});throw e;}
}
