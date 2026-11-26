import {inferPrintFormat} from './print-format';
import {recommendCommercialSize,type CommercialMatch} from './commercial-size';
import {PDFName} from 'pdf-lib';
import {signboardFrame} from './signboard-frame';
import {sceneFromPdf} from './design-scene';
import {PDFDocument} from 'pdf-lib';
import {PAPER_SIZES,EDGEWRAP_SIZES,suggestPrintSpec,applyProduct,bleedInsets,isSignboard} from './print-specs';
import type {PrintSpec,PrintProduct} from './template-types';
export const DOCUMENT_SIZES=[...Object.entries(PAPER_SIZES).map(([key,[w,h]])=>({key,label:key.toUpperCase(),width:w,height:h})),...Object.entries(EDGEWRAP_SIZES).map(([key,[w,h]])=>({key,label:key==='optima'?'Optima':`${key.replace('x',' × ')} signboard`,width:w,height:h}))];
export function sizeKey(spec:PrintSpec){return DOCUMENT_SIZES.find(p=>Math.abs(Math.min(spec.faceWidth,spec.faceHeight)-p.width)<.1&&Math.abs(Math.max(spec.faceWidth,spec.faceHeight)-p.height)<.1)?.key??'custom';}
export function suggestedSizeKey(spec:PrintSpec,fileName:string){
 const actual=sizeKey(spec);if(actual!=='custom')return actual;
 const match=fileName.replace(/\.(?=\d+\s*[x×])/gi,' ').match(/(?:^|[^0-9])(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?![0-9])/i);
 if(isSignboard(spec)&&match){const direct=`${+match[1]}x${+match[2]}`,reverse=`${+match[2]}x${+match[1]}`;if(EDGEWRAP_SIZES[direct])return direct;if(EDGEWRAP_SIZES[reverse])return reverse;}
 return 'custom';
}
export function pickSize(spec:PrintSpec,key:string){const p=DOCUMENT_SIZES.find(s=>s.key===key);if(!p)return {...spec,sizeName:'custom'};const landscape=spec.faceWidth>spec.faceHeight;return {...applyProduct({...spec,format:key==='dl'?'dl_mailcard':key==='a4'?'a4_flat':undefined,faceWidth:landscape?p.height:p.width,faceHeight:landscape?p.width:p.height},EDGEWRAP_SIZES[key]?(isSignboard(spec)?spec.product!:'edgewrap'):(key==='dl'?'mailcard':key==='a4'?'brochure':isSignboard(spec)?'brochure':spec.product??'brochure')),sizeName:key,resizeMode:'fit' as const,fitToProduct:true,sizeConfirmed:true,sizeWarning:undefined};}
export function pickCategory(spec:PrintSpec,product:PrintProduct,width:number,height:number){const next=applyProduct(spec,product);const b=bleedInsets(next);const expected=(next.faceWidth+b.left+b.right)/(next.faceHeight+b.top+b.bottom);return {...next,sourceIncludesBleed:product==='letter'?false:Math.abs(width/height/expected-1)<.003&&Math.abs(width/height-next.faceWidth/next.faceHeight)>.0001};}
export type DocumentSetup={commercial?:CommercialMatch;mismatch?:{filename:string;detected:string};includeAll?:boolean;spec:PrintSpec;width:number;height:number;pageCount:number;pageIndex:number};
export async function detectDocument(data:Uint8Array,fileName:string,pageIndex=0):Promise<DocumentSetup>{
 const doc=await PDFDocument.load(data,{updateMetadata:false});const page=doc.getPage(pageIndex),{width,height}=page.getSize();const trim=page.getTrimBox();
 let spec=suggestPrintSpec(fileName,width,height,trim).spec;
 const printerFrame=isSignboard(spec)?await signboardFrame(doc,pageIndex):undefined;
 const namedFrame=printerFrame&&Math.abs(printerFrame.width/printerFrame.height/(spec.faceWidth/spec.faceHeight)-1)<.005;
 if(namedFrame)spec={...spec,sizeConfirmed:true,sourceIncludesBleed:true,sizeName:sizeKey(spec)};
 const physical=Object.entries(EDGEWRAP_SIZES).find(([, [short,long]])=>[1,4].some(f=>Math.abs(Math.min(trim.width,trim.height)*25.4/72*f-short)<1&&Math.abs(Math.max(trim.width,trim.height)*25.4/72*f-long)<1));
 const detectedSign=isSignboard(spec)&&!!physical;
 if(detectedSign){const [key,[short,long]]=physical!;spec=applyProduct({...spec,faceWidth:width>height?long:short,faceHeight:width>height?short:long,sizeName:key,sourceIncludesBleed:trim.x>0&&trim.y>0},spec.product!);}
 if(/tri[ -]?fold/i.test(fileName)&&trim.x>0&&trim.y>0){spec={...spec,faceWidth:trim.width*25.4/72,faceHeight:trim.height*25.4/72,bleed:2,sourceIncludesBleed:true,sizeName:'custom',sizeConfirmed:true};}
 // Named sizes take precedence. Otherwise detect standard paper by physical page or trim dimensions.
 if(!/\b(?:a[0-6]|dlx?)\b|\d\s*[x×]\s*\d/i.test(fileName)){
  const candidates=[{w:trim.width*25.4/72,h:trim.height*25.4/72}, {w:width*25.4/72,h:height*25.4/72}];
  const paper=Object.entries(PAPER_SIZES).find(([, [w,h]])=>candidates.some(c=>Math.abs(Math.min(c.w,c.h)-w)<1&&Math.abs(Math.max(c.w,c.h)-h)<1));
  if(paper){const [key,[w,h]]=paper;spec={...spec,faceWidth:width>height?h:w,faceHeight:width>height?w:h,sizeName:key};}
 }
 if(spec.product==='letter')spec=applyProduct(spec,'letter');
 const frameW=spec.faceWidth+(spec.sourceIncludesBleed?2*spec.bleed:0),frameH=spec.faceHeight+(spec.sourceIncludesBleed?2*spec.bleed:0);
 if(!detectedSign&&!namedFrame&&Math.abs(frameW/frameH/(width/height)-1)>.003&&spec.product!=='letter'){
  const w=width*25.4/72,h=height*25.4/72;
  // Do not stretch a sheet into the named finished page size. Keep the actual
  // sheet proportions and require the physical trim to be reviewed.
  const factor=spec.product==='edgewrap'&&Math.max(w,h)<1000?4:1;
  const bleed=spec.bleed;
  spec={...spec,faceWidth:Number((w*factor-2*bleed).toFixed(3)),faceHeight:Number((h*factor-2*bleed).toFixed(3)),sourceIncludesBleed:true,sizeName:'custom',sizeConfirmed:false,sizeWarning:`The PDF sheet does not match the named finished size. These measurements preserve the source proportions. Confirm the trim and bleed before print export${/tri[ -]?fold/i.test(fileName)?'; this PDF contains unfolded sheets, each with three panels':''}.`};
 }
 const commercial=recommendCommercialSize(spec,width,height,trim,page.node.has(PDFName.of('TrimBox')));if(commercial){spec=commercial.spec;const namedPaper=fileName.match(/(?:^|[^a-z0-9])(a[0-6])(?=[^a-z0-9]|$)/i)?.[1].toLowerCase();if(namedPaper&&namedPaper!==commercial.key)commercial.basis+=` The filename mentions ${namedPaper.toUpperCase()}, but this sheet matches ${commercial.label}. It may contain multiple imposed panels; we will keep the whole sheet.`;}
 spec=inferPrintFormat(spec,fileName);
 const authored=await sceneFromPdf(data);if(authored)return {includeAll:true,spec:authored.spec,width,height,pageCount:doc.getPageCount(),pageIndex};
 const named=fileName.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);const filenameKey=named?`${Math.max(+named[1],+named[2])}x${Math.min(+named[1],+named[2])}`:undefined;const detectedKey=sizeKey(spec);
 return {commercial,mismatch:filenameKey&&EDGEWRAP_SIZES[filenameKey]&&detectedKey!=='custom'&&filenameKey!==detectedKey?{filename:filenameKey,detected:detectedKey}:undefined,includeAll:!/(?:specs?|reference)/i.test(fileName),spec:{...spec,sizeName:spec.sizeName??sizeKey(spec)},width,height,pageCount:doc.getPageCount(),pageIndex};
}
