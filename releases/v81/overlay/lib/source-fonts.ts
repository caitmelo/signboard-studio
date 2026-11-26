import {PDFDocument,PDFName,PDFObjectCopier} from 'pdf-lib';
import {inspectPdf,bytes} from './pdf-content';
import {colourConverter} from './template-colour';
import {pdfNumber as n} from './pdf-number';
import type {SavedTemplate,FontData} from './template-types';
export const sourceFontName=(issue:string)=>issue.replace(/^Page \d+: /,'').match(/^The source font (.+?) is not embedded\./)?.[1];
export async function refreshSourceFontIssues(base:Uint8Array,t:SavedTemplate,assets:{table:Uint8Array;icc:Uint8Array}){
 async function page(p:SavedTemplate,i:number){const checked=await inspectPdf(base,i,colourConverter(assets.table),assets.icc);const used=new Set(checked.runs.map(r=>r.fontName));return {...p,printIssues:[...p.printIssues.filter(v=>!sourceFontName(v)),...[...checked.fonts.values()].filter(f=>used.has(f.name)&&!f.embedded).map(f=>`The source font ${f.name} is not embedded. Upload a licensed font or approve the closest alternative.`)]};}
 if(!t.pages)return page(t,0);const pages:SavedTemplate[]=[];for(const [i,p] of t.pages.entries())pages.push(await page(p,i));return {...t,pages,printIssues:[...t.printIssues.filter(v=>!sourceFontName(v)),...pages.flatMap((p,i)=>p.printIssues.filter(v=>sourceFontName(v)).map(v=>`Page ${i+1}: ${v}`))]};
}
/** Replace decoded, supported fixed text with chosen font outlines. Never guess undecodable characters. */
export async function repairFixedFont(base:Uint8Array,t:SavedTemplate,name:string,font:FontData,assets:{table:Uint8Array;icc:Uint8Array}){
 const out=await PDFDocument.create();const count=(await PDFDocument.load(base)).getPageCount();let changed=false;
 for(let i=0;i<count;i++){const inspected=await inspectPdf(base,i,colourConverter(assets.table),assets.icc),{doc,page}=inspected;const runs=inspected.runs.filter(r=>r.fontName===name);
 if(runs.length){
  for(const r of runs)if((!r.supported&&!r.issue?.startsWith('The PDF does not include this font’s character widths.'))||!r.encodingComplete||r.positions?.length!==[...r.text].length||[...r.text].some(c=>!font.glyphs[String(c.codePointAt(0))]))throw Error(`The text in ${name} cannot be safely decoded with this font. Upload its original font or keep this as a draft for review.`);
  const ids=new Set(runs.map(r=>r.id));
  for(const content of inspected.streams.values()){let mode=0;const edits:{start:number;end:number;text:string}[]=[];for(const [j,op]of content.ops.entries()){if(op.op==='Tr')mode=Number(op.args[0]?.value??0);if(ids.has(`${content.key}:${j}`))edits.push({start:op.start,end:op.end,text:`3 Tr\n${content.raw.slice(op.start,op.end)}\n${mode} Tr`});}if(!edits.length)continue;let raw=content.raw;for(const e of edits.sort((a,b)=>b.start-a.start))raw=raw.slice(0,e.start)+e.text+raw.slice(e.end);const stream=doc.context.flateStream(bytes(raw));if(content.object)for(const[k,v]of content.object.dict.entries())if(!['Length','Filter','DecodeParms'].includes(k.decodeText()))stream.dict.set(k,v);if(content.ref)doc.context.assign(content.ref,stream);if(content.key==='page')page.node.set(PDFName.of('Contents'),doc.context.register(stream));}
  const commands=['q'];for(const r of runs){const total=[...r.text].reduce((sum,c)=>sum+font.glyphs[String(c.codePointAt(0))].advance,0),sx=r.issue?.startsWith('The PDF does not include this font’s character widths.')?r.size/font.unitsPerEm*r.horizontalScale:total?r.width/total:0,sy=r.size/font.unitsPerEm;let x=r.x;commands.push(`q ${r.color.map(n).join(' ')} k`);if(r.clip)commands.push(`${n(r.clip[0])} ${n(r.clip[1])} ${n(r.clip[2]-r.clip[0])} ${n(r.clip[3]-r.clip[1])} re W n`);for(const c of r.text){const glyph=font.glyphs[String(c.codePointAt(0))];if(glyph.path)commands.push(`q ${n(sx)} 0 0 ${n(sy)} ${n(x)} ${n(r.y)} cm ${glyph.path} f Q`);x+=glyph.advance*sx;}commands.push('Q');}commands.push('Q');page.node.addContentStream(doc.context.register(doc.context.flateStream(bytes(commands.join('\n')))));changed=true;
 }
 out.addPage((await out.copyPages(doc,[i]))[0]);if(i===0){const intents=doc.catalog.get(PDFName.of('OutputIntents'));if(intents)out.catalog.set(PDFName.of('OutputIntents'),PDFObjectCopier.for(doc.context,out.context).copy(intents));}
 }
 const data=changed?await out.save():base;const manifest=await refreshSourceFontIssues(data,t,assets);return {base:data,manifest};
}
