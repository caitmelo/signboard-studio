import {PDFDocument,PDFPage,PDFName,PDFDict,PDFArray,PDFRawStream,PDFContentStream,decodePDFRawStream} from 'pdf-lib';
// Refresh only automatically generated bleed from the FINAL edited artwork.
// Each outer strip samples a narrow band inside trim, preserving all original
// vectors and the new image, crop, rotation and clipping in the source form.
export function refreshGeneratedBleed(doc:PDFDocument,page:PDFPage){
 const res=page.node.Resources(),xo=res?.lookupMaybe(PDFName.of('XObject'),PDFDict);
 if(!res||!xo?.has(PDFName.of('StudioBleed0')))return;
 const t=page.getTrimBox(),m=page.getMediaBox(),e=1;
 const contents=page.node.Contents(),streams=contents instanceof PDFArray?contents.asArray():[contents];
 const raw=streams.filter(Boolean).map(s=>{const v=doc.context.lookup(s!);return v instanceof PDFRawStream?decodePDFRawStream(v).decode():v instanceof PDFContentStream?v.getUnencodedContents():new Uint8Array()});
 const size=raw.reduce((n,b)=>n+b.length+1,0),data=new Uint8Array(size);let at=0;for(const b of raw){data.set(b,at);at+=b.length;data[at++]=10;}
 const saved=res.clone();saved.set(PDFName.of('XObject'),xo.clone());
 const form=doc.context.register(doc.context.flateStream(data,{Type:'XObject',Subtype:'Form',StudioGeneratedBleed:true,BBox:[t.x,t.y,t.x+t.width,t.y+t.height],Resources:saved}));
 const key=PDFName.of('StudioCurrentEdge');xo.set(key,form);
 const xs=[[0,t.x,t.x+e,e],[t.x,t.width,t.x,t.width],[t.x+t.width,m.width-t.x-t.width,t.x+t.width-2*e,e]];
 const ys=[[0,t.y,t.y+e,e],[t.y,t.height,t.y,t.height],[t.y+t.height,m.height-t.y-t.height,t.y+t.height-2*e,e]];
 let commands='';for(let i=0;i<3;i++)for(let j=0;j<3;j++){if(i===1&&j===1)continue;const[x,w,sx,sw]=xs[i],[y,h,sy,sh]=ys[j];if(w<=0||h<=0)continue;const a=w/sw,d=h/sh;commands+=`q ${x} ${y} ${w} ${h} re W n 0 0 0 0 k ${x} ${y} ${w} ${h} re f ${a} 0 0 ${d} ${x-a*sx} ${y-d*sy} cm ${key} Do Q\n`;}
 page.node.addContentStream(doc.context.register(doc.context.flateStream(commands)));
}
