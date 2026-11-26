import {PDFDocument,PDFName} from 'pdf-lib';
import {PAPER_SIZES,EDGEWRAP_SIZES,isSignboard,applyProduct} from './print-specs';
import type {PrintSpec} from './template-types';
const MM=72/25.4;
export type CommercialMatch={key:string;label:string;basis:string;spec:PrintSpec;trim?:{x:number;y:number;width:number;height:number}};
export function recommendCommercialSize(spec:PrintSpec,width:number,height:number,trim:{x:number;y:number;width:number;height:number},explicitTrim:boolean):CommercialMatch|undefined{
 const sign=isSignboard(spec),sizes=sign?EDGEWRAP_SIZES:PAPER_SIZES;
 const matches:{key:string;score:number;w:number;h:number;scale:number;box:typeof trim;inset:number;trusted:boolean}[]=[];
 const boxes=explicitTrim?[{box:trim,trusted:true},{box:{x:0,y:0,width,height},trusted:false}]:[{box:{x:0,y:0,width,height},trusted:false}];
 for(const [key,dimensions] of Object.entries(sizes))for(const scale of sign?[.25,1]:[1])for(const {box,trusted} of boxes){
  const landscape=box.width>box.height,w=dimensions[landscape?1:0],h=dimensions[landscape?0:1];
  const dx=(box.width/MM-w*scale)/2,dy=(box.height/MM-h*scale)/2;
  // No aspect-ratio-only guesses. Allow small rounding or a plausible equal
  // printer border. An explicit PDF trim box is stronger than the outer sheet.
  if(Math.min(dx,dy)<-.5||Math.max(dx,dy)>(sign?35:20)||Math.abs(dx-dy)>.6)continue;
  if(trusted&&Math.max(Math.abs(dx),Math.abs(dy))>.5)continue;
  matches.push({key,w,h,scale,box,inset:Math.max(0,(dx+dy)/2),trusted,score:(trusted?-100:0)+Math.abs(dx-dy)*10+Math.max(0,dx+dy)});
 }
 matches.sort((a,b)=>a.score-b.score);const m=matches[0];if(!m)return;
 const hasMargin=m.trusted||m.inset>.5;
 const frame=hasMargin?{x:m.box.x+(m.box.width-m.w*m.scale*MM)/2,y:m.box.y+(m.box.height-m.h*m.scale*MM)/2,width:m.w*m.scale*MM,height:m.h*m.scale*MM}:undefined;
 const product=sign?spec.product!:spec.product==='other_print'?'brochure':spec.product!;
 return {key:m.key,label:sign?`${m.key.replace('x',' × ')} ft signboard`:m.key.toUpperCase(),basis:m.trusted?'Matched the PDF finished-size box.':hasMargin?'Suggested from the artwork size allowing for bleed and printer margins. Confirm the finished size.':'Matched the PDF dimensions.',trim:frame,spec:{...applyProduct({...spec,faceWidth:m.w,faceHeight:m.h},product),sizeName:m.key,sizeConfirmed:true,sizeWarning:undefined,fitToProduct:false,sourceIncludesBleed:hasMargin}};
}
// Run only after the user confirms. Paper source remains vector; retain the
// required bleed where available, discard only the confirmed outside border.
export async function prepareConfirmedPaper(data:Uint8Array,index:number,spec:PrintSpec,trim:CommercialMatch['trim']){
 if(!trim||isSignboard(spec))return {data,spec};
 const doc=await PDFDocument.load(data),page=doc.getPage(index),m=page.getMediaBox();
 const unit=trim.width/spec.faceWidth,b=spec.bleed;
 const available=Math.min(trim.x-m.x,trim.y-m.y,m.x+m.width-trim.x-trim.width,m.y+m.height-trim.y-trim.height);
 const bleed=available>=b*unit-.1?b*unit:0;
 const x=trim.x-bleed,y=trim.y-bleed,w=trim.width+2*bleed,h=trim.height+2*bleed;
 page.translateContent(-x,-y);page.setMediaBox(0,0,w,h);page.setCropBox(0,0,w,h);page.setTrimBox(bleed,bleed,trim.width,trim.height);page.setBleedBox(0,0,w,h);
 // Mark a confirmed frame rather than inferring it again from page proportions.
 page.node.set(PDFName.of('StudioConfirmedTrim'),doc.context.obj(true));
 return {data:await doc.save(),spec:{...spec,sourceIncludesBleed:bleed>0}};
}
