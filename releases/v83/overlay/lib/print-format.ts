import {applyProduct} from './print-specs';
import type {PrintSpec} from './template-types';
export type PrintFormat='dl_mailcard'|'a4_flat'|'a4_trifold_dl';
export const PRINT_FORMATS=[{value:'dl_mailcard',label:'DL mailcard · flat card'},{value:'a4_flat',label:'A4 · flat sheet / brochure page'},{value:'a4_trifold_dl',label:'A4 trifold to DL'}] as const;
export function physicalPaper(spec:PrintSpec){const w=Math.min(spec.faceWidth,spec.faceHeight),h=Math.max(spec.faceWidth,spec.faceHeight);if(Math.abs(w-99)<1.1&&Math.abs(h-210)<1.1)return 'dl';if(Math.abs(w-210)<1.1&&Math.abs(h-297)<1.1)return 'a4';return undefined;}
export function inferPrintFormat(spec:PrintSpec,fileName:string):PrintSpec{
 const paper=physicalPaper(spec);if(paper==='dl')return {...applyProduct(spec,'mailcard'),format:'dl_mailcard'};
 if(paper==='a4'&&spec.product!=='letter')return {...applyProduct(spec,'brochure'),format:/tri[\s_.-]?fold|(?:^|[\s_.-])dl(?:[\s_.-]|$)/i.test(fileName)?'a4_trifold_dl':'a4_flat'};
 return spec;
}
export function applyPrintFormat(spec:PrintSpec,format:PrintFormat):PrintSpec{
 const paper=format==='dl_mailcard'?'dl':'a4',same=physicalPaper(spec)===paper,landscape=spec.faceWidth>spec.faceHeight;
 const [short,long]=paper==='dl'?[99,210]:[210,297];
 return {...applyProduct({...spec,faceWidth:landscape?long:short,faceHeight:landscape?short:long},paper==='dl'?'mailcard':'brochure'),format,sizeName:paper,sizeConfirmed:true,sizeWarning:undefined,...(!same?{sourceIncludesBleed:false,resizeMode:'fit' as const,fitToProduct:true}:{})};
}
export function printFormatLabel(spec:PrintSpec){return spec.format==='dl_mailcard'?'DL mailcard':spec.format==='a4_trifold_dl'?'A4 trifold to DL':spec.format==='a4_flat'?'A4 flat sheet / brochure':undefined;}
export function formatDescription(spec:PrintSpec,pages:number){
 if(spec.format==='dl_mailcard')return `${pages===2?'Front and back':pages===1?'Single-sided':`${pages} artwork pages`} on a flat DL card. No folding.`;
 if(spec.format==='a4_trifold_dl')return `A4 unfolded sheet, folded into three DL-size panels. ${pages===2?'Two PDF pages represent the outside and inside—not two DL cards.':'Each PDF page represents one complete unfolded side.'} Existing panel positions are preserved; fold widths can vary by printer.`;
 if(spec.format==='a4_flat')return 'Each PDF page is a full A4 sheet. Choose A4 trifold to DL below only if it is intended to fold into three panels.';
 return '';
}
