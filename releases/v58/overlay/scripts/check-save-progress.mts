import assert from 'node:assert/strict';
import {uploadTemplateAsset} from '../lib/pdf-upload';
import {fetchGoogleFont} from '../lib/google-fonts';
let mode='ok';let puts=0;
class XHR{
 upload:any={};status=200;responseText='{"saved":true}';onload:any;onerror:any;onabort:any;
 open(){}setRequestHeader(){}abort(){this.onabort?.()}
 send(data:Blob){puts++;queueMicrotask(()=>{if(mode==='network'){this.onerror();return;}this.upload.onprogress?.({loaded:data.size/2});this.upload.onprogress?.({loaded:data.size});this.upload.onload?.();if(mode==='server'){this.status=503;this.responseText='{"error":"Storage unavailable"}';}this.onload();});}
}
Object.assign(globalThis,{XMLHttpRequest:XHR});
const seen:any[]=[];await uploadTemplateAsset('test','source',new Blob(['123456']),p=>seen.push(p));assert.deepEqual(seen.map(p=>p.loaded),[0,3,6,6]);assert.equal(seen.at(-1).waiting,true);
mode='network';await assert.rejects(uploadTemplateAsset('test','source',new Blob(['x'])),/connection failed/);
mode='server';await assert.rejects(uploadTemplateAsset('test','source',new Blob(['x'])),/Storage unavailable/);
mode='ok';globalThis.fetch=async(input:any,init:any)=>new Response(JSON.stringify(String(input)==='/runtime.json'?{engine:'browser'}:JSON.parse(init.body).action==='start'?{uploadId:'test'}:{saved:true}));
const large=new Blob([new Uint8Array(21*1024*1024)]),progress:number[]=[];await uploadTemplateAsset('test','source',large,p=>progress.push(p.loaded));assert.equal(progress.at(-1),large.size);assert(progress.every((n,i)=>!i||n>=progress[i-1]));assert.equal(puts,6);
globalThis.fetch=async()=>{throw Error('Proprietary fonts must not call Google');};assert.equal(await fetchGoogleFont('Helvetica Neue LT Std',700,false),null);assert.equal(await fetchGoogleFont('EOS-Icons-PB Generic',400,false),null);
console.log('PASS byte progress, multipart totals, upload errors, embedded-only font handling');
