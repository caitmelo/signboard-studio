import {PDFArray,PDFDict,PDFDocument,PDFName,PDFNumber,PDFRawStream,PDFRef,decodePDFRawStream} from 'pdf-lib';
import {bytes,latin,operations,multiply} from './pdf-content';
export type WatermarkCandidate={id:string;pageIndex:number;label:string};
const identity=[1,0,0,1,0,0];
const paint=new Set(['f','F','f*','S','s','B','B*','b','b*']);
/** Candidates are reviewable translucent vector overlays, never automatically deleted. */
export async function inspectWatermarks(data:Uint8Array):Promise<WatermarkCandidate[]>{
 const doc=await PDFDocument.load(data,{updateMetadata:false}),found:WatermarkCandidate[]=[];
 const get=(d:PDFDict|undefined,k:string)=>d?.lookup(PDFName.of(k));
 const raw=(s:PDFRawStream)=>latin(decodePDFRawStream(s).decode());
 const summaryCache=new Map<PDFRawStream,{paths:number;images:boolean;text:boolean;faint:boolean}>();
 function summary(s:PDFRawStream,parent:PDFDict|undefined,ancestors=new Set<PDFRawStream>()):{paths:number;images:boolean;text:boolean;faint:boolean}{
  if(ancestors.has(s)||ancestors.size>16)throw Error('Nested artwork cannot be reviewed for watermarks.');
  const own=get(s.dict,'Resources'),res=own instanceof PDFDict?own:parent;
  if(own&&summaryCache.has(s))return summaryCache.get(s)!;
  const result={paths:0,images:false,text:false,faint:false},next=new Set(ancestors).add(s);
  for(const op of operations(raw(s))){const name=String(op.args[0]?.value??'');
   if(paint.has(op.op))result.paths++;
   if(['Tj','TJ',"'",'"','sh'].includes(op.op))result.text=true;
   if(op.op==='gs'){const states=get(res,'ExtGState'),state=states instanceof PDFDict?get(states,name):undefined;if(state instanceof PDFDict)for(const key of ['ca','CA']){const v=get(state,key);if(v instanceof PDFNumber&&v.asNumber()>0&&v.asNumber()<=.5)result.faint=true;}}
   if(op.op==='Do'){const xs=get(res,'XObject'),child=xs instanceof PDFDict?get(xs,name):undefined;if(!(child instanceof PDFRawStream))continue;
    if(get(child.dict,'Subtype')?.toString()==='/Image')result.images=true;
    else if(get(child.dict,'Subtype')?.toString()==='/Form'){const b=summary(child,res,next);result.paths+=b.paths;result.images||=b.images;result.text||=b.text;result.faint||=b.faint;}
   }
  }
  if(own)summaryCache.set(s,result);return result;
 }
 function scan(source:string,res:PDFDict|undefined,pageIndex:number,prefix:string,matrix:number[],area:number,depth=0){
  if(depth>16)return;let m=matrix;const stack:number[][]=[];
  for(const [i,op]of operations(source).entries()){
   if(op.op==='q')stack.push([...m]);else if(op.op==='Q')m=stack.pop()??matrix;else if(op.op==='cm')m=multiply(m,op.args.map(a=>Number(a.value)));
   if(op.op!=='Do')continue;const xs=get(res,'XObject'),child=xs instanceof PDFDict?get(xs,String(op.args[0]?.value)):undefined;
   if(!(child instanceof PDFRawStream)||get(child.dict,'Subtype')?.toString()!=='/Form')continue;
   const id=prefix+'/'+i,b=summary(child,res),box=get(child.dict,'BBox'),fm=get(child.dict,'Matrix');
   const cm=fm instanceof PDFArray?multiply(m,fm.asArray().map(n=>(doc.context.lookup(n) as PDFNumber).asNumber())):m;
   const coords=box instanceof PDFArray?box.asArray().map(n=>(doc.context.lookup(n) as PDFNumber).asNumber()):[];
   const size=coords.length===4?Math.abs((coords[2]-coords[0])*(coords[3]-coords[1])*(cm[0]*cm[3]-cm[1]*cm[2])):0;
   if(b.faint&&!b.images&&!b.text&&b.paths>=8&&size>=area*.08){found.push({id,pageIndex,label:`Possible proof watermark · page ${pageIndex+1}`});if(found.length>32)throw Error('Too many translucent layers to review automatically.');continue;}
   const own=get(child.dict,'Resources');scan(raw(child),own instanceof PDFDict?own:res,pageIndex,id,cm,area,depth+1);
  }
 }
 for(const [i,p]of doc.getPages().entries())scan(pageContent(doc,p.node.Contents()),p.node.Resources(),i,String(i),identity,p.getWidth()*p.getHeight());
 return found;
}
function pageContent(doc:PDFDocument,contents:any){return (contents instanceof PDFArray?contents.asArray():contents?[contents]:[]).map(x=>doc.context.lookup(x)).filter((x):x is PDFRawStream=>x instanceof PDFRawStream).map(x=>latin(decodePDFRawStream(x).decode())).join('\n');}
/** Copy-on-write along each selected invocation prevents edits leaking into shared forms/pages. */
export async function removeWatermarks(data:Uint8Array,selected:string[]):Promise<Uint8Array>{
 if(!selected.length)return data;
 const valid=new Set((await inspectWatermarks(data)).map(c=>c.id));if(selected.some(id=>!valid.has(id)))throw Error('The watermark selection no longer matches this PDF. Review it again.');
 const doc=await PDFDocument.load(data,{updateMetadata:false}),chosen=new Set(selected);
 function rewrite(raw:string,res:PDFDict|undefined,prefix:string):{raw:string;resources:PDFDict|undefined}{
  let resources=res;const edits:{start:number;end:number;text:string}[]=[];
  for(const [i,op]of operations(raw).entries()){
   if(op.op!=='Do')continue;const id=prefix+'/'+i;
   if(chosen.has(id)){edits.push({start:op.start,end:op.end,text:'% removed reviewed proof overlay'});continue;}
   if(!selected.some(k=>k.startsWith(id+'/')))continue;
   const name=PDFName.of(String(op.args[0].value)),xs=res?.lookupMaybe(PDFName.of('XObject'),PDFDict),child=xs?.lookup(name);
   if(!(child instanceof PDFRawStream)||!res||!xs)throw Error('The selected watermark layer could not be isolated.');
   const own=child.dict.lookupMaybe(PDFName.of('Resources'),PDFDict),result=rewrite(latin(decodePDFRawStream(child).decode()),own??res,id);
   const clone=doc.context.flateStream(bytes(result.raw));for(const[k,v]of child.dict.entries())if(!['Length','Filter','DecodeParms','Resources'].includes(k.decodeText()))clone.dict.set(k,v);
   if(result.resources)clone.dict.set(PDFName.of('Resources'),result.resources);
   if(resources===res){resources=res.clone(doc.context);resources.set(PDFName.of('XObject'),xs.clone(doc.context));}
   const objects=resources!.lookup(PDFName.of('XObject'),PDFDict);let key='ReviewedOverlay'+i;while(objects.has(PDFName.of(key)))key+='_';objects.set(PDFName.of(key),doc.context.register(clone));
   edits.push({start:op.start,end:op.end,text:`/${key} Do`});
  }
  for(const e of edits.sort((a,b)=>b.start-a.start))raw=raw.slice(0,e.start)+e.text+'\n'+raw.slice(e.end);
  return {raw,resources};
 }
 for(const[i,p]of doc.getPages().entries())if(selected.some(k=>k.startsWith(i+'/'))){const result=rewrite(pageContent(doc,p.node.Contents()),p.node.Resources(),String(i));p.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(bytes(result.raw))));if(result.resources)p.node.set(PDFName.of('Resources'),result.resources);}
 return doc.save();
}
