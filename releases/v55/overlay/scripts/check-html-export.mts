import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import {PDFDocument,rgb} from 'pdf-lib';
import {newElement,scenePdf,type Scene} from '../lib/design-scene';
import {createJob,makePdf} from '../lib/edgewrap';
import {htmlFromPdfPages,renderPdfDocumentHtml} from '../lib/pdf-html';
const req=createRequire((process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES||process.cwd()+'/node_modules')+'/anchor.js');
const canvas=req('@napi-rs/canvas');
class LocalAssetRequest{response:ArrayBuffer|undefined;url='';responseType='';open(_method:string,url:string){this.url=url}send(){const b=fs.readFileSync('public'+this.url);this.response=b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength)}}
Object.assign(globalThis,{XMLHttpRequest:LocalAssetRequest,DOMMatrix:canvas.DOMMatrix,Path2D:canvas.Path2D,ImageData:canvas.ImageData});
const oldFetch=globalThis.fetch;
globalThis.fetch=async(input:any,init?:any)=>String(input).startsWith('/')?new Response(fs.readFileSync('public'+String(input))):oldFetch(input,init);
const pdfjs=await import(pathToFileURL(path.resolve('public/pdfjs/pdf.mjs')).href);
pdfjs.GlobalWorkerOptions.workerSrc=pathToFileURL(path.resolve('public/pdfjs/pdf.worker.mjs')).href;
class CanvasFactory{create(w:number,h:number){const c=canvas.createCanvas(w,h);return{canvas:c,context:c.getContext('2d')}}reset(x:any,w:number,h:number){x.canvas.width=w;x.canvas.height=h}destroy(x:any){x.canvas.width=0;x.canvas.height=0;x.canvas=null;x.context=null}}
fs.mkdirSync('work/html-qa',{recursive:true});
const text=(label:string,value:string,x:number,y:number,w:number,h:number,size:number,color='#344254')=>({...newElement('text'),label,text:value,x,y,w,h,size,color,lineHeight:1.5});
const spec={faceWidth:210,faceHeight:297,bleed:0,sourceIncludesBleed:true,product:'letter' as const,productConfirmed:true,bleedConfirmed:true,sizeConfirmed:true,marks:false};
const letter:Scene={version:1,name:'HTML comparison letter',spec,pages:[{background:'#ffffff',elements:[text('Heading','Just\nListed',20,20,150,55,38,'#20a9b0'),text('Greeting','Dear Resident,',20,90,170,12,11),text('Body','We have just listed another property in your neighbourhood.\nThe property is at 1 Example Street, Sampletown.\nPlease contact our team to arrange an inspection.',20,110,170,75,11),text('Agent','Example Agent\nPHONE_PLACEHOLDER\nagent@example.com',20,210,170,35,10),text('Footer','Stone Real Estate | Office print | A4 at 100%',20,278,170,10,7)]}]};
const a4=await PDFDocument.load(await scenePdf(letter));const p=a4.addPage([297*72/25.4,210*72/25.4]);p.drawRectangle({x:0,y:0,width:p.getWidth(),height:80,color:rgb(.2,.26,.32)});const image=await a4.embedPng(fs.readFileSync('public/template/stone-original-preview.png'));p.drawImage(image,{x:35,y:95,width:260,height:440});p.drawText('Second page — landscape'.replace('—','-'),{x:350,y:500,size:22});p.drawText('Example Agent    PHONE_PLACEHOLDER',{x:30,y:40,size:16,color:rgb(1,1,1)});
const template=JSON.parse(fs.readFileSync('public/template/edgewrap.json','utf8'));
const jobs:[string,Uint8Array][]=[['a4-letter-and-landscape',await a4.save()],['edgewrap-two-agents',makePdf(template,createJob(template,[{name:'Example Agent A',phone:'PHONE_PLACEHOLDER'},{name:'Example Agent B',phone:'PHONE_PLACEHOLDER'}]))]];
const escaped=htmlFromPdfPages([{widthPt:100,heightPt:200,image:'data:image/png;base64,AAAA'}],'</title><script>alert(1)</script>');assert(!escaped.includes('<script>'));assert(!escaped.includes('src="https:'));
assert.throws(()=>htmlFromPdfPages([{widthPt:100,heightPt:100,image:'https://example.com/x.png'}],'x'));
for(const[name,bytes]of jobs){
 const task=pdfjs.getDocument({data:bytes.slice(),CanvasFactory,useSystemFonts:false,standardFontDataUrl:'/pdfjs/standard_fonts/',wasmUrl:'/pdfjs/wasm/',iccUrl:'/template/colour/',useWasm:true,useWorkerFetch:true,isEvalSupported:false});
 const doc=await task.promise;const progress:number[]=[];
 const html=await renderPdfDocumentHtml(doc,name,()=>canvas.createCanvas(1,1),(page)=>progress.push(page));
 assert.deepEqual(progress,Array.from({length:doc.numPages},(_,i)=>i+1));assert.equal((html.match(/<section /g)||[]).length,doc.numPages);assert(!/<script|<iframe|<object|src="https?:/i.test(html));
 fs.writeFileSync(`work/html-qa/${name}.pdf`,bytes);fs.writeFileSync(`work/html-qa/${name}.html`,html);await task.destroy();console.log('PASS',name,'all pages, embedded artwork, no external requests');
}
