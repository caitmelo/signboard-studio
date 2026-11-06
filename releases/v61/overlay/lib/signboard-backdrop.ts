import {PDFArray,PDFDict,PDFDocument,PDFName,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {bytes,latin,multiply,operations} from './pdf-content';
type Box={x:number;y:number;width:number;height:number};
// Recognise a separately authored background layer. Keep its blend states and
// CMYK colours together; copying just its photograph loses darkening overlays.
export async function extendedBackdrop(data:Uint8Array,index:number,box:Box,extent:Box){
 const doc=await PDFDocument.load(data,{updateMetadata:false}),page=doc.getPage(index);
 const stream=(o:PDFRawStream)=>latin(decodePDFRawStream(o).decode());
 const covers=(a:number[],m:number[])=>{const x=m[0]*a[0]+m[4],y=m[3]*a[1]+m[5],w=m[0]*a[2],h=m[3]*a[3];return Math.abs(m[1])+Math.abs(m[2])<.001&&Math.min(x,x+w)<=box.x+1&&Math.max(x,x+w)>=box.x+box.width-1&&Math.min(y,y+h)<=box.y+1&&Math.max(y,y+h)>=box.y+box.height-1;};
 function validate(raw:string,res:PDFDict,parent=[1,0,0,1,0,0],depth=0):number{
  if(depth>8)return -1;let m=parent,images=0;const stack:number[][]=[];
  for(const op of operations(raw)){const a=op.args.map(t=>Number(t.value));
   if(op.op==='BT'||['sh','m','l','c'].includes(op.op))return -1;
   if(op.op==='q')stack.push([...m]);else if(op.op==='Q')m=stack.pop()??parent;else if(op.op==='cm')m=multiply(m,a);
   else if(op.op==='re'&&(!covers(a,m)||m.some((v,i)=>Math.abs(v-[1,0,0,1,0,0][i])>.001)))return -1;
   else if(op.op==='Do'){const o=doc.context.lookup(res.lookupMaybe(PDFName.of('XObject'),PDFDict)?.get(PDFName.of(String(op.args[0]?.value))));if(!(o instanceof PDFRawStream))return -1;
    if(o.dict.get(PDFName.of('Subtype'))?.toString()==='/Image'){if(!covers([0,0,1,1],m))return -1;images++;}
    else{const fm=o.dict.lookupMaybe(PDFName.of('Matrix'),PDFArray)?.asArray().map(v=>Number(v.toString()));if(fm?.some((v,i)=>Math.abs(v-[1,0,0,1,0,0][i])>.001))return -1;const n=validate(stream(o),o.dict.lookupMaybe(PDFName.of('Resources'),PDFDict)??res,m,depth+1);if(n<0)return -1;images+=n;}
   }
  }return images;
 }
 function expand(raw:string,res:PDFDict,depth=0):string{
  if(depth>8)return raw;const edits:{start:number;end:number;text:string}[]=[];
  for(const op of operations(raw)){
   if(op.op==='re')edits.push({start:op.start,end:op.end,text:`${extent.x} ${extent.y} ${extent.width} ${extent.height} re`});
   if(op.op==='Do'){const o=doc.context.lookup(res.lookupMaybe(PDFName.of('XObject'),PDFDict)?.get(PDFName.of(String(op.args[0]?.value))));if(o instanceof PDFRawStream&&o.dict.get(PDFName.of('Subtype'))?.toString()==='/Form'){
    const next=doc.context.flateStream(bytes(expand(stream(o),o.dict.lookupMaybe(PDFName.of('Resources'),PDFDict)??res,depth+1)));
    for(const[k,v]of o.dict.entries())if(!['Length','Filter','DecodeParms','BBox'].includes(k.decodeText()))next.dict.set(k,v);
    next.dict.set(PDFName.of('BBox'),doc.context.obj([extent.x,extent.y,extent.x+extent.width,extent.y+extent.height]));
    res.lookup(PDFName.of('XObject'),PDFDict).set(PDFName.of(String(op.args[0]?.value)),doc.context.register(next));
   }}
  }
  for(const e of edits.reverse())raw=raw.slice(0,e.start)+e.text+raw.slice(e.end);return raw;
 }
 const res=page.node.Resources()!,objects=res.lookupMaybe(PDFName.of('XObject'),PDFDict);if(!objects)return;
 for(const[,ref]of objects.entries()){
  const o=doc.context.lookup(ref);if(!(o instanceof PDFRawStream)||o.dict.get(PDFName.of('Subtype'))?.toString()!=='/Form')continue;
  const raw=stream(o),ops=operations(raw),start=ops.findIndex(op=>op.op==='BDC');if(start<0)continue;let nesting=0,end=-1;
  for(let i=start;i<ops.length;i++){if(['BDC','BMC'].includes(ops[i].op))nesting++;if(ops[i].op==='EMC'&&--nesting===0){end=i;break;}}
  if(end<0)continue;let layer=raw.slice(ops[start].start,ops[end].end);const resources=o.dict.lookupMaybe(PDFName.of('Resources'),PDFDict)??res;
  if(validate(layer,resources)!==1)continue;
  const balance=operations(layer).reduce((n,op)=>n+(op.op==='q'?1:op.op==='Q'?-1:0),0);if(balance<0)continue;layer+='\n'+'Q\n'.repeat(balance);
  layer=expand(layer,resources);page.node.set(PDFName.of('Resources'),resources);page.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(bytes(layer))));
  page.setMediaBox(extent.x,extent.y,extent.width,extent.height);page.setCropBox(extent.x,extent.y,extent.width,extent.height);
  return {doc,page};
 }
}
