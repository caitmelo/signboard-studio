import {PDFDocument} from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import {MM,type Element} from './design-scene';

// Match the PDF writer's metrics, rather than estimating from character count.
export function wrapDraftText(text:string,size:number,width:number,measure:(text:string,size:number)=>number){
 const lines:string[]=[];
 for(const paragraph of text.split('\n')){let line='';for(const word of paragraph.split(' ')){const trial=line?line+' '+word:word;if(measure(trial,size)>width&&line){lines.push(line);line=word}else line=trial}lines.push(line)}
 return lines;
}
export function fittedDraftSize(e:Element,measure:(text:string,size:number)=>number){
 const fits=(size:number)=>{const lines=wrapDraftText(e.text,size,e.w*MM,measure);return lines.length*size*e.lineHeight<=e.h*MM-.05&&lines.every(line=>measure(line,size)<=e.w*MM-.05)};
 if(fits(e.size))return e.size;
 let low=.25,high=e.size;for(let i=0;i<24;i++){const mid=(low+high)/2;if(fits(mid))low=mid;else high=mid}return Math.floor(low*100)/100;
}
export async function fitDraftText(elements:Element[]){
 const doc=await PDFDocument.create();doc.registerFontkit(fontkit);
 const catalog=await fetch('/template/fonts/manifest.json').then(r=>r.json()) as Record<string,string>;
 const fonts=new Map<string,Awaited<ReturnType<typeof doc.embedFont>>>();
 for(const e of elements){if(e.kind!=='text')continue;
  if(!fonts.has(e.font)){const response=await fetch('/template/fonts/'+catalog[e.font]);if(!response.ok)throw Error('The draft font could not be loaded. Please try again.');fonts.set(e.font,await doc.embedFont(await response.arrayBuffer(),{subset:true}))}
  const font=fonts.get(e.font)!;e.size=fittedDraftSize(e,(text,size)=>font.widthOfTextAtSize(text,size));
 }
}
