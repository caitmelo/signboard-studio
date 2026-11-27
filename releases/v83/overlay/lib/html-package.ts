/** Package the trusted PDF-to-HTML output as linked, offline HTML and CSS. */
export function htmlPackageFiles(html:string){
 const match=html.match(/<style>([\s\S]*?)<\/style>/);
 if(!match)throw Error('The HTML export is missing its styling.');
 return {'index.html':html.replace(match[0],'<link rel="stylesheet" href="styles.css">'),'styles.css':match[1].trim()+'\n','README.txt':'Open index.html after extracting this ZIP. Keep styles.css beside it.\nPage images are embedded in the HTML, so no internet connection is required.\nThis is a visual copy of the design; text inside the page images is not editable HTML. Use the studio to edit content and the print PDF for commercial printing.\n'};
}
/** Standard uncompressed ZIP, with UTF-8 names and CRC32 integrity checks. */
export function zipTextFiles(files:Record<string,string>){
 const encoder=new TextEncoder(),parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0;
 const crc=(data:Uint8Array)=>{let c=0xffffffff;for(const b of data){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;};
 for(const [name,text] of Object.entries(files)){
  const n=encoder.encode(name),data=encoder.encode(text),sum=crc(data),header=new Uint8Array(30+n.length),h=new DataView(header.buffer);
  h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(12,33,true);h.setUint32(14,sum,true);h.setUint32(18,data.length,true);h.setUint32(22,data.length,true);h.setUint16(26,n.length,true);header.set(n,30);
  const entry=new Uint8Array(46+n.length),e=new DataView(entry.buffer);e.setUint32(0,0x02014b50,true);e.setUint16(4,20,true);e.setUint16(6,20,true);e.setUint16(8,0x800,true);e.setUint16(14,33,true);e.setUint32(16,sum,true);e.setUint32(20,data.length,true);e.setUint32(24,data.length,true);e.setUint16(28,n.length,true);e.setUint32(42,offset,true);entry.set(n,46);
  parts.push(header,data);central.push(entry);offset+=header.length+data.length;
 }
 const end=new Uint8Array(22),v=new DataView(end.buffer),length=central.reduce((n,p)=>n+p.length,0);v.setUint32(0,0x06054b50,true);v.setUint16(8,central.length,true);v.setUint16(10,central.length,true);v.setUint32(12,length,true);v.setUint32(16,offset,true);
 const result=new Uint8Array(offset+length+22);let position=0;for(const part of [...parts,...central,end]){result.set(part,position);position+=part.length;}return result;
}
