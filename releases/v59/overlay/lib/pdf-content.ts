import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, PDFHexString, decodePDFRawStream } from "pdf-lib";
import type { TextRun } from "./template-types";
import {rgbIccTransform} from './icc-conversion';

export type Token = { kind: string; value: any; start: number; end: number };
export type Operation = { op: string; args: Token[]; start: number; end: number; cmyk?: number[] };
export type ContentSource = { key: string; ref?: PDFRef; raw: string; object?: PDFRawStream; ops: Operation[]; uses: number;resources?:PDFDict };
export type FontSource = { name: string; bytes?: Uint8Array; subset: boolean; embedded: boolean;type3?:{matrix:number[];programs:Record<string,string>};characters?:Record<string,{width:number;glyphName?:string}> };
export const latin = (bytes: Uint8Array) => { let result = ""; for (let i = 0; i < bytes.length; i += 8192) result += String.fromCharCode(...bytes.subarray(i, i + 8192)); return result; };
export const bytes = (text: string) => Uint8Array.from(text, c => c.charCodeAt(0) & 255);
const whitespace = (c: string) => !c || /[\s\0]/.test(c);
const delim = (c: string) => whitespace(c) || /[()[\]<>/%]/.test(c);

export function operations(source: string): Operation[] {
  let p = 0;
  function skip() { while (p < source.length) { if (whitespace(source[p])) p++; else if (source[p] === "%") { while (p < source.length && !/[\r\n]/.test(source[p])) p++; } else break; } }
  function token(): Token | null {
    skip(); if (p >= source.length) return null;
    const start = p; const c = source[p++];
    if (c === "(") {
      let value = "", depth = 1;
      while (p < source.length && depth) {
        let ch = source[p++];
        if (ch === "\\") {
          ch = source[p++];
          if (/[0-7]/.test(ch)) { let oct = ch; for (let i = 0; i < 2 && /[0-7]/.test(source[p] || "x"); i++) oct += source[p++]; value += String.fromCharCode(parseInt(oct, 8) & 255); }
          else if (ch === "\r") { if (source[p] === "\n") p++; }
          else if (ch !== "\n") value += ({ n: "\n", r: "\r", t: "\t", b: "\b", f: "\f" } as Record<string, string>)[ch] ?? ch;
        } else if (ch === "(") { depth++; value += ch; }
        else if (ch === ")") { depth--; if (depth) value += ch; }
        else value += ch;
      }
      if (depth) throw new Error("An incomplete text string was found in this PDF.");
      return { kind: "string", value, start, end: p };
    }
    if (c === "<" && source[p] !== "<") {
      const end = source.indexOf(">", p); if (end < 0) throw new Error("An incomplete encoded text string was found.");
      let hex = source.slice(p, end).replace(/\s/g, ""); if (hex.length % 2) hex += "0";
      if (!/^[a-fA-F0-9]*$/.test(hex)) throw new Error("Invalid encoded PDF text.");
      let value = ""; for (let i = 0; i < hex.length; i += 2) value += String.fromCharCode(parseInt(hex.slice(i, i + 2), 16));
      p = end + 1; return { kind: "string", value, start, end: p };
    }
    if (c === "[") { const value = []; skip(); while (p < source.length && source[p] !== "]") { const t = token(); if (t) value.push(t); skip(); } if (source[p++] !== "]") throw new Error("Incomplete PDF array."); return { kind: "array", value, start, end: p }; }
    if (c === "<" && source[p] === "<") { p++; let depth = 1; while (p < source.length && depth) { skip(); if (source.slice(p, p + 2) === ">>") { p += 2; depth--; } else { const t = token(); if (!t) break; } } if (depth) throw new Error("Incomplete PDF dictionary."); return { kind: "dict", value: source.slice(start, p), start, end: p }; }
    if (c === "/") { while (p < source.length && !delim(source[p])) p++; return { kind: "name", value: source.slice(start + 1, p).replace(/#([a-f0-9]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))), start, end: p }; }
    while (p < source.length && !delim(source[p])) p++;
    const word = source.slice(start, p);
    if (/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(word)) return { kind: "number", value: Number(word), start, end: p };
    if (["true", "false", "null"].includes(word)) return { kind: "literal", value: word, start, end: p };
    return { kind: "operator", value: word, start, end: p };
  }
  const output: Operation[] = []; let args: Token[] = [];
  while (p < source.length) {
    const t = token(); if (!t) break;
    if (t.kind !== "operator") { args.push(t); continue; }
    if (t.value === "BI") throw new Error("This PDF uses inline images. Export it again with standard image objects before importing it.");
    output.push({ op: t.value, args, start: args[0]?.start ?? t.start, end: t.end }); args = [];
  }
  return output;
}

export const multiply = (a: number[], b: number[]) => [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
const identity = () => [1,0,0,1,0,0];
const nameOf = (value: any) => value instanceof PDFName ? value.decodeText() : "";
const asNum = (value: any, fallback = 0) => value instanceof PDFNumber ? value.asNumber() : fallback;
const rawStream = (obj: PDFRawStream) => decodePDFRawStream(obj).decode();
const utf16 = (hex: string) => { let result = ""; for (let i=0;i<hex.length;i+=4) result += String.fromCharCode(parseInt(hex.slice(i,i+4),16)); return result; };

function unicodeMap(stream: PDFRawStream | undefined) {
  const map = new Map<number, string>(); let length = 1;
  if (!stream) return { map, length };
  const text = latin(rawStream(stream));
  for (const block of text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const match of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>/gi)) { map.set(parseInt(match[1],16),utf16(match[2])); length = Math.max(length,match[1].length/2); }
  for (const block of text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g)) for (const match of block[1].matchAll(/<([0-9a-f]+)>\s*<([0-9a-f]+)>\s*(<([0-9a-f]+)>|\[([^\]]*)\])/gi)) {
    const from=parseInt(match[1],16), to=parseInt(match[2],16); length=Math.max(length,match[1].length/2);
    if (to-from>65535) continue;
    if (match[4]) for(let c=from;c<=to;c++) map.set(c,utf16((parseInt(match[4],16)+c-from).toString(16).padStart(match[4].length,"0")));
    else {const values=[...match[5].matchAll(/<([0-9a-f]+)>/gi)];for(let c=from;c<=to&&c-from<values.length;c++)map.set(c,utf16(values[c-from][1]));}
  }
  return { map, length };
}

export async function inspectPdf(data: Uint8Array, pageIndex: number, convertRgb: (rgb: number[]) => number[],targetProfile?:Uint8Array) {
  const doc = await PDFDocument.load(data, { updateMetadata: false, capNumbers: true });
  if (doc.isEncrypted) throw new Error("Please upload an unlocked PDF.");
  if (pageIndex < 0 || pageIndex >= doc.getPageCount()) throw new Error("That artwork page does not exist.");
  const page = doc.getPage(pageIndex); const streams = new Map<string, ContentSource>(); const fonts = new Map<string, FontSource>();
  const images = new Map<string, { ref: PDFRef; object: PDFRawStream; width: number; height: number; paintWidth: number; paintHeight: number }>();
  const placements:{id:string;stream:string;opIndex:number;resourceName:string;ref:PDFRef;object:PDFRawStream;matrix:number[];clip?:number[];pixelWidth:number;pixelHeight:number}[]=[];
  const runs: TextRun[] = []; const warnings = new Set<string>(); const issues = new Set<string>(); const printIssues=new Set<string>();
  const context = doc.context;
  const deref = (v: any): any => v instanceof PDFRef ? context.lookup(v) : v;
  const get = (d: any, key: string): any => d instanceof PDFDict ? deref(d.get(PDFName.of(key))) : undefined;
  const iccTransforms=new Map<PDFRawStream,Awaited<ReturnType<typeof rgbIccTransform>>>();
  const namedTransforms=new Map<string,(samples:number[])=>number[]>();
  function resolvedSpace(value:any):string{
    const space=deref(value);if(space instanceof PDFName)return nameOf(space);
    if(space instanceof PDFArray&&nameOf(deref(space.get(0)))==='ICCBased'){
      const profile=deref(space.get(1));if(!(profile instanceof PDFRawStream))return '';
      const count=asNum(get(profile.dict,'N'));
      if(count===4)return 'DeviceCMYK';if(count===1)return 'DeviceGray';
      const transform=iccTransforms.get(profile);if(transform){const key='icc:'+Array.from(iccTransforms.keys()).indexOf(profile);namedTransforms.set(key,samples=>Array.from(transform.convert(Uint8Array.from(samples,v=>Math.round(Math.max(0,Math.min(1,v))*255))),v=>v/255));return key;}
    }
    if(space instanceof PDFArray){
      const kind=nameOf(deref(space.get(0)));
      if(kind==='Pattern')return 'Pattern';
      if(kind==='Indexed'){
        const base=resolvedSpace(space.get(1)),channels=base==='DeviceCMYK'?4:base==='DeviceRGB'?3:base==='DeviceGray'?1:0;
        const lookup=deref(space.get(3)),palette=lookup instanceof PDFRawStream?rawStream(lookup):lookup instanceof PDFString||lookup instanceof PDFHexString?lookup.asBytes():undefined;
        const high=asNum(deref(space.get(2)));
        if(channels&&palette&&palette.length>=(high+1)*channels){const key='indexed:'+String(space);namedTransforms.set(key,samples=>{const index=Math.max(0,Math.min(high,Math.round(samples[0]))),v=Array.from(palette.subarray(index*channels,(index+1)*channels),n=>n/255);return channels===4?v:channels===3?convertRgb(v):[0,0,0,1-v[0]];});return key;}
      }
      if(kind==='Separation'&&['Cyan','Magenta','Yellow','Black'].includes(nameOf(deref(space.get(1))))&&resolvedSpace(space.get(2))==='DeviceCMYK'){
        try{const fn=space.get(3);if(sampleFunction(fn,0).length!==4||sampleFunction(fn,1).length!==4)return '';const key='separation:'+String(space);namedTransforms.set(key,samples=>sampleFunction(fn,samples[0]));return key;}catch{return '';}
      }
    }
    return '';
  }
  for(const[,object]of context.enumerateIndirectObjects())if(object instanceof PDFRawStream&&asNum(get(object.dict,'N'))===3){try{iccTransforms.set(object,await rgbIccTransform(rawStream(object),targetProfile))}catch{/* Preserve unsupported profiles and report their actual use below. */}}
  function sampleFunction(value:any,x:number,depth=0):number[]{
    if(depth>12)throw Error('Nested gradient function');const f=deref(value);
    if(f instanceof PDFArray)return f.asArray().flatMap(v=>sampleFunction(v,x,depth+1));
    if(!(f instanceof PDFDict))throw Error('Unsupported gradient');
    const nums=(key:string)=>{const a=get(f,key);return a instanceof PDFArray?a.asArray().map(v=>asNum(deref(v))):[]};
    const domain=nums('Domain');if(domain.length!==2)throw Error('Unsupported gradient domain');x=Math.max(domain[0],Math.min(domain[1],x));
    let result:number[];
    if(asNum(get(f,'FunctionType'))===2){const c0=nums('C0'),c1=nums('C1'),power=asNum(get(f,'N'));if(!c0.length||c0.length!==c1.length||!Number.isFinite(power))throw Error('Invalid gradient function');result=c0.map((v,i)=>v+Math.pow(x,power)*(c1[i]-v));}
    else if(asNum(get(f,'FunctionType'))===3){const functions=get(f,'Functions'),bounds=[domain[0],...nums('Bounds'),domain[1]],encode=nums('Encode');if(!(functions instanceof PDFArray)||encode.length!==functions.size()*2)throw Error('Invalid stitched gradient');let i=0;while(i<functions.size()-1&&x>=bounds[i+1])i++;const value=encode[i*2]+(x-bounds[i])/(bounds[i+1]-bounds[i])*(encode[i*2+1]-encode[i*2]);result=sampleFunction(functions.get(i),value,depth+1);}
    else throw Error('Unsupported gradient function');
    const range=nums('Range');return result.map((v,i)=>range.length===result.length*2?Math.max(range[i*2],Math.min(range[i*2+1],v)):v);
  }
  const convertedShadings=new Set<PDFDict>();
  function convertShading(shading:any){
    if(!(shading instanceof PDFDict)||convertedShadings.has(shading)||![2,3].includes(asNum(get(shading,'ShadingType'))))return;
    const space=resolvedSpace(get(shading,'ColorSpace'));const conversion=namedTransforms.get(space)??(space==='DeviceRGB'?convertRgb:undefined);if(!conversion)return;
    try{const domain=get(shading,'Domain'),lo=domain instanceof PDFArray?asNum(domain.get(0)):0,hi=domain instanceof PDFArray?asNum(domain.get(1)):1;const count=1025,data=new Uint8Array(count*4);for(let i=0;i<count;i++){const rgb=sampleFunction(get(shading,'Function'),lo+(hi-lo)*i/(count-1));if(rgb.length!==3)throw Error('Invalid RGB gradient');const cmyk=conversion(rgb);for(let c=0;c<4;c++)data[i*4+c]=Math.round(Math.max(0,Math.min(1,cmyk[c]))*255)}const fn=context.flateStream(data,{FunctionType:0,Domain:[lo,hi],Range:[0,1,0,1,0,1,0,1],Size:[count],BitsPerSample:8,Order:1,Encode:[0,count-1],Decode:[0,1,0,1,0,1,0,1]});shading.set(PDFName.of('Function'),context.register(fn));shading.set(PDFName.of('ColorSpace'),PDFName.of('DeviceCMYK'));convertedShadings.add(shading)}catch{/* Keep unsupported gradients intact and flag their use. */}
  }
  for(const[,object]of context.enumerateIndirectObjects())if(object instanceof PDFDict){convertShading(object);convertShading(get(object,'Shading'))}
  const array = (v: any): number[] => v instanceof PDFArray ? v.asArray().map(x=>asNum(deref(x))) : [];
  function safePrintSpace(value:any,resource:any,depth=0):boolean{
    if(depth>8)return false;const space=deref(value);const name=nameOf(space);
    if(name==="DeviceCMYK"||name==="DeviceGray")return true;
    if(name)return safePrintSpace(get(get(resource,"ColorSpace"),name),resource,depth+1);
    if(space instanceof PDFArray){const kind=nameOf(deref(space.get(0)));
      if(kind==="ICCBased"){const profile=deref(space.get(1));return profile instanceof PDFRawStream&&[1,4].includes(asNum(get(profile.dict,"N")));}
      if(kind==="DeviceN"||kind==="Separation"){const names=kind==="DeviceN"?(deref(space.get(1))as PDFArray).asArray().map(n=>nameOf(deref(n))):[nameOf(deref(space.get(1)))];return names.every(n=>["Cyan","Magenta","Yellow","Black","None","All"].includes(n))&&safePrintSpace(space.get(2),resource,depth+1);}
    }return false;
  }
  const checkedMasks=new Set<any>();
  function checkMask(form:any,depth=0){
    if(!(form instanceof PDFRawStream)||checkedMasks.has(form)||depth>16)return;checkedMasks.add(form);
    const resource=get(form.dict,"Resources");const shadings=get(resource,"Shading");if(shadings instanceof PDFDict)for(const[,value]of shadings.entries())if(!safePrintSpace(get(deref(value),"ColorSpace"),resource))printIssues.add("A transparency gradient needs a separate colour check before print export.");
    const children=get(resource,"XObject");if(children instanceof PDFDict)for(const[,value]of children.entries())checkMask(deref(value),depth+1);
    const states=get(resource,"ExtGState");if(states instanceof PDFDict)for(const[,value]of states.entries())checkMask(get(get(deref(value),"SMask"),"G"),depth+1);
  }
  const intersect=(a:number[]|undefined,b:number[])=>a?[Math.max(a[0],b[0]),Math.max(a[1],b[1]),Math.min(a[2],b[2]),Math.min(a[3],b[3])]:b;
  const rectangleBounds=(m:number[],box:number[])=>{const [x0,y0,x1,y1]=box;const points=[[x0,y0],[x1,y0],[x0,y1],[x1,y1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);return[Math.min(...points.map(p=>p[0])),Math.min(...points.map(p=>p[1])),Math.max(...points.map(p=>p[0])),Math.max(...points.map(p=>p[1]))];};
  const fontCache = new Map<any, any>();
  function readFont(resource: any, key: string) {
    const dict = get(get(resource,"Font"),key); if (!dict) return null;
    if (fontCache.has(dict)) return fontCache.get(dict);
    const cid = nameOf(get(dict,"Subtype")) === "Type0";
    const descendant = cid ? deref(get(dict,"DescendantFonts")?.get(0)) : dict;
    const descriptor = get(descendant,"FontDescriptor");
    const rawName = nameOf(get(dict,"BaseFont")) || nameOf(get(descendant,"BaseFont")) || nameOf(get(descriptor,"FontName")) || key;
    const name = rawName.replace(/^[A-Z]{6}\+/, "");
    const fontFile = get(descriptor,"FontFile2") || get(descriptor,"FontFile3") || get(descriptor,"FontFile");
    if (!fonts.has(name)) fonts.set(name,{name,subset:/^[A-Z]{6}\+/.test(rawName),embedded:!!fontFile,bytes:fontFile instanceof PDFRawStream ? rawStream(fontFile) : undefined});
    if(nameOf(get(dict,"Subtype"))==='Type3'){
      const procs=get(dict,'CharProcs'),fm=get(dict,'FontMatrix');const programs:Record<string,string>={};
      if(procs instanceof PDFDict)for(const [glyph,value]of procs.entries()){const stream=deref(value);if(stream instanceof PDFRawStream)programs[glyph.decodeText()]=latin(rawStream(stream));}
      fonts.get(name)!.type3={matrix:fm instanceof PDFArray?fm.asArray().map(v=>asNum(deref(v))):[.001,0,0,.001,0,0],programs};
    }
    // Simple fonts consume one byte per character even when their ToUnicode
    // map contains a padded entry (for example <0020> for a space).
    const cmap = unicodeMap(get(dict,"ToUnicode")); cmap.length = cid ? 2 : 1;
    const widths = new Map<number,number>(); let defaultWidth=asNum(get(descendant,"DW"),1000);
    if (cid) {
      const values=get(descendant,"W");if(values instanceof PDFArray){const a=values.asArray();for(let i=0;i<a.length;){const from=asNum(deref(a[i++]));const v=deref(a[i++]);if(v instanceof PDFArray)v.asArray().forEach((n,j)=>widths.set(from+j,asNum(deref(n))));else{const to=asNum(v);const w=asNum(deref(a[i++]));for(let c=from;c<=to&&c-from<65536;c++)widths.set(c,w);}}}
    } else {
      const first=asNum(get(dict,"FirstChar")); const values=get(dict,"Widths"); if(values instanceof PDFArray) values.asArray().forEach((w,i)=>widths.set(first+i,asNum(deref(w))));
      defaultWidth=asNum(get(descriptor,"MissingWidth"),500);
    }
    const encoding=get(dict,"Encoding"); const encName=nameOf(encoding)||nameOf(get(encoding,"BaseEncoding"));
    const differences=get(encoding,"Differences");
    const named:Record<string,string>={exclam:"!",question:"?",bullet:"•",exclamdown:"¡",questiondown:"¿",quotedblleft:"“",quotedblright:"”",quoteleft:"‘",quoteright:"’",endash:"–",emdash:"—",ellipsis:"…",colon:":",semicolon:";",percent:"%",dollar:"$",numbersign:"#",asterisk:"*",equal:"=",less:"<",greater:">",bracketleft:"[",bracketright:"]",braceleft:"{",braceright:"}",backslash:"\\",bar:"|",asciitilde:"~",asciicircum:"^",grave:"`",space:" ",zero:"0",one:"1",two:"2",three:"3",four:"4",five:"5",six:"6",seven:"7",eight:"8",nine:"9",period:".",comma:",",hyphen:"-",parenleft:"(",parenright:")",plus:"+",slash:"/",ampersand:"&",at:"@",quotesingle:"'",quotedbl:'"',underscore:"_"};
    const diff=new Map<number,string>(),glyphNames=new Map<number,string>();if(differences instanceof PDFArray){let code=0;for(const value of differences.asArray()){const v=deref(value);if(v instanceof PDFNumber)code=v.asNumber();else{const n=nameOf(v);glyphNames.set(code,n);diff.set(code++,n.length===1?n:named[n]??"�");}}}
    const decode=(text:string)=>{const result=[];for(let i=0;i<text.length;i+=cmap.length){let code=0;for(let j=0;j<cmap.length;j++)code=(code<<8)|(text.charCodeAt(i+j)||0);const fallback=cid?"�":diff.get(code)??new TextDecoder(encName==="MacRomanEncoding"?"macintosh":"windows-1252").decode(new Uint8Array([code]));const value=cmap.map.get(code)??fallback,width=widths.get(code)??defaultWidth;result.push({text:value,width,code});if([...value].length===1&&value!=="�"){const source=fonts.get(name)!;source.characters??={};source.characters[String(value.codePointAt(0))]={width,glyphName:cid?undefined:glyphNames.get(code)??Object.entries(named).find(([,char])=>char===value)?.[0]??value};}}return result;};
    const font={name,decode,hasWidths:widths.size>0};fontCache.set(dict,font);return font;
  }
  type State={ctm:number[];tm:number[];tlm:number[];fontKey:string;size:number;charSpace:number;wordSpace:number;horizontal:number;leading:number;rise:number;color:number[];renderMode:number;pattern:boolean;opacity:number;complexClip:boolean;clip?:number[];fillSpace:string;strokeSpace:string};
  const initial=():State=>({ctm:identity(),tm:identity(),tlm:identity(),fontKey:"",size:12,charSpace:0,wordSpace:0,horizontal:1,leading:0,rise:0,color:[0,0,0,1],renderMode:0,pattern:false,opacity:1,complexClip:false,fillSpace:"DeviceGray",strokeSpace:"DeviceGray"});
  function process(key:string, raw:string, resource:any, inherited:State, ref?:PDFRef, object?:PDFRawStream, depth=0) {
    if(depth>16) {issues.add("Nested artwork exceeds the supported import depth.");return;}
    let source=streams.get(key);if(!source){source={key,ref,object,raw,ops:operations(raw),uses:0,resources:resource};streams.set(key,source);}source.uses++;
    let state:State=structuredClone(inherited);const stack:State[]=[];let pathRect:number[]|undefined;let complexPath=false;
    const advanceLine=(tx:number,ty:number)=>{state.tlm=multiply(state.tlm,[1,0,0,1,tx,ty]);state.tm=[...state.tlm];};
    for(const [opIndex,op]of source.ops.entries()){
      const a=op.args.map(t=>t.value);const n=(i:number)=>Number(a[i]??0);
      switch(op.op){
        case"q":stack.push(structuredClone(state));break;case"Q":state=stack.pop()??state;break;
        case"cm":state.ctm=multiply(state.ctm,a as number[]);break;
        case"BT":state.tm=identity();state.tlm=identity();break;
        case"Tf":state.fontKey=String(a[0]);state.size=n(1);break;
        case"Tm":state.tm=a as number[];state.tlm=[...state.tm];break;
        case"Td":advanceLine(n(0),n(1));break;case"TD":state.leading=-n(1);advanceLine(n(0),n(1));break;case"T*":advanceLine(0,-state.leading);break;
        case"Tc":state.charSpace=n(0);break;case"Tw":state.wordSpace=n(0);break;case"Tz":state.horizontal=n(0)/100;break;case"TL":state.leading=n(0);break;case"Ts":state.rise=n(0);break;case"Tr":state.renderMode=n(0);break;
        case"k":state.color=a as number[];state.fillSpace="DeviceCMYK";state.pattern=false;break;
        case"rg":{const convert=namedTransforms.get(resolvedSpace(get(get(resource,'ColorSpace'),'DefaultRGB')))??convertRgb;state.color=convert(a as number[]);op.cmyk=state.color;state.fillSpace="DeviceRGB";state.pattern=false;break;}
        case"g":state.color=[0,0,0,1-n(0)];state.fillSpace="DeviceGray";state.pattern=false;break;
        case"K":state.strokeSpace="DeviceCMYK";break;case"RG":{const convert=namedTransforms.get(resolvedSpace(get(get(resource,'ColorSpace'),'DefaultRGB')))??convertRgb;op.cmyk=convert(a as number[]);state.strokeSpace="DeviceRGB";break;}case"G":state.strokeSpace="DeviceGray";break;
        case"cs":case"CS":{
          const requested=String(a[0]);const space=["DeviceCMYK","DeviceRGB","DeviceGray"].includes(requested)?requested:resolvedSpace(get(get(resource,"ColorSpace"),requested));
          if(requested==='Pattern'||space==='Pattern'){if(op.op==='cs'){state.fillSpace='Pattern';state.pattern=true}else state.strokeSpace='Pattern';break;}
          const known=["DeviceCMYK","DeviceRGB","DeviceGray"].includes(space)||namedTransforms.has(space);
          if(!known)printIssues.add("A fixed vector colour or pattern needs printer colour review. Its original appearance is preserved.");
          const defaults=namedTransforms.get(space)?.([0,0,0])??(space==="DeviceCMYK"?[0,0,0,1]:space==="DeviceRGB"?convertRgb([0,0,0]):[0,0,0,1]);
          if(known)op.cmyk=defaults;
          if(op.op==="cs"){state.fillSpace=space;state.pattern=!known;state.color=defaults;}else state.strokeSpace=space;break;
        }
        case"sc":case"scn":case"SC":case"SCN":{
          const fill=op.op===op.op.toLowerCase();const space=fill?state.fillSpace:state.strokeSpace;
          if(space==='Pattern'){const pattern=get(get(resource,'Pattern'),String(a[a.length-1])),shading=get(pattern,'Shading');if(!(pattern instanceof PDFDict)||asNum(get(pattern,'PatternType'))!==2||!safePrintSpace(get(shading,'ColorSpace'),resource))printIssues.add('A fixed vector colour or pattern needs printer colour review. Its original appearance is preserved.');break;}
          const converted=namedTransforms.has(space)&&a.length===(space.startsWith("icc:")?3:1)?namedTransforms.get(space)!(a as number[]):space==="DeviceCMYK"&&a.length===4?a as number[]:space==="DeviceRGB"&&a.length===3?convertRgb(a as number[]):space==="DeviceGray"&&a.length===1?[0,0,0,1-n(0)]:undefined;
          if(converted){op.cmyk=converted;if(fill)state.color=converted;}else printIssues.add("A fixed vector colour or pattern needs printer colour review. Its original appearance is preserved.");break;
        }
        case"re":if(pathRect||Math.abs(state.ctm[1])>.00001||Math.abs(state.ctm[2])>.00001)complexPath=true;pathRect=rectangleBounds(state.ctm,[n(0),n(1),n(0)+n(2),n(1)+n(3)]);break;
        // A standalone move after a rectangle adds no clipping area.
        case"m":break;
        case"l":case"c":case"v":case"y":complexPath=true;break;
        case"W":case"W*":if(pathRect&&!complexPath)state.clip=intersect(state.clip,pathRect);else state.complexClip=true;break;
        case"n":case"f":case"f*":case"F":case"S":case"s":case"B":case"B*":case"b":case"b*":pathRect=undefined;complexPath=false;break;
        case"sh":{const shading=get(get(resource,"Shading"),String(a[0]));if(!safePrintSpace(get(shading,"ColorSpace"),resource))printIssues.add("A gradient uses a colour space that needs conversion before print export.");break;}
        case"gs":{const gs=get(get(resource,"ExtGState"),String(a[0]));state.opacity=asNum(get(gs,"ca"),state.opacity);const blend=nameOf(get(gs,"BM"));const mask=get(gs,"SMask");if((blend&&blend!=="Normal"&&blend!=="Compatible")||(mask&&nameOf(mask)!=="None"))state.opacity=0;checkMask(get(mask,"G"));if(state.opacity!==1)warnings.add("The source uses transparency; it is retained in the generated PDF.");break;}
        case"Do":{
          const xObjects=get(resource,"XObject");const objectRef=xObjects?.get(PDFName.of(String(a[0])));const x=deref(objectRef);if(!(x instanceof PDFRawStream))break;
          if(nameOf(get(x.dict,"Subtype"))==="Form"){
            const matrix=array(get(x.dict,"Matrix"));const next=structuredClone(state);next.ctm=multiply(state.ctm,matrix.length===6?matrix:identity());
            const bounds=array(get(x.dict,"BBox"));if(bounds.length===4){if(Math.abs(next.ctm[1])<.00001&&Math.abs(next.ctm[2])<.00001)next.clip=intersect(next.clip,rectangleBounds(next.ctm,bounds));else next.complexClip=true;}
            process(String(objectRef),latin(rawStream(x)),get(x.dict,"Resources")??resource,next,objectRef instanceof PDFRef?objectRef:undefined,x,depth+1);
          }else if(nameOf(get(x.dict,"Subtype"))==="Image"&&objectRef instanceof PDFRef){images.set(String(objectRef),{ref:objectRef,object:x,width:asNum(get(x.dict,"Width")),height:asNum(get(x.dict,"Height")),paintWidth:Math.hypot(state.ctm[0],state.ctm[1]),paintHeight:Math.hypot(state.ctm[2],state.ctm[3])});if(get(x.dict,"ImageMask")?.toString()!=="true"&&get(x.dict,"StudioGeneratedBleed")?.toString()!=="true")placements.push({id:`${key}:${opIndex}`,stream:key,opIndex,resourceName:String(a[0]),ref:objectRef,object:x,matrix:[...state.ctm],clip:state.clip,pixelWidth:asNum(get(x.dict,"Width")),pixelHeight:asNum(get(x.dict,"Height"))});}
          break;
        }
        case"Tj":case"TJ":case"'":case'"':{
          if(op.op==="'")advanceLine(0,-state.leading);if(op.op==='"'){state.wordSpace=n(0);state.charSpace=n(1);advanceLine(0,-state.leading);}
          const operand=op.args[op.args.length-1];const pieces:Token[]=operand?.kind==="array"?operand.value:operand?[operand]:[];
          const font=readFont(resource,state.fontKey);if(!font){issues.add("Some text uses a font that could not be identified.");break;}
          let text="",advance=0;let kerning=false;const positions:number[]=[];let ligatures=false;
          for(const piece of pieces){if(piece.kind==="number"){advance-=piece.value/1000*state.size*state.horizontal;if(Math.abs(piece.value)>0.01)kerning=true;}else if(piece.kind==="string"){for(const glyph of font.decode(piece.value)){if([...glyph.text].length!==1)ligatures=true;positions.push(advance);text+=glyph.text;advance+=(glyph.width/1000*state.size+state.charSpace+(glyph.code===32?state.wordSpace:0))*state.horizontal;}}}
          const m=multiply(state.ctm,state.tm);const x=m[4]+m[2]*state.rise,y=m[5]+m[3]*state.rise;
          const glyphX=m[0]*state.size*state.horizontal,glyphY=m[3]*state.size;
          const horizontal=Math.abs(m[1])<.00001&&Math.abs(m[2])<.00001&&glyphX>0&&glyphY>0;
          const supported=horizontal&&state.renderMode===0&&!state.pattern&&!state.complexClip&&state.opacity===1&&font.hasWidths&&!ligatures;
          const reason=!horizontal?"This text is rotated or mirrored.":state.complexClip?"This text is inside a non-rectangular clipping path.":state.opacity!==1?"This text has transparency or a blend effect.":state.renderMode!==0?"This text uses an outline or clipping rendering mode.":state.pattern?"This text uses a custom colour fill.":!font.hasWidths?"The PDF does not include this font’s character widths.":ligatures?"This text uses combined glyphs that need manual preparation.":undefined;
          if(text.trim()&&state.renderMode!==3)runs.push({id:`${key}:${opIndex}`,stream:key,opIndex,text,x,y,bounds:rectangleBounds(m,[0,-state.size*.2,advance,state.size*.75]),width:advance*m[0],size:Math.abs(glyphY),horizontalScale:glyphY?glyphX/glyphY:1,fontName:font.name,color:[...state.color],charSpace:state.charSpace*m[0]*state.horizontal,wordSpace:state.wordSpace*m[0]*state.horizontal,role:"fixed",label:text,supported,encodingComplete:!text.includes("�"),clip:state.clip,positions:positions.map(p=>p*m[0]),issue:!supported?`${reason} It is kept as fixed artwork.`:kerning?"Original character spacing is retained. Check new wording in the preview.":undefined});
          state.tm=multiply(state.tm,[1,0,0,1,advance,0]);break;
        }
      }
    }
  }
  const contents=page.node.Contents();const parts=contents instanceof PDFArray?contents.asArray():contents?[contents]:[];
  const raw=parts.map(p=>deref(p)).filter(p=>p instanceof PDFRawStream).map(p=>latin(rawStream(p))).join("\n");
  try{process("page",raw,page.node.Resources(),initial())}finally{for(const transform of iccTransforms.values())transform.close()}
  for(const run of runs)if((streams.get(run.stream)?.uses??0)>1){run.supported=false;run.issue="This text object is reused in the artwork. Separate its instances in the source before making it dynamic.";}
  if(page.getRotation().angle%360!==0)issues.add("The artwork page is rotated. Export an upright page before creating the template.");
  if(asNum(get(page.node,"UserUnit"),1)!==1)issues.add("This PDF uses a custom page unit. Export it using ordinary PDF points.");
  const media=page.getMediaBox(),crop=page.getCropBox();
  if(media.x!==0||media.y!==0)issues.add("The page has an offset origin. Export a page whose artwork starts at the page origin.");
  const hasHiddenMargins=Math.abs(crop.x-media.x)>.1||Math.abs(crop.y-media.y)>.1||Math.abs(crop.width-media.width)>.1||Math.abs(crop.height-media.height)>.1;
  if(hasHiddenMargins)warnings.add("The preview includes the source’s outer margins and bleed, which its crop box normally hides.");
  const annotations=get(page.node,"Annots");if(annotations instanceof PDFArray&&annotations.asArray().some(a=>nameOf(get(deref(a),"Subtype"))!=="Link"))issues.add("This page has visible annotations or form fields. Flatten those into the source artwork before importing it.");
  if(!runs.length)warnings.add("No readable text was found. This page may contain outlined lettering or a flattened image. A PDF with live text is needed for automatic dynamic fields.");
  return {doc,page,streams,fonts,images,placements,runs,warnings:[...warnings],issues:[...issues],printIssues:[...printIssues],width:page.getWidth(),height:page.getHeight(),pageCount:doc.getPageCount(),trim:page.getTrimBox(),media,hasHiddenMargins};
}
