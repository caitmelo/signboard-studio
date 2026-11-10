import {PACKAGE_COUNT_LIMIT,PACKAGE_TOTAL_LIMIT,PACKAGE_FILE_LIMIT,safePackagePath,ignoredPackagePath} from './template-package';
const crcTable=Uint32Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(data:Uint8Array){let crc=0xffffffff;for(const byte of data)crc=crcTable[(crc^byte)&255]^(crc>>>8);return (crc^0xffffffff)>>>0;}
/** ZIP entries are bounded before and during inflation; archive paths never become filesystem paths. */
export async function readPackageZip(data:Uint8Array,maxTotal=PACKAGE_TOTAL_LIMIT){
 const view=new DataView(data.buffer,data.byteOffset,data.byteLength);let end=-1;
 for(let i=data.length-22;i>=Math.max(0,data.length-65557);i--)if(view.getUint32(i,true)===0x06054b50&&i+22+view.getUint16(i+20,true)===data.length){end=i;break;}
 if(end<0)throw Error('This ZIP is incomplete or unsupported. Upload the folder instead.');
 const count=view.getUint16(end+10,true),start=view.getUint32(end+16,true);
 if(view.getUint16(end+4,true)||view.getUint16(end+6,true)||count>PACKAGE_COUNT_LIMIT||count===65535)throw Error('Use a single ZIP with no more than 400 files.');
 if(start+view.getUint32(end+12,true)>end)throw Error('Invalid ZIP directory bounds.');
 const result:{path:string;bytes:Uint8Array;modified:number}[]=[],seen=new Set<string>();let offset=start,total=0;
 for(let i=0;i<count;i++){
  if(offset+46>data.length||view.getUint32(offset,true)!==0x02014b50)throw Error('Invalid ZIP directory.');
  const flags=view.getUint16(offset+8,true),method=view.getUint16(offset+10,true),packed=view.getUint32(offset+20,true),size=view.getUint32(offset+24,true),nl=view.getUint16(offset+28,true),el=view.getUint16(offset+30,true),cl=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true);
  if(offset+46+nl+el+cl>end)throw Error('Invalid ZIP filename bounds.');
  const expectedCrc=view.getUint32(offset+16,true),date=view.getUint16(offset+14,true),time=view.getUint16(offset+12,true),modified=new Date(1980+(date>>>9),((date>>>5)&15)-1,date&31,time>>>11,(time>>>5)&63,(time&31)*2).getTime();
  const name=new TextDecoder('utf-8',{fatal:true}).decode(data.subarray(offset+46,offset+46+nl));offset+=46+nl+el+cl;
  if(name.endsWith('/')||ignoredPackagePath(name))continue;
  const path=safePackagePath(name);if(seen.has(path))throw Error(`The ZIP contains duplicate paths: ${path}`);seen.add(path);
  if(flags&1)throw Error('Password-protected ZIPs cannot be opened. Upload an unencrypted folder or ZIP.');
  if(size>PACKAGE_FILE_LIMIT||(total+=size)>maxTotal)throw Error('Package too large: use files under 32 MB and a package under 200 MB.');
  if(local+30>data.length||view.getUint32(local,true)!==0x04034b50)throw Error('Invalid ZIP entry.');
  const from=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
  if(from+packed>data.length)throw Error('Incomplete ZIP entry.');
  const input=new Uint8Array(data.subarray(from,from+packed));let bytes:Uint8Array;
  if(method===0)bytes=input;
  else if(method===8){
   const stream=new Blob([input.buffer]).stream().pipeThrough(new DecompressionStream('deflate-raw'));const reader=stream.getReader(),chunks:Uint8Array[]=[];let actual=0;
   while(true){const next=await reader.read();if(next.done)break;actual+=next.value.length;if(actual>size||actual>PACKAGE_FILE_LIMIT){await reader.cancel();throw Error('The ZIP expands beyond its declared size.');}chunks.push(next.value);}
   bytes=new Uint8Array(actual);let at=0;for(const b of chunks){bytes.set(b,at);at+=b.length;}
  }else throw Error('Unsupported ZIP compression. Use a standard ZIP or upload the folder.');
  if(bytes.length!==size||crc32(bytes)!==expectedCrc)throw Error('This ZIP contains a damaged file. Upload the folder or create a new ZIP.');
  result.push({path,bytes,modified});
 }
 return result;
}
export async function expandPackageFiles(files:File[]){const result:{file:File;path:string}[]=[];let size=0;
 for(const file of files){
  if(file.size>PACKAGE_TOTAL_LIMIT)throw Error('Use packages smaller than 200 MB.');
  if(/\.zip$/i.test(file.name)){for(const e of await readPackageZip(new Uint8Array(await file.arrayBuffer()),PACKAGE_TOTAL_LIMIT-size))result.push({file:new File([e.bytes.slice().buffer],e.path.split('/').pop()!,{lastModified:e.modified}),path:e.path});size=result.reduce((n,e)=>n+e.file.size,0);}
  else{const path=safePackagePath(file.webkitRelativePath||file.name);if(!ignoredPackagePath(path))result.push({file,path});size+=file.size;}
 }
 size=0;for(const {file}of result){size+=file.size;if(file.size>PACKAGE_FILE_LIMIT||size>PACKAGE_TOTAL_LIMIT)throw Error('Use files under 32 MB and a package under 200 MB.');}
 if(result.length>PACKAGE_COUNT_LIMIT)throw Error('Use no more than 400 files per package.');
 return result;
}
