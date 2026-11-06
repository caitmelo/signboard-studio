import {PDFDocument,PDFName,PDFDict} from 'pdf-lib';
import {bleedInsets,needsBleed,requiredBleed} from './print-specs';
import {refreshGeneratedBleed} from './refresh-bleed';
import type {SavedTemplate,MediaSlot} from './template-types';

/** Add real edge artwork outside the face. The face itself is only translated,
 * never rescaled or reflowed. Existing authored bleed is left untouched. */
export async function addMissingTemplateBleed(base:Uint8Array,template:SavedTemplate){
 const pages=template.pages??[template];
 if(!pages.some(p=>needsBleed(p.spec)&&!p.spec.sourceIncludesBleed))return {base,template};
 const doc=await PDFDocument.load(base,{updateMetadata:false});
 const updated=pages.map((t,index)=>{
  if(!needsBleed(t.spec)||t.spec.sourceIncludesBleed)return t;
  const required=requiredBleed(t.spec),spec={...t.spec,bleed:required??t.spec.bleed};
  if(required!==undefined)delete spec.bleedInsets;
  const b=bleedInsets(spec),unit=t.sourceWidth/spec.faceWidth;
  const dx=b.left*unit,dy=b.bottom*unit,w=t.sourceWidth+(b.left+b.right)*unit,h=t.sourceHeight+(b.top+b.bottom)*unit;
  const page=doc.getPage(index),origin=page.getMediaBox();
  page.translateContent(dx-origin.x,dy-origin.y);page.setMediaBox(0,0,w,h);page.setCropBox(0,0,w,h);page.setBleedBox(0,0,w,h);page.setTrimBox(dx,dy,t.sourceWidth,t.sourceHeight);
  const res=page.node.Resources()??doc.context.obj({}),xo=res.lookupMaybe(PDFName.of('XObject'),PDFDict)??doc.context.obj({});
  xo.set(PDFName.of('StudioBleed0'),doc.context.register(doc.context.flateStream('',{Type:'XObject',Subtype:'Form',BBox:[0,0,1,1],Resources:{}})));
  res.set(PDFName.of('XObject'),xo);page.node.set(PDFName.of('Resources'),res);refreshGeneratedBleed(doc,page);
  const box=(v:number[]|undefined)=>v?.map((n,i)=>n+(i%2?dy:dx));
  const field=<T extends {x:number;y:number;bounds?:number[]}>(f:T)=>({...f,x:f.x+dx,y:f.y+dy,bounds:box(f.bounds)});
  const media=(s:MediaSlot):MediaSlot=>({...s,x:s.x+dx,y:s.y+dy,matrix:s.matrix.map((v,i)=>v+(i===4?dx:i===5?dy:0)),viewport:s.viewport,fragments:s.fragments?.map(media)});
  return {...t,spec:{...spec,sourceIncludesBleed:true,bleedConfirmed:true},sourceWidth:w,sourceHeight:h,fields:t.fields.map(f=>({...field(f),clip:box(f.clip)})),fixedText:t.fixedText?.map(field),media:t.media?.map(media),printIssues:t.printIssues.filter(s=>!/no confirmed bleed|supply the design with bleed|confirm the printer.s bleed measurements/i.test(s))};
 });
 const result=template.pages?{...template,pages:updated,fields:updated.flatMap(p=>p.fields),media:updated.flatMap(p=>p.media??[]),printIssues:template.printIssues.filter(s=>!/no confirmed bleed|supply the design with bleed|confirm the printer.s bleed measurements/i.test(s)),spec:updated[0].spec,sourceWidth:updated[0].sourceWidth,sourceHeight:updated[0].sourceHeight}:updated[0];
 return {base:await doc.save(),template:result};
}

export async function addMissingSourceBleed(data:Uint8Array,index:number,spec:SavedTemplate['spec']){
 if(!needsBleed(spec)||spec.sourceIncludesBleed)return {data,spec,generated:false};
 const doc=await PDFDocument.load(data),p=doc.getPage(index),m=p.getMediaBox(),trim=p.getTrimBox();
 if(trim.width<m.width-.1&&trim.height<m.height-.1)return {data,spec:{...spec,sourceIncludesBleed:true,bleedConfirmed:true},generated:false};
 const pages=doc.getPages().map((p,i)=>({schemaVersion:1 as const,name:'',sourceName:'',sourceWidth:p.getWidth(),sourceHeight:p.getHeight(),fields:[],fonts:{},spec:i===index?spec:{...spec,sourceIncludesBleed:true},warnings:[],printIssues:[],createdAt:''}));
 const result=await addMissingTemplateBleed(data,{...pages[0],pages});
 return {data:result.base,spec:result.template.pages![index].spec,generated:true};
}
