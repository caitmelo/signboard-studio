import free from './free-font-glyphs.json';
import roman from './nimbus-roman-glyphs.json';
import {freeFontName} from './free-fonts';
import {fontRequest} from './google-fonts';
import type {FontData,TextRun,SavedTemplate} from './template-types';
const alternatives={...free,...roman} as Record<string,FontData>;
export type FontNeed={name:string;font?:FontData;replacement:string;pages:number[]};
export const fontNeedsChoice=(font?:FontData)=>!font||!!font.subset||!!font.fallbackName&&font.choice?.kind!=='alternative';
/** Rank bundled alternatives by family/style, then available original glyph metrics. */
export function closestFont(name:string,current?:FontData){
 const known=current?.fallbackName??freeFontName(name);if(known&&alternatives[known])return known;
 if(/icon|symbol|dingbat|wingding/i.test(name))return 'Noto Sans Symbols 2';
 if(/script|hand|brush|cursive/i.test(name))return 'Yellowtail';
 const style=fontRequest(name),serif=/times|roman|serif|garamond|baskerville|bodoni|crimson|georgia|palatino/i.test(name)&&!/sans/i.test(name);
 const candidates=Object.keys(alternatives).filter(n=>/Arimo|NimbusRoman|NimbusRomNo9L/.test(n)).filter(n=>{const s=fontRequest(n),bold=s.weight>=600||/No9L-Med/.test(n),italic=s.italic||/Ita$/.test(n);return bold===(style.weight>=600)&&italic===style.italic;});
 const samples=Object.entries(current?.glyphs??{}).filter(([cp,g])=>Number(cp)>32&&Number(cp)<127&&g.advance>0).slice(0,64);
 const score=(n:string)=>{const f=alternatives[n];let total=serif&&!/Roman|RomNo9L/i.test(n)?1:0;for(const[cp,g]of samples){const match=f.glyphs[cp];total+=match?Math.abs(g.advance/current!.unitsPerEm-match.advance/f.unitsPerEm):2;}return total/Math.max(1,samples.length);};
 return candidates.sort((a,b)=>score(a)-score(b))[0]??'Arimo';
}
export function missingFonts(pages:{fonts:Record<string,FontData>;runs?:TextRun[];fields?:TextRun[]}[]):FontNeed[]{
 const found=new Map<string,FontNeed>();pages.forEach((page,index)=>{for(const name of new Set((page.runs??page.fields??[]).map(f=>f.fontName))){const font=page.fonts[name];if(!fontNeedsChoice(font))continue;const prior=found.get(name);if(prior){prior.pages.push(index+1);continue;}found.set(name,{name,font,replacement:closestFont(name,font),pages:[index+1]});}});return [...found.values()];
}
export function acceptAlternative(name:string,current?:FontData,selected?:string):FontData{
 const replacement=selected??closestFont(name,current),full=alternatives[replacement];if(!full)throw Error('The suggested alternative is unavailable. Upload the original font.');
 const units=current?.unitsPerEm??full.unitsPerEm,scale=units/full.unitsPerEm;
 const glyphs=Object.fromEntries(Object.entries(full.glyphs).map(([cp,g])=>[cp,{advance:g.advance*scale,bounds:g.bounds?.map(n=>n*scale)??null,path:g.path.replace(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi,n=>String(Number((Number(n)*scale).toFixed(7))))}]));
 return {...full,...current,name,unitsPerEm:units,glyphs:{...glyphs,...current?.glyphs},subset:false,fallbackName:replacement,choice:{kind:'alternative',replacement,confirmedAt:new Date().toISOString()}};
}
export function applyTemplateFont(t:SavedTemplate,name:string,resolve:(current?:FontData)=>FontData):SavedTemplate{
 const uses=name in t.fonts||t.fields.some(f=>f.fontName===name);
 return {...t,fonts:uses?{...t.fonts,[name]:resolve(t.fonts[name])}:t.fonts,...(t.pages?{pages:t.pages.map(p=>applyTemplateFont(p,name,resolve))}:{})};
}
