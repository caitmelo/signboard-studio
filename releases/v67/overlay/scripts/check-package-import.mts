import assert from 'node:assert/strict';
import fs from 'node:fs';
import {deflateRawSync} from 'node:zlib';
import {readPackageZip,expandPackageFiles} from '../lib/package-zip';
import {safePackagePath} from '../lib/template-package';
import {packageEngineAssets} from '../lib/package-fonts';
import {POST as create} from '../app/api/packages/route';
import {GET as get} from '../app/api/packages/[id]/route';
import {PUT as upload,GET as download} from '../app/api/packages/[id]/files/[fileId]/route';
import {GET as library,DELETE as remove} from '../app/api/templates/route';
import {POST as complete} from '../app/api/templates/[id]/complete/route';
import {env} from './test-storage-env.mjs';
function crc(data:Uint8Array){let n=0xffffffff;for(const b of data){n^=b;for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;}return(n^0xffffffff)>>>0;}
function zip(path:string,content:string,deflate=true){const name=Buffer.from(path),body=Buffer.from(content),packed=deflate?deflateRawSync(body):body;const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);local.writeUInt32LE(0x04034b50);local.writeUInt16LE(deflate?8:0,8);local.writeUInt16LE(name.length,26);central.writeUInt32LE(0x02014b50);central.writeUInt16LE(deflate?8:0,10);central.writeUInt16LE((2021-1980)<<9|3<<5|26,14);central.writeUInt32LE(crc(body),16);central.writeUInt32LE(packed.length,20);central.writeUInt32LE(body.length,24);central.writeUInt16LE(name.length,28);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(central.length+name.length,12);end.writeUInt32LE(local.length+name.length+packed.length,16);return Buffer.concat([local,name,packed,central,name,end]);}
for(const path of ['../escape','/root/file','C:\\file','a//b','a/./b','a\u0000b'])assert.throws(()=>safePackagePath(path));
assert.equal(safePackagePath('Links\\photo.jpg'),'Links/photo.jpg');
for(const compressed of [false,true]){const z=zip('Package/Links/photo.jpg','test photo',compressed),items=await readPackageZip(z);assert.equal(items[0].path,'Package/Links/photo.jpg');assert.equal(Buffer.from(items[0].bytes).toString(),'test photo');assert.equal(new Date(items[0].modified).getFullYear(),2021);}
await assert.rejects(()=>readPackageZip(zip('../escape','bad')));
await assert.rejects(()=>readPackageZip(zip('big','12345'),4));
const corrupt=zip('file','test',false);corrupt[34]^=1;await assert.rejects(()=>readPackageZip(corrupt),/damaged/);
const expanded=await expandPackageFiles([new File([zip('Pack/layout.indd','indd')],'package.zip')]);assert.equal(expanded[0].path,'Pack/layout.indd');
const fonts=fs.readdirSync('public/template/fonts').filter(f=>/\.ttf$|\.otf$/i.test(f));assert.ok(fonts.length);const {default:fontkit}=await import('@pdf-lib/fontkit');const data=fs.readFileSync('public/template/fonts/'+fonts[0]);const parsed=fontkit.create(data) as any;let fallback=0;const assets=await packageEngineAssets([{name:fonts[0],data}],{loadFont:async()=>{fallback++;return undefined;}} as any);const matched=await assets.loadFont!(parsed.postscriptName);assert.ok(matched?.glyphs['33']);assert.ok(matched?.glyphs['63']);assert.equal(matched?.subset,false);assert.equal(fallback,0);await assets.loadFont!('nonexistent');assert.equal(fallback,1);
const req=(method='GET',body?:string,user='owner',headers:Record<string,string>={})=>new Request('https://studio.test/api/packages',{method,body,headers:{...(user?{'oai-authenticated-user-id':user}:{}),...headers}});
assert.equal((await create(req('POST',JSON.stringify({name:'Package'}),''))).status,401);
assert.equal((await create(req('POST',JSON.stringify({name:'Package'}),'owner',{origin:'https://other.test'}))).status,403);
const created=await create(req('POST',JSON.stringify({name:'Incomplete package'})));assert.equal(created.status,201);const{id}=await created.json() as any,context={params:Promise.resolve({id})};const fileId=crypto.randomUUID(),fc={params:Promise.resolve({id,fileId})};
assert.equal((await upload(req('PUT','fake INDD','owner',{'X-Package-Path':'Package%2FLayout.indd'}),fc)).status,200);
let record=await(await get(req(),context)).json() as any;assert.equal(record.ready,false);assert.equal(record.files[0].path,'Package/Layout.indd');assert.equal(record.files[0].kind,'indd');assert.equal(record.files[0].size,9);
assert.equal((await get(req('GET',undefined,'other'),context)).status,404);assert.equal((await download(req('GET',undefined,'other'),fc)).status,404);assert.equal((await upload(req('PUT','bad','other'),fc)).status,404);
assert.equal((await upload(req('PUT','bad','owner',{'X-Package-Path':'..%2Fescape'}),fc)).status,400);
assert.equal((await upload(req('PUT','x','owner',{'X-Package-Path':'big','Content-Length':String(33*1024*1024)}),fc)).status,413);
assert.equal(await(await download(req(),fc)).text(),'fake INDD');
assert.equal((await upload(req('PUT','replacement','owner',{'X-Package-Path':'Package%2FLayout.indd'}),fc)).status,200);
const pdfContext={params:Promise.resolve({id,fileId:crypto.randomUUID()})};assert.equal((await upload(req('PUT','%PDF test','owner',{'X-Package-Path':'Package%2FLayout.pdf'}),pdfContext)).status,200);
record=await(await get(req(),context)).json() as any;assert.equal(record.files.length,2);assert.equal(record.files[0].size,11);
const listed=await(await library(req())).json() as any;assert.equal(listed.templates.find((t:any)=>t.id===id).status,'package');assert.equal((await complete(req('POST'),context)).status,409);
// Use an existing valid manifest fixture shape to exercise finalization and name retention.
const manifest={schemaVersion:1,name:'Final package name',fonts:{Known:{name:'Known',unitsPerEm:1000,glyphs:{},source:'catalogue',subset:false}},sourceName:'Layout.pdf',fields:[{id:'text',fontName:'Known',text:'Hello',x:10,y:10,size:12}],media:[],spec:{product:'flyer',faceWidth:210,faceHeight:297,bleed:2},sourceWidth:210,sourceHeight:297};
for(const key of ['source','base','thumbnail'])await env.BUCKET.put(`templates/${id}/${key}`,'test');await env.BUCKET.put(`templates/${id}/manifest`,JSON.stringify(manifest));
const done=await complete(req('POST'),context);if(done.status!==200)throw Error(await done.text());
record=await(await get(req(),context)).json() as any;assert.equal(record.ready,true);assert.equal(record.name,'Final package name');assert.equal(record.files.length,2);assert.equal((await upload(req('PUT','no','owner',{'X-Package-Path':'new.indd'}),fc)).status,409);
assert.equal((await remove(req('DELETE',JSON.stringify({confirm:'delete-selected-templates',ids:[id]})))).status,200);assert.equal((await get(req(),context)).status,404);assert.equal((await env.BUCKET.list({prefix:`templates/${id}/`})).objects.length,0);
console.log('PASS: ZIP store/deflate, timestamps, traversal, CRC, quotas; supplied font punctuation; incomplete package persistence, resume, replacement, owner/origin isolation, finalization and cleanup.');
