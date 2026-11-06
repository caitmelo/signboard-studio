import type {ContentGroup,FontData,SavedTemplate,TextRun,TextStyleRange,RichTextValue} from './template-types';
export function fontStyle(name:string){return {bold:/bold|semibold|demi|black|(?:sanl-bol|no9l-med)/i.test(name),italic:/italic|oblique|ita$|(?:pro-.*it$)/i.test(name)};}
export function fontFamily(name:string){return name.replace(/^[A-Z]{6}\+/,'').replace(/(?:[-, ]?(?:regular|semibold|extrabold|extralight|medium|bold|black|thin|light|italic|oblique|regita|bolita|medita|reg|bol|med|ita|it))+$/ig,'').replace(/[^a-z0-9]/gi,'').toLowerCase();}
export function styleFont(name:string,bold:boolean,italic:boolean,fonts:Record<string,FontData>){const current=fontStyle(name);if(fonts[name]&&current.bold===bold&&current.italic===italic)return name;const family=fontFamily(name);const candidates=Object.keys(fonts).filter(n=>fontFamily(n)===family&&fontStyle(n).bold===bold&&fontStyle(n).italic===italic);if(!candidates.length)throw new Error(`The matching ${bold?'bold ':''}${italic?'italic':'normal'} font for ${name} is unavailable.`);return candidates.find(n=>!/semi|black|extra|light|thin|medium/i.test(n))??candidates[0];}
export async function addStyleFonts(fonts:Record<string,FontData>,load?:(name:string)=>Promise<FontData|undefined>){if(!load)return fonts;const requests=new Set<string>();for(const name of Object.keys(fonts)){const family=fontFamily(name);if(/icon|symbol|dingbat/.test(family))continue;const base=name.replace(/^[A-Z]{6}\+/,'').replace(/(?:[-, ]?(?:regular|semibold|extrabold|extralight|medium|bold|black|thin|light|italic|oblique|regita|bolita|medita|reg|bol|med|ita|it))+$/ig,'');const names=family==='nimbussanl'?['NimbusSanL-Reg','NimbusSanL-Bol','NimbusSanL-RegIta','NimbusSanL-BolIta']:family==='nimbusromno9l'?['NimbusRomNo9L-Reg','NimbusRomNo9L-Med','NimbusRomNo9L-RegIta','NimbusRomNo9L-MedIta']:family==='calibri'?['Calibri','Calibri-Bold','Calibri-Italic','Calibri-BoldItalic']:[`${base}-Regular`,`${base}-Bold`,`${base}-Italic`,`${base}-BoldItalic`];names.forEach(n=>requests.add(n));}const next={...fonts};await Promise.all([...requests].map(async n=>{if(next[n])return;try{const f=await load(n);if(f)next[n]=f;}catch{/* Keep unavailable styles explicit; never synthesize a different face. */}}));return next;}
export function defaultRichText(group:ContentGroup,fields:TextRun[],values:Record<string,string>={}):RichTextValue{
 let text='';const styles:TextStyleRange[]=[],inline:Record<string,string>={};let count=0;
 for(const f of fields){const raw=(values[f.id]??f.text).trim();if(text){const prev=fields[fields.indexOf(f)-1];const list=fields.some(r=>/^[•●▪]$/.test(r.text.trim()));text+=Math.abs(prev.y-f.y)<Math.min(prev.size,f.size)*.3?' ':group.kind==='details'&&!list?' ':'\n';}const style=fontStyle(f.fontName);let part=raw;
  if(group.kind==='details'&&style.bold&&/^\d[\w/ -]*.*\b(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|place|pl|crescent|cres|way|parade|pde)\b/i.test(raw)){const key=++count===1?'address':`address_${count}`;inline[key]=raw;part=`{{${key}}}`;}
  const start=text.length;text+=part;if(style.bold||style.italic)styles.push({start,end:text.length,...style});
 }
 return {rich:true,text,styles,inline};
}
export function remapStyles(before:string,after:string,styles:TextStyleRange[]){let start=0;while(start<before.length&&start<after.length&&before[start]===after[start])start++;let oldEnd=before.length,newEnd=after.length;while(oldEnd>start&&newEnd>start&&before[oldEnd-1]===after[newEnd-1]){oldEnd--;newEnd--;}const delta=newEnd-oldEnd;return styles.flatMap(s=>s.end<=start?[s]:s.start>=oldEnd?[{...s,start:s.start+delta,end:s.end+delta}]:[{...s,end:Math.min(s.end,start)},{...s,start:newEnd,end:s.end+delta}].filter(r=>r.end>r.start));}
export function applyStyle(styles:TextStyleRange[],start:number,end:number,bold:boolean,italic:boolean){return [...styles.flatMap(s=>s.end<=start||s.start>=end?[s]:[{...s,end:start},{...s,start:end}].filter(r=>r.end>r.start)),{start,end,bold,italic}].sort((a,b)=>a.start-b.start);}
type StyledChar={c:string;bold?:boolean;italic?:boolean};
export function expandRich(value:RichTextValue):StyledChar[]{
 if(typeof value.text!=='string'||value.text.length>3000||!value.text.trim())throw new Error('Enter 1–3,000 characters.');const styles=value.styles??[];if(styles.length>1000||styles.some(s=>!Number.isInteger(s.start)||!Number.isInteger(s.end)||s.start<0||s.end>value.text.length||s.end<=s.start||typeof s.bold!=='boolean'||typeof s.italic!=='boolean'))throw new Error('Invalid text formatting range.');
 const result:StyledChar[]=[];const pattern=/\{\{([a-zA-Z0-9_]+)\}\}|[\s\S]/gu;
 for(const m of value.text.matchAll(pattern)){const pos=m.index!;const style=styles.filter(s=>s.start<=pos&&s.end>pos).at(-1);const text=m[1]?(value.inline?.[m[1]]??''):m[0];if(m[1]&&(!text||text.length>300))throw new Error(`Enter the ${m[1]} field (up to 300 characters).`);for(const c of text)result.push({c,bold:m[1]&&/^address(?:_|$)/.test(m[1])?true:style?.bold,italic:style?.italic});}
 if(result.length>4000)throw new Error('The text is too long.');return result;
}
function layoutAtSize(fields:TextRun[],value:RichTextValue,template:SavedTemplate,right:number,paragraph:boolean){
 const chars=expandRich(value),rows:TextRun[][]=[];for(const f of fields){const row=rows.find(r=>Math.abs(r[0].y-f.y)<Math.min(r[0].size,f.size)*.3);if(row)row.push(f);else rows.push([f]);}rows.sort((a,b)=>b[0].y-a[0].y);rows.forEach(r=>r.sort((a,b)=>a.x-b.x));
 const frameLeft=Math.min(...fields.map(f=>f.x));
 const output:TextRun[]=[],values:Record<string,string>={};let rowIndex=0,x=rows[0][0].x,sequence=0;let last:TextRun|undefined;
 function nextRow(){rowIndex++;if(!rows[rowIndex])throw new Error(`Text exceeds the ${rows.length}-line box.`);x=rows[rowIndex][0].x;last=undefined;}
 function measure(ch:StyledChar){const source=rows[rowIndex][0],base=paragraph?{bold:false,italic:false}:fontStyle(source.fontName);const name=styleFont(source.fontName,ch.bold??base.bold,ch.italic??base.italic,template.fonts),font=template.fonts[name],glyph=font.glyphs[String(ch.c.codePointAt(0))];if(!glyph)throw new Error(`${name} is missing “${ch.c}”.`);return {source,name,width:glyph.advance*source.size/font.unitsPerEm*source.horizontalScale+source.charSpace+(ch.c===' '?source.wordSpace:0)};}
 const words:StyledChar[][]=[];for(const ch of chars){if(ch.c==='\r')continue;if(ch.c==='\n'||/\s/.test(ch.c)){if(ch.c==='\n')words.push([ch]);else if(words.length&&words.at(-1)![0].c!==' ')words.push([{...ch,c:' '}]);}else {const prev=words.at(-1);if(prev&&prev[0].c!==' '&&prev[0].c!=='\n')prev.push(ch);else words.push([ch]);}}
 for(const word of words){if(word[0].c==='\n'){nextRow();continue;}if(word[0].c===' '&&x===rows[rowIndex][0].x)continue;let width=word.reduce((n,c)=>n+measure(c).width,0);if(x+width>right+.01){if(word[0].c===' ')continue;if(x>rows[rowIndex][0].x){nextRow();width=word.reduce((n,c)=>n+measure(c).width,0);}if(x+width>right+.01)throw new Error('A word is too wide for this text box.');}
  for(const ch of word){const {source,name,width:w}=measure(ch);if(!last||last.fontName!==name){last={...source,id:`${fields[0].id}__rich_${sequence++}`,fontName:name,x,text:'',width:0,positions:undefined,clip:[frameLeft-source.size*.2,source.y-source.size*.35,right+source.size*.1,source.y+source.size],align:'left',label:fields[0].label===fields[0].text?'Edited text':fields[0].label};output.push(last);values[last.id]='';}values[last.id]+=ch.c;last.width+=w;x+=w;}
  const row=rows[rowIndex];if(/^[•●▪]$/.test(word.map(c=>c.c).join(''))&&row.length>1&&/^[•●▪]$/.test(row[0].text.trim())){x=row[1].x;last=undefined;}
 }
 for(const row of rows){const source=row[0];if(!source.align||source.align==='left')continue;
  const parts=output.filter(f=>Math.abs(f.y-source.y)<.01);if(!parts.length)continue;
  const left=Math.min(...parts.map(f=>f.x)),width=Math.max(...parts.map(f=>f.x+f.width))-left;
  const originalRight=Math.max(...row.map(f=>f.x+f.width));const shift=(source.align==='center'?(source.x+originalRight-width)/2:originalRight-width)-left;
  for(const f of parts)f.x+=shift;
 }
 return {fields:output,values};
}

// Fit within the source column; never silently extend into neighbouring artwork.
export function layoutRich(fields:TextRun[],value:RichTextValue,template:SavedTemplate,right:number,paragraph:boolean){
 let failure:unknown;
 for(const ratio of [1,.95,.9,.85,.8,.75,.7]){
  try{return layoutAtSize(fields.map(f=>({...f,size:f.size*ratio,charSpace:f.charSpace*ratio,wordSpace:f.wordSpace*ratio})),value,template,right,paragraph);}
  catch(e){if(!(e instanceof Error)||!/(?:line box|too wide)/.test(e.message))throw e;failure=e;}
 }
 throw failure;
}
