export const MAX_FONT_BYTES=12*1024*1024;
export const fontLibraryName=(name:string)=>name.replace(/^[A-Z]{6}\+/,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
export async function fontStorageKey(owner:string,name:string){
 const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(owner));
 return `fonts/${Array.from(new Uint8Array(hash),b=>b.toString(16).padStart(2,'0')).join('')}/${fontLibraryName(name)}`;
}
export async function readFontUpload(request:Request){
 if(Number(request.headers.get('content-length'))>MAX_FONT_BYTES)throw Error('Choose a font smaller than 12 MB.');
 const reader=request.body?.getReader();if(!reader)throw Error('Choose a matching font file.');
 const chunks:Uint8Array[]=[];let size=0;
 while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>MAX_FONT_BYTES){await reader.cancel();throw Error('Choose a font smaller than 12 MB.');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const magic=String.fromCharCode(...bytes.subarray(0,4));
 if(size<12||!(magic==='OTTO'||magic==='wOFF'||magic==='true'||(bytes[0]===0&&bytes[1]===1&&bytes[2]===0&&bytes[3]===0)))throw Error('Upload a single TTF, OTF or WOFF font file.');
 return bytes;
}
