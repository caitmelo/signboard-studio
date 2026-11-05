import {recoverOutlinedHeadings} from './outlined-text';
import {inferTextAlignment} from './text-alignment';
import {matchEmbeddedFont} from './match-embedded-font';
import {fontFromType3} from './type3-font';
import {refreshGeneratedBleed} from './refresh-bleed';
import {sceneFromPdf,MM as SCENE_MM} from './design-scene';
import {addStyleFonts} from './rich-text';
import {fontRequest} from './google-fonts';
import { PDFArray, PDFObjectCopier, PDFDict, PDFDocument, PDFHexString, PDFString, PDFName, PDFNumber, PDFRawStream, PDFRef, decodePDFRawStream } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import jpeg from "jpeg-js";
import {inferContentGroups,resolveContent,bindGroup} from "./content-groups";
import {fontFromCff,outlineGlyph} from "./template-font";
import { inspectPdf, latin, bytes, multiply, type ContentSource } from "./pdf-content";
import { colourConverter } from "./template-colour";
import {isProcessColourSpace} from './pdf-process-colour';
import {rgbIccTransform} from './icc-conversion';
import {decodePrintJpeg} from './decode-print-jpeg';
import {documentColour,profileText,profileBytes} from './document-colour';
import { analyseMedia, wrapMediaSlots, applyMedia, addQrRegions } from "./template-media";
import {exportScale,exportPercent,suggestPrintSpec,needsBleed,bleedInsets,sourceFrame,printGeometry,printRuleIssues,productProfile,isSignboard,bleedDescription,normalizeSavedTemplate} from "./print-specs";
import type { Analysis, FontData, SavedTemplate, TextRun, PrintSpec, MediaValues, ContentValues } from "./template-types";

const MM=72/25.4;
const normalize=(name:string)=>name.replace(/^[A-Z]{6}\+/,"").replace(/[^a-z0-9]/gi,"").toLowerCase();
const number=(n:number)=>{if(!Number.isFinite(n))throw new Error("Invalid layout coordinate.");return Number(n.toFixed(7)).toString();};
export type EngineAssets={poppins:FontData;icc:Uint8Array;table:Uint8Array;fontNames?:string[];loadFontSample?:(name:string,characters:number[])=>Promise<FontData|undefined>;loadFont?:(name:string)=>Promise<FontData|undefined>};
let assetsPromise:Promise<EngineAssets>|undefined;
export async function loadEngineAssets():Promise<EngineAssets>{
  if(!assetsPromise)assetsPromise=Promise.all([fetch("/template/edgewrap.json").then(r=>{if(!r.ok)throw new Error("The font could not be loaded.");return r.json() as Promise<any>;}),fetch("/template/colour/CGATS001Compat-v2-micro.icc").then(r=>r.arrayBuffer()),fetch("/template/rgb-to-cmyk-33.bin").then(r=>r.arrayBuffer()),fetch("/template/fonts/manifest.json").then(r=>{if(!r.ok)throw new Error("The matching font catalogue could not load. Please retry.");return r.json()as Promise<Record<string,string>>;})]).then(([p,icc,table,catalogue])=>{
    const available=new Map(Object.entries(catalogue).map(([name,file])=>[normalize(name),file]));const cache=new Map<string,Promise<FontData|undefined>>();
    return{fontNames:Object.keys(catalogue),async loadFontSample(name:string,characters:number[]){const file=available.get(normalize(name));if(!file)return undefined;const r=await fetch(`/template/fonts/${file}`);if(!r.ok)return undefined;return fontFromFile(new Uint8Array(await r.arrayBuffer()),undefined,name,characters);},poppins:{name:"Poppins-SemiBold",unitsPerEm:p.unitsPerEm,glyphs:p.glyphs,source:"catalogue"as const},icc:new Uint8Array(icc),table:new Uint8Array(table),loadFont(name:string){const file=available.get(normalize(name));if(!file){const key='google:'+name;if(!cache.has(key))cache.set(key,(async()=>{try{const request=fontRequest(name);const query=new URLSearchParams({family:request.family,weight:String(request.weight),italic:request.italic?'1':'0'});const response=await fetch(`/api/fonts?${query}`);if(!response.ok)return undefined;const payload=await response.json()as{files:string[]};let found:FontData|undefined;for(const data of payload.files){const binary=atob(data);const font=fontFromFile(Uint8Array.from(binary,c=>c.charCodeAt(0)),name);found=found?{...found,glyphs:{...found.glyphs,...font.glyphs}}:font;}return found?{...found,source:'catalogue' as const,subset:false}:undefined;}catch{return undefined;}})());const pending=cache.get(key)!;return pending.then(font=>{if(!font)cache.delete(key);return font;});}if(!cache.has(file))cache.set(file,fetch(`/template/fonts/${file}`).then(async r=>{if(!r.ok)throw new Error(`${name} could not load. Please retry.`);return{...fontFromFile(new Uint8Array(await r.arrayBuffer()),name),source:"catalogue"as const,subset:false};}).catch(e=>{cache.delete(file);throw e;}));return cache.get(file)!;}};
  }).catch(e=>{assetsPromise=undefined;throw e;});
  return assetsPromise;
}

export function fontFromFile(data:Uint8Array,targetName?:string,embeddedName?:string,characters?:number[]):FontData{
  const font=fontkit.create(data) as any;
  if(!font?.characterSet||!font?.unitsPerEm)throw new Error("Upload a single TTF, OTF or WOFF font file.");
  // PDF subsets can omit the OpenType name table while retaining valid outlines and cmap.
  let actual:string|undefined;try{actual=font.postscriptName||font.fullName||font.familyName;}catch{}
  if(targetName&&!actual)throw new Error("This font has no family metadata. Upload the matching full font file.");
  const aliases:Record<string,string>={poppins:"poppinsregular",nimbusromno9lmed:"nimbusromanbold",nimbusromno9lreg:"nimbusromanregular"};
  if(targetName&&actual&&(aliases[normalize(targetName)]??normalize(targetName))!==(aliases[normalize(actual)]??normalize(actual))&&normalize(actual)!==normalize(targetName)+'regular')throw new Error(`This file is ${actual}. The selected text needs ${targetName}.`);
  const glyphs:FontData["glyphs"]={};
  for(const cp of (characters??font.characterSet.slice(0,6000))){
    if(cp<32||cp===127)continue;
    const g=font.glyphForCodePoint(cp);if(!g||g.id===0)continue;
    const outlined=outlineGlyph(g,g.advanceWidth);
    if(!outlined.path&&cp!==32&&cp!==160)continue;
    glyphs[String(cp)]=outlined;
  }
  if(Object.keys(glyphs).length<2)throw new Error("This font does not contain usable character outlines.");
  return {name:targetName||actual||embeddedName||"Unnamed font",unitsPerEm:font.unitsPerEm,glyphs,source:"upload",subset:false};
}


export function mergeRuns(input:TextRun[]):TextRun[]{
  // Process left-to-right with a transitive sort. PDF drawing order can interleave
  // neighbouring columns, so the last emitted run is not necessarily this run's neighbour.
  const sorted=[...input].sort((a,b)=>a.x-b.x||b.y-a.y);const result:TextRun[]=[];
  const compatible=(a:TextRun,b:TextRun)=>a.supported&&b.supported&&a.fontName===b.fontName&&Math.abs(a.y-b.y)<Math.max(.1,Math.min(a.size,b.size)*.03)&&Math.abs(a.size-b.size)<.05&&Math.abs(a.horizontalScale-b.horizontalScale)<.001&&JSON.stringify(a.color)===JSON.stringify(b.color);
  for(const original of sorted){const run={...original,positions:original.positions?[...original.positions]:undefined,members:[original.id]};
    const prev=result.filter(r=>compatible(r,run)&&run.x-r.x-r.width>=-run.size*.4&&run.x-r.x-r.width<run.size*.45).sort((a,b)=>Math.abs(run.x-a.x-a.width)-Math.abs(run.x-b.x-b.width))[0];const gap=prev?run.x-prev.x-prev.width:Infinity;
    const duplicate=result.find(r=>r.supported&&run.supported&&r.text===run.text&&r.fontName===run.fontName&&Math.abs(r.x-run.x)<(/@|\.(?:com|au|net)\b/i.test(run.text)?run.size*.2:.01)&&Math.abs(r.y-run.y)<(/@|\.(?:com|au|net)\b/i.test(run.text)?run.size*.5:.01)&&Math.abs(r.size-run.size)<.01&&JSON.stringify(r.color)===JSON.stringify(run.color));
    if(duplicate){duplicate.members!.push(run.id);continue;}
    if(prev){
      const needsSpace=gap>run.size*.12&&!prev.text.endsWith(" ")&&!run.text.startsWith(" ");
      const offset=run.x-prev.x;if(needsSpace){prev.text+=" ";prev.positions?.push(prev.width);}
      prev.positions?.push(...(run.positions??[]).map(p=>p+offset));prev.text+=run.text;prev.label=prev.text;prev.width=offset+run.width;prev.members!.push(run.id);
    }else result.push(run);
  }
  const phones=result.filter(r=>r.supported&&r.encodingComplete&&/^[+\d][\d\s().-]+$/.test(r.text.trim())&&r.text.replace(/\D/g,"").length>=8&&r.text.replace(/\D/g,"").length<=15).sort((a,b)=>a.y-b.y);
  const paired:{phone:TextRun;name:TextRun}[]=[];const used=new Set<string>();
  for(const phone of phones){const center=phone.x+phone.width/2;const names=result.filter(r=>r!==phone&&!used.has(r.id)&&r.supported&&r.encodingComplete&&/^[\p{L}][\p{L}\p{M}'’.\-\s]{1,60}$/u.test(r.text.trim())&&!/^(?:by appointment|for sale|view|auction|apartment|house)$/i.test(r.text.trim()));
    const row=names.filter(r=>Math.abs(r.y-phone.y)<Math.min(r.size,phone.size)*.3&&r.x+r.width<phone.x+1&&phone.x-r.x-r.width<phone.size*30).sort((a,b)=>b.x-a.x)[0];
    const above=names.filter(r=>r.y>phone.y&&r.y-phone.y<phone.size*2.8&&Math.abs(r.x+r.width/2-center)<Math.max(60,phone.width*.6)).sort((a,b)=>(a.y-phone.y)+Math.abs(a.x+a.width/2-center)*.3-(b.y-phone.y)-Math.abs(b.x+b.width/2-center)*.3)[0];
    const name=above&&Math.abs(above.x-phone.x)<phone.size*.5?above:row??above;if(name){paired.push({phone,name});used.add(name.id);}if(paired.length===2)break;
  }
  paired.sort((a,b)=>Math.abs(a.phone.x-b.phone.x)<Math.max(a.phone.size,b.phone.size)?b.phone.y-a.phone.y:a.phone.x-b.phone.x).forEach(({phone,name},index)=>{phone.role=index===0?"agent1_phone":"agent2_phone";phone.label=`Agent ${index+1} phone`;name.role=index===0?"agent1_name":"agent2_name";name.label=`Agent ${index+1} name`;const email=result.find(r=>r.supported&&/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.text.trim())&&Math.abs(r.x-name.x)<name.size&&name.y-r.y>0&&name.y-r.y<name.size*3);if(email){email.role=index===0?"agent1_email":"agent2_email";email.label=`Agent ${index+1} email`;}});
  for(const run of result)if(run.role==="fixed"&&run.supported&&run.encodingComplete)run.role="custom";
  for(const r of result)if(r.clip&&r.x-r.clip[0]>r.size*.5&&Math.abs(r.x+r.width-r.clip[2])<.2)r.align="right";
  // PDF exports may store the three counts in a single spaced text operation.
  // Preserve each glyph's source anchor while exposing separate editable fields.
  return result.flatMap(run=>{
    const viewing=run.text.match(/^(\s*(?:View|Viewing|Inspection):?)(\s+)(\S.*)$/i);
    if(viewing&&run.positions?.length===run.text.length){
      const starts=[0,viewing[1].length+viewing[2].length],texts=[viewing[1],viewing[3]];
      return starts.map((start,i)=>{const offset=run.positions![start],end=start+texts[i].length;return {...run,id:`${run.id}_view${i}`,text:texts[i],label:texts[i],x:run.x+offset,width:(run.positions![end]??run.width)-offset,positions:run.positions!.slice(start,end).map(p=>p-offset),role:'custom' as const};});
    }
    const matches=[...run.text.matchAll(/\d{1,2}/g)];
    if(!/^\s*\d{1,2}\s+\d{1,2}\s+\d{1,2}\s*$/.test(run.text)||!run.positions||run.positions.length!==run.text.length)return [run];
    return matches.map((m,i)=>{const start=m.index!,offset=run.positions![start],end=start+m[0].length,next=run.positions![end];return {...run,id:`${run.id}_count${i}`,text:m[0],label:m[0],x:run.x+offset,width:next===undefined?run.width-offset:next-offset,positions:run.positions!.slice(start,end).map(p=>p-offset),role:'custom' as const};});
  });
}

export async function analyseDesign(source:Uint8Array,fileName:string,pageIndex:number,assets:EngineAssets):Promise<Analysis>{
  assets={...assets,...await documentColour(source)};
  const inspected=await inspectPdf(source,pageIndex,colourConverter(assets.table),assets.icc);
  const suggestion=suggestPrintSpec(fileName,inspected.width,inspected.height,inspected.trim);const fonts:Record<string,FontData>={};const warnings=[...inspected.warnings];
  if(suggestion.warning)warnings.push(suggestion.warning);
  const recoveredNames=new Map<string,string>();
  for(const [name,font]of inspected.fonts){
    let recovered:FontData|undefined;
    if(font.bytes){try{recovered=fontFromFile(font.bytes,undefined,name);}catch{try{recovered=fontFromCff(font);}catch{}}}
    if(!recovered&&font.type3){try{recovered=fontFromType3(font);}catch{}}
    // A PDF resource alias (R39/F1) must never be sent to the font service.
    // Prefer the actual embedded family when the PDF omitted its BaseFont name.
    if(recovered&&/^(?:R|F)\d+$/i.test(name)&&assets.fontNames&&assets.loadFont){const full=await matchEmbeddedFont(recovered,assets.fontNames,n=>assets.loadFontSample?assets.loadFontSample(n,Object.keys(recovered!.glyphs).map(Number)):assets.loadFont!(n));if(full)recovered={...full,subset:false};}
    const family=recovered?.name&& !/^(?:R|F)\d+$/i.test(recovered.name)?recovered.name:name;
    const installed=/^(?:R|F)\d+$/i.test(family)?undefined:await assets.loadFont?.(family).catch(()=>undefined);
    if(installed){fonts[family]={...installed,name:family};recoveredNames.set(name,family);}
    else if(normalize(family)===normalize(assets.poppins.name))fonts[name]={...assets.poppins,name,source:"catalogue",subset:false};
    else if(recovered)fonts[name]={...recovered,name,source:'embedded',subset:font.type3?true:font.subset};
  }
  Object.assign(fonts,await addStyleFonts(fonts,assets.loadFont));
  const media=await analyseMedia(inspected,suggestion.spec,assets.table);
  let preview:Uint8Array|undefined;if(inspected.hasHiddenMargins){inspected.page.setCropBox(0,0,inspected.width,inspected.height);preview=await inspected.doc.save();}
  const headingFonts:Record<string,FontData>={};
  if(isSignboard(suggestion.spec)&&assets.loadFont)for(const name of ['NimbusRomNo9L-Med','NimbusRomNo9L-Reg']){const font=await assets.loadFont(name).catch(()=>undefined);if(font)headingFonts[name]=font;}
  const outlined=recoverOutlinedHeadings(inspected.streams.get('page'),headingFonts,Math.max(20,...inspected.runs.map(r=>r.size))*1.5);
  for(const r of outlined)fonts[r.fontName]=headingFonts[r.fontName];
  const runs=inferTextAlignment(mergeRuns([...inspected.runs.map(r=>({...r,fontName:recoveredNames.get(r.fontName)??r.fontName})),...outlined]),inspected.width);
  const authored=await sceneFromPdf(source);let authoredGroups:Analysis["groups"];
  if(authored){suggestion.spec=authored.spec;authoredGroups=[];const used=new Set<string>();for(const e of authored.pages[pageIndex].elements.filter(e=>!e.hidden)){const x=(e.x+authored.spec.bleed)*SCENE_MM,y=inspected.height-(e.y+authored.spec.bleed+e.h)*SCENE_MM,w=e.w*SCENE_MM,h=e.h*SCENE_MM;if(e.kind==="text"){const fields=runs.filter(r=>!used.has(r.id)&&r.x>=x-.2&&r.x<x+w+.2&&r.y>=y-.2&&r.y<y+h+.2);for(const r of fields){used.add(r.id);r.role=e.dynamic?"custom":"fixed";r.label=e.label;r.clip=[x,y,x+w,y+h];}if(e.dynamic&&fields.length)authoredGroups.push({id:e.id,key:"field_"+e.id.replace(/-/g,""),kind:"text",label:e.label,fieldIds:fields.map(r=>r.id)});}else if(e.kind==="image"||e.kind==="qr"){const slot=media.find(m=>Math.abs(m.x-x)<1&&Math.abs(m.y-y)<1&&Math.abs(m.width-w)<1);if(slot){slot.role=e.dynamic?(e.kind==="qr"?"qr":"image"):"fixed";slot.label=e.label;if(e.kind==="qr")slot.sourceUrl=e.text;}}}}
  for(const slot of media){if(slot.role!=='image'||slot.width*slot.height>inspected.width*inspected.height*.04||Math.abs(slot.width/slot.height-1)>.2)continue;const name=runs.find(r=>/^agent[12]_name$/.test(r.role)&&r.x>=slot.x+slot.width*.7&&r.x-slot.x-slot.width<slot.width&&Math.abs((slot.y+slot.height/2)-r.y)<slot.height*.55);if(name){slot.agent=name.role==='agent1_name'?1:2;slot.label=`Agent ${slot.agent} headshot`;}}

  return{fileName,pageIndex,pageCount:inspected.pageCount,width:inspected.width,height:inspected.height,runs,groups:authoredGroups??inferContentGroups(runs),warnings,errors:inspected.issues,spec:suggestion.spec,fonts,suggestedSize:suggestion.size,preview,media};
}

export function layoutIssues(spec:PrintSpec,width:number,height:number):string[]{
  const errors:string[]=[];
  if(![spec.faceWidth,spec.faceHeight,...Object.values(bleedInsets(spec))].every(Number.isFinite)||spec.faceWidth<50||spec.faceHeight<50||spec.faceWidth>15000||spec.faceHeight>15000||Object.values(bleedInsets(spec)).some(v=>(needsBleed(spec)?v<=0:v<0)||v>300))return["Enter valid face dimensions. All categories except letters require positive bleed on every side."];
  const {width:w,height:h}=sourceFrame(spec);
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||Math.abs((w/h)/(width/height)-1)>(spec.product==="letter"?.005:.003))errors.push("The source and final size have different proportions. Check the face dimensions and whether the PDF already includes bleed.");
  return errors;
}

function replacementStream(doc:PDFDocument,source:ContentSource,raw:string){
  const replacement=doc.context.flateStream(bytes(raw));
  if(source.object)for(const[key,value]of source.object.dict.entries())if(!["Length","Filter","DecodeParms"].includes(key.decodeText()))replacement.dict.set(key,value);
  if(source.ref)doc.context.assign(source.ref,replacement);else doc.getPage(0);return replacement;
}

export async function compileDesign(source:Uint8Array,analysis:Analysis,name:string,assets:EngineAssets):Promise<{base:Uint8Array;manifest:SavedTemplate}>{
  assets={...assets,...await documentColour(source)};
  const sizeErrors=layoutIssues(analysis.spec,analysis.width,analysis.height);if(sizeErrors.length)throw new Error(sizeErrors[0]);
  if(analysis.errors.length)throw new Error(analysis.errors[0]);
  const fields=analysis.runs.filter(r=>r.role!=="fixed");if(analysis.pageCount===1&&!fields.length&&!analysis.media?.some(s=>s.role!=="fixed"))throw new Error("Choose at least one editable text or media field.");
  if(fields.length>600)throw new Error("Choose up to 600 editable fields per template.");
  const roles=fields.filter(f=>f.role!=="custom").map(f=>f.role);if(new Set(roles).size!==roles.length)throw new Error("Each agent name and phone role can be assigned once.");
  if(roles.some(r=>r.startsWith("agent2_"))&&!roles.some(r=>r.startsWith("agent1_")))throw new Error("Assign the first agent’s fields to Agent 1 before using Agent 2.");
  for(const field of fields){if(!field.supported||!field.encodingComplete)throw new Error(`The text “${field.text}” needs preparation before it can become dynamic.`);if(!analysis.fonts[field.fontName])throw new Error(`Upload ${field.fontName} to make this text editable.`);}
  const convert=colourConverter(assets.table);const inspected=await inspectPdf(source,analysis.pageIndex,convert,assets.icc);const selected=new Set(fields.flatMap(f=>f.members??[f.id]));
  const printIssues:string[]=[...inspected.printIssues,...printRuleIssues(analysis.spec)];const warnings=[...analysis.warnings];
  for(const font of inspected.fonts.values())if(!font.embedded)printIssues.push(`The source font ${font.name} is not embedded. Export the source with all fixed fonts embedded for reliable print output.`);
  const doc=inspected.doc;
  const mediaKeys=(analysis.media??[]).filter(s=>s.role!=="fixed").map(s=>s.key);if(mediaKeys.some(k=>!/^[_a-zA-Z][_a-zA-Z0-9]{0,63}$/.test(k))||new Set(mediaKeys).size!==mediaKeys.length)throw new Error("Give each editable media slot a unique job key using letters, numbers and underscores.");
  const mediaChanges=wrapMediaSlots(inspected,analysis.media??[]);
  const outputIntent=doc.catalog.lookupMaybe(PDFName.of("OutputIntents"),PDFArray);
  if(outputIntent?.size()){
    const intent=doc.context.lookup(outputIntent.get(0));if(intent instanceof PDFDict){const p=doc.context.lookup(intent.get(PDFName.of("DestOutputProfile")));if(p instanceof PDFRawStream){const original=decodePDFRawStream(p).decode();if(original.length!==assets.icc.length||original.some((v,i)=>v!==assets.icc[i])){printIssues.push("The source uses a different output colour profile. Its colour conversion needs printer review.");}}}
  }
  for(const content of inspected.streams.values()){
    const changes:{start:number;end:number;text:string}[]=[...(mediaChanges.get(content.key)??[])];
    let mode=0;let ctm=[1,0,0,1,0,0];let color=[0,0,0,1];const states:any[]=[];let rectangle:{x:number;y:number;w:number;h:number;index:number}|undefined;let otherPath=false;
    for(const[index,op]of content.ops.entries()){
      const a=op.args.map(t=>t.value);
      if(op.op==="q")states.push({ctm:[...ctm],color:[...color],mode});if(op.op==="Q"){const s=states.pop();if(s){ctm=s.ctm;color=s.color;mode=s.mode;}}
      if(op.op==="cm")ctm=multiply(ctm,a as number[]);if(op.op==="Tr")mode=Number(a[0]);
      if(op.op==="k")color=a as number[];
      if(!op.cmyk&&["rg","RG","g","G"].includes(op.op)){const converted=a.length===3?convert(a as number[]):[0,0,0,1-Number(a[0])];changes.push({start:op.start,end:op.end,text:`${converted.map(number).join(" ")} ${op.op===op.op.toUpperCase()?"K":"k"}`});if(op.op===op.op.toLowerCase())color=converted;}
      if(op.cmyk){changes.push({start:op.start,end:op.end,text:`${op.cmyk.map(number).join(" ")} ${op.op===op.op.toUpperCase()?"K":"k"}`});if(op.op===op.op.toLowerCase())color=op.cmyk;}
      if(selected.has(`${content.key}:${index}`))changes.push({start:op.start,end:op.end,text:["f","f*"].includes(op.op)?"n":`3 Tr\n${content.raw.slice(op.start,op.end)}\n${mode} Tr`});
      if(op.op==="re"){const[x,y,w,h]=a as number[];const p=multiply(ctm,[1,0,0,1,x,y]);rectangle={x:p[4],y:p[5],w:w*ctm[0],h:h*ctm[3],index};}
      if(["m","l","c","v","y"].includes(op.op))otherPath=true;
      if(["f","f*","B","B*","b","b*","S","s","n"].includes(op.op)){
        if(isSignboard(analysis.spec)&&rectangle&&!otherPath&&["f","f*"].includes(op.op)&&color[0]<.05&&color[1]>.9&&color[2]>.9&&color[3]<.05){
          const scale=sourceFrame(analysis.spec).width*MM/analysis.width;const x=Math.min(rectangle.x,rectangle.x+rectangle.w)*scale/MM,y=Math.min(rectangle.y,rectangle.y+rectangle.h)*scale/MM;
          const fullW=Math.abs(rectangle.w)*scale/MM,fullH=Math.abs(rectangle.h)*scale/MM,insets=bleedInsets(analysis.spec),left=analysis.spec.sourceIncludesBleed?insets.left:0,bottom=analysis.spec.sourceIncludesBleed?insets.bottom:0;
          if(fullW<=12&&fullH<=12&&Math.abs(y-bottom)<15&&(Math.abs(x-left)<15||Math.abs(x-(analysis.spec.faceWidth+left))<15))changes.push({start:op.start,end:op.end,text:"n"});
        }
        rectangle=undefined;otherPath=false;
      }
    }
    let raw=content.raw;for(const change of changes.sort((a,b)=>b.start-a.start))raw=raw.slice(0,change.start)+"\n"+change.text+"\n"+raw.slice(change.end);
    const replacement=replacementStream(doc,content,raw);if(content.key==="page")inspected.page.node.set(PDFName.of("Contents"),doc.context.register(replacement));
  }
  for(const image of inspected.images.values()){
    const dict=image.object.dict;const space=doc.context.lookup(dict.get(PDFName.of("ColorSpace")));const n=(key:string)=>{const v=doc.context.lookup(dict.get(PDFName.of(key)));return v instanceof PDFNumber?v.asNumber():0;};
    if(dict.get(PDFName.of("ImageMask"))?.toString()==="true")continue;
    const alreadyProcess=isProcessColourSpace(doc.context,space);
    let colorSpace=space instanceof PDFName?space.decodeText():"";let rgbProfile:Uint8Array|undefined;
    if(space instanceof PDFArray&&space.get(0).toString()==="/ICCBased"){const profile=doc.context.lookup(space.get(1));if(profile instanceof PDFRawStream){const count=profile.dict.lookup(PDFName.of("N"),PDFNumber).asNumber();if(count===4)colorSpace="DeviceCMYK";else if(count===3){colorSpace="DeviceRGB";rgbProfile=decodePDFRawStream(profile).decode();}}}
    if(space instanceof PDFArray&&space.get(0).toString()==="/Indexed"){
      const baseObject=doc.context.lookup(space.get(1));let base=baseObject?.toString();let paletteProfile:Uint8Array|undefined;
      if(baseObject instanceof PDFArray&&baseObject.get(0).toString()==='/ICCBased'){const profile=doc.context.lookup(baseObject.get(1));if(profile instanceof PDFRawStream&&profile.dict.lookupMaybe(PDFName.of('N'),PDFNumber)?.asNumber()===3){base='/DeviceRGB';paletteProfile=decodePDFRawStream(profile).decode()}}
      if(base==="/DeviceCMYK"||base==="/DeviceGray")colorSpace="DeviceCMYK";
      else if(base==="/DeviceRGB"){
        const lookup=doc.context.lookup(space.get(3));const palette=lookup instanceof PDFRawStream?decodePDFRawStream(lookup).decode():lookup instanceof PDFHexString||lookup instanceof PDFString?lookup.asBytes():undefined;
        if(palette&&palette.length%3===0){let converted:number[]=[];if(paletteProfile){let transform;try{transform=await rgbIccTransform(paletteProfile,assets.icc);converted=Array.from(transform.convert(palette))}catch{printIssues.push('An indexed image colour profile could not be converted.');}finally{transform?.close()}}else for(let p=0;p<palette.length;p+=3)converted.push(...convert([palette[p]/255,palette[p+1]/255,palette[p+2]/255]).map(v=>Math.round(v*255)));if(converted.length){const lookupHex=converted.map(v=>v.toString(16).padStart(2,"0")).join("");dict.set(PDFName.of("ColorSpace"),doc.context.obj(["Indexed","DeviceCMYK",space.get(2),PDFHexString.of(lookupHex)]));colorSpace="DeviceCMYK";}}
      }
    }
    const factor=sourceFrame(analysis.spec).width*MM/analysis.width;
    const fixedPlacements=inspected.placements.filter(p=>String(p.ref)===String(image.ref)&&!analysis.media?.flatMap(s=>[s,...(s.fragments??[])]).some(s=>s.stream===p.stream&&s.opIndex===p.opIndex&&s.role!=="fixed"));
    for(const placement of fixedPlacements){const w=Math.hypot(placement.matrix[0],placement.matrix[1])*factor,h=Math.hypot(placement.matrix[2],placement.matrix[3])*factor;const dpi=Math.min(image.width/(w/72),image.height/(h/72));if(dpi<40&&w/MM>200&&h/MM>200)printIssues.push(`The large fixed source image is only about ${Math.round(dpi)} dpi at full size. A higher-resolution source PDF is needed before print export.`);}
    if(alreadyProcess||colorSpace==="DeviceCMYK"||colorSpace==="DeviceGray")continue;
    if(colorSpace!=="DeviceRGB"){printIssues.push("An embedded image uses an unsupported colour space. A CMYK source image is needed.");continue;}
    if(n("BitsPerComponent")!==8){printIssues.push("An image uses a bit depth that needs separate colour conversion.");continue;}
    // Decode once, then transform in small chunks. The former 18 MP cutoff
    // rejected ordinary 24–36 MP property photos embedded in booklets.
    if(image.width*image.height>48000000){printIssues.push("An embedded photo exceeds the 48 megapixel colour-conversion limit.");continue;}
    try{
      const filterObject=doc.context.lookup(dict.get(PDFName.of("Filter")));const filterNames=filterObject instanceof PDFArray?filterObject.asArray().map(x=>x.toString()):filterObject?[filterObject.toString()]:[];let rgb:Uint8Array;
      if(filterNames[filterNames.length-1]==="/DCTDecode"){let encoded=image.object.contents;if(filterNames.length>1){const decodeDict=dict.clone(doc.context);decodeDict.set(PDFName.of("Filter"),doc.context.obj(filterNames.slice(0,-1).map(f=>f.slice(1))));encoded=decodePDFRawStream(PDFRawStream.of(decodeDict,encoded)).decode();}rgb=await decodePrintJpeg(encoded,image.width,image.height);}
      else rgb=decodePDFRawStream(image.object).decode();
      if(rgb.length!==image.width*image.height*3)throw new Error("Unexpected image data layout");
      const decodeObject=doc.context.lookup(dict.get(PDFName.of("Decode")));const ranges=decodeObject instanceof PDFArray?decodeObject.asArray().map(v=>(v as PDFNumber).asNumber()):[0,1,0,1,0,1];
      if(ranges.length!==6)throw new Error("Unsupported RGB decode ranges");
      const result=new Uint8Array(image.width*image.height*4);
      if(rgbProfile){const transform=await rgbIccTransform(rgbProfile,assets.icc);try{for(let p=0;p<rgb.length;p+=3*32768){const part=rgb.slice(p,p+3*32768);for(let j=0;j<part.length;j++){const c=j%3;part[j]=Math.round(255*Math.max(0,Math.min(1,ranges[c*2]+part[j]/255*(ranges[c*2+1]-ranges[c*2]))));}result.set(transform.convert(part),p/3*4);await new Promise(resolve=>setTimeout(resolve,0));}}finally{transform.close()}}
      else for(let p=0,q=0;p<rgb.length;p+=3,q+=4){if(p>0&&p%(3*32768)===0)await new Promise(resolve=>setTimeout(resolve,0));const c=convert([0,1,2].map(i=>ranges[i*2]+rgb[p+i]/255*(ranges[i*2+1]-ranges[i*2])));for(let i=0;i<4;i++)result[q+i]=Math.round(c[i]*255);}
      const replacement=doc.context.flateStream(result);
      for(const[key,value]of dict.entries())if(!["Length","Filter","DecodeParms","ColorSpace","Decode"].includes(key.decodeText()))replacement.dict.set(key,value);
      replacement.dict.set(PDFName.of("ColorSpace"),PDFName.of("DeviceCMYK"));doc.context.assign(image.ref,replacement);
    }catch{printIssues.push("An RGB image could not be converted automatically. Upload a CMYK version for print output.");}
  }
  const clean=await PDFDocument.create();const[page]=await clean.copyPages(doc,[analysis.pageIndex]);clean.addPage(page);page.node.delete(PDFName.of("Annots"));page.node.delete(PDFName.of("AA"));page.setCropBox(0,0,analysis.width,analysis.height);
  addQrRegions(clean,analysis.media??[]);
  const fontData:Record<string,FontData>={};for(const f of fields)fontData[f.fontName]=analysis.fonts[f.fontName];
  const fixedText=analysis.runs.filter(r=>r.role==="fixed").map(({text,x,y,width,size,bounds})=>({text,x,y,width,size,bounds}));
  const groups=(analysis.groups??inferContentGroups(fields)).map(g=>bindGroup({...g,fieldIds:g.fieldIds.filter(id=>fields.some(f=>f.id===id))},fields)).filter(g=>g.fieldIds.length);
  const groupKeys=groups.map(g=>g.key),groupFields=groups.flatMap(g=>g.fieldIds);
  if(groupKeys.some(k=>!/^[_a-zA-Z][_a-zA-Z0-9]{0,63}$/.test(k))||new Set(groupKeys).size!==groupKeys.length||new Set(groupFields).size!==groupFields.length)throw new Error("Content groups need unique keys and each text field can belong to one group.");
  for(const f of fields)if(!groupFields.includes(f.id))groups.push(...inferContentGroups([f]).map(g=>({...g,key:`text_${groups.length+1}`})));
  const manifest:SavedTemplate={outputProfile:profileText(assets.icc),authored:!!(await sceneFromPdf(source)),schemaVersion:1,name,sourceName:analysis.fileName,sourceWidth:analysis.width,sourceHeight:analysis.height,sourcePageIndex:analysis.pageIndex,groups,fieldSettings:analysis.runs.map(({id,role,label})=>({id,role,label})),fields,fixedText,fonts:fontData,spec:analysis.spec,media:analysis.media,warnings:[...new Set(warnings)],printIssues:[...new Set(printIssues)],createdAt:new Date().toISOString()};
  return{base:await clean.save({useObjectStreams:false}),manifest};
}

export function evaluateTemplate(template:SavedTemplate,values:Record<string,string>,oneAgent:boolean,content:ContentValues={}):{valid:boolean;errors:string[];printIssues:string[];fields:any[];scale:number}{
  template=normalizeSavedTemplate(template);
  if(template.pages?.length){const results=template.pages.map(p=>evaluateTemplate(p,values,oneAgent,Object.fromEntries(Object.entries(content).filter(([key])=>p.groups?.some(g=>g.key===key)))));return {valid:results.every(r=>r.valid),errors:results.flatMap((r,i)=>r.errors.map(e=>`Page ${i+1}: ${e}`)),printIssues:results.flatMap((r,i)=>r.printIssues.map(e=>`Page ${i+1}: ${e}`)),fields:results.flatMap(r=>r.fields),scale:1};}
  const grouped=resolveContent(template,values,content);template=grouped.template;values=grouped.values;
  oneAgent=oneAgent||!template.fields.some(f=>f.role.startsWith("agent2_"));
  const errors=[...grouped.errors,...layoutIssues(template.spec,template.sourceWidth,template.sourceHeight)];const printIssues=printRuleIssues(template.spec);const fields:any[]=[];
  const scale=sourceFrame(template.spec).width*MM/template.sourceWidth,b=bleedInsets(template.spec);
  const faceLeft=template.spec.sourceIncludesBleed?b.left*MM/scale:0,faceRight=faceLeft+template.spec.faceWidth*MM/scale;
  const faceBottom=template.spec.sourceIncludesBleed?b.bottom*MM/scale:0,faceTop=faceBottom+template.spec.faceHeight*MM/scale;
  const safe=productProfile(template.spec).safeText*MM/scale;
  for(const field of template.fields){
    if(oneAgent&&field.role.startsWith("agent2_"))continue;
    const value=(values[field.id]??field.text).normalize("NFC");
    if(!value.trim()&&field.role.endsWith("_email"))continue;
    if(!value.trim()){errors.push(`${field.label} is required.`);continue;}
    if(value.length>300){errors.push(`${field.label} is too long.`);continue;}
    const font=template.fonts[field.fontName];if(!font){errors.push(`Upload ${field.fontName} before generating this field.`);continue;}
    const missing=[...new Set([...value].filter(c=>!font.glyphs[String(c.codePointAt(0))]))];
    if(missing.length){errors.push(`${field.label}: ${field.fontName} is missing ${missing.join(" ")}. Upload a matching font containing these characters in field setup.`);continue;}
    const fontScale=field.size/font.unitsPerEm;const offsets:number[]=[];let width=0;
    for(const c of value){offsets.push(width);width+=font.glyphs[String(c.codePointAt(0))].advance*fontScale*field.horizontalScale+field.charSpace+(c===" "?field.wordSpace:0);}
    if(value===field.text&&field.positions?.length===[...value].length){offsets.splice(0,offsets.length,...field.positions);width=field.width;}
    // Content roles and agent count never alter the source anchor. A one-agent
    // job only hides Agent 2; changed wording grows from the original position.
    // A contact frame may grow into unused horizontal space without moving its anchor.
    // Original clipping boxes often describe an exported text object, not the layout column.
    let clip=field.clip;
    if(clip&&value!==field.text&&(field.role.startsWith('agent')||/@|\.(?:com|au|net)\b/i.test(field.text))){
      const obstacles=[...template.fields.filter(r=>r.id!==field.id&&r.x>field.x&&Math.abs(r.y-field.y)<Math.max(r.size,field.size)).map(r=>r.x),...(template.fixedText??[]).filter(r=>r.x>field.x&&Math.abs(r.y-field.y)<Math.max(r.size,field.size)).map(r=>r.x),...(template.media??[]).filter(r=>r.x>field.x&&r.y<field.y+field.size&&r.y+r.height>field.y).map(r=>r.x)];
      const edge=Math.min(faceRight,...obstacles)-field.size*.3;
      clip=[clip[0],clip[1],Math.max(clip[2],Math.min(edge,field.x+width+field.size*.1)),clip[3]];
    }
    fields.push({...field,clip,value,x:field.align==="right"?field.x+field.width-width:field.align==="center"?field.x+(field.width-width)/2:field.x,width,offsets,font});
  }
  for(const field of fields){
    const fontScale=field.size/field.font.unitsPerEm;let inkLeft=Infinity,inkRight=-Infinity,inkBottom=Infinity,inkTop=-Infinity;
    [...field.value].forEach((c,i)=>{const bounds=field.font.glyphs[String(c.codePointAt(0))].bounds;if(bounds){inkLeft=Math.min(inkLeft,field.x+field.offsets[i]+bounds[0]*fontScale*field.horizontalScale);inkRight=Math.max(inkRight,field.x+field.offsets[i]+bounds[2]*fontScale*field.horizontalScale);inkBottom=Math.min(inkBottom,field.y+bounds[1]*fontScale);inkTop=Math.max(inkTop,field.y+bounds[3]*fontScale);}});
    Object.assign(field,{inkLeft,inkRight,inkBottom,inkTop});
    if(Math.min(field.x,inkLeft)<faceLeft-.01||Math.max(field.x+field.width,inkRight)>faceRight+.01||inkBottom<faceBottom-.01||inkTop>faceTop+.01)errors.push(`${field.label} extends outside the visible face. Shorten the text to retain its font size.`);
    if(safe&&(inkLeft<faceLeft+safe-.01||inkRight>faceRight-safe+.01||inkBottom<faceBottom+safe-.01||inkTop>faceTop-safe+.01))printIssues.push(`${field.label===field.text||field.id.includes('__rich_')?field.value:field.label} enters the required ${productProfile(template.spec).safeText} mm safe text margin. Adjust the source layout before print export.`);
    const clip=field.clip;if(clip&&(inkLeft<clip[0]-.2||inkBottom<clip[1]-.2||inkRight>clip[2]+.2||inkTop>clip[3]+.2))errors.push(`${field.label} extends outside its original artwork frame. Shorten the text to retain its font size.`);
  }
  for(let i=0;i<fields.length;i++)for(let j=i+1;j<fields.length;j++){const a=fields[i],b=fields[j];if(a.inkBottom<b.inkTop&&b.inkBottom<a.inkTop&&a.inkLeft<b.inkRight&&b.inkLeft<a.inkRight)(a.value===a.text&&b.value===b.text?printIssues:errors).push(`${a.label} and ${b.label} overlap${a.value===a.text&&b.value===b.text?" in the original PDF. Correct the source overlap before print export.":". Shorten the text."}`);}
  for(const field of fields)for(const fixed of template.fixedText??[]){if(field.inkLeft<(fixed.bounds?.[2]??fixed.x+fixed.width)&&field.inkRight>(fixed.bounds?.[0]??fixed.x)&&field.inkBottom<(fixed.bounds?.[3]??fixed.y+fixed.size*.75)&&field.inkTop>(fixed.bounds?.[1]??fixed.y-fixed.size*.2))errors.push(`${field.label} overlaps fixed text (${fixed.text}). Adjust this field before exporting.`);}
  if(safe)for(const fixed of template.fixedText??[])if((fixed.bounds?.[0]??fixed.x)<faceLeft+safe-.01||(fixed.bounds?.[2]??fixed.x+fixed.width)>faceRight-safe+.01||(fixed.bounds?.[1]??fixed.y-fixed.size*.2)<faceBottom+safe-.01||(fixed.bounds?.[3]??fixed.y+fixed.size*.75)>faceTop-safe+.01)printIssues.push(`Fixed text (${fixed.text}) enters the required ${productProfile(template.spec).safeText} mm safe text margin. Review the source layout before print export.`);
  return{valid:!errors.length,errors:[...new Set(errors)],printIssues:[...new Set(printIssues)],fields,scale};
}

export async function renderTemplate(base:Uint8Array,template:SavedTemplate,values:Record<string,string>,oneAgent:boolean,assets:EngineAssets,media:MediaValues={},content:ContentValues={}):Promise<Uint8Array>{
  template=normalizeSavedTemplate(template);
  if(template.pages?.length){const source=await PDFDocument.load(base),out=await PDFDocument.create();for(const[i,p]of template.pages.entries()){const single=await PDFDocument.create();single.addPage((await single.copyPages(source,[i]))[0]);const result=await renderTemplate(await single.save(),p,values,oneAgent,assets,Object.fromEntries(Object.entries(media).filter(([key])=>p.media?.some(s=>s.id===key))),Object.fromEntries(Object.entries(content).filter(([key])=>p.groups?.some(g=>g.key===key))));const doc=await PDFDocument.load(result);out.addPage((await out.copyPages(doc,[0]))[0]);const intents=doc.catalog.get(PDFName.of('OutputIntents'));if(intents)out.catalog.set(PDFName.of("OutputIntents"),PDFObjectCopier.for(doc.context,out.context).copy(intents));}return out.save();}
  const grouped=resolveContent(template,values,content);if(grouped.errors.length)throw new Error(grouped.errors[0]);template=grouped.template;values=grouped.values;
  const checked=evaluateTemplate(template,values,oneAgent);if(!checked.valid)throw new Error(checked.errors[0]);
  const doc=await PDFDocument.load(base,{updateMetadata:false});const page=doc.getPage(0);const{spec}=template;
  await applyMedia(doc,template,media,oneAgent,assets.icc);
  const geometry=printGeometry(spec),w=geometry.width*MM,h=geometry.height*MM;
  const offsetX=geometry.offsetX*MM,offsetY=geometry.offsetY*MM;
  page.scale(checked.scale,checked.scale);if(offsetX||offsetY)page.translateContent(offsetX,offsetY);
  function setBoxes(unit=1){
    page.setMediaBox(0,0,w/unit,h/unit);page.setCropBox(0,0,w/unit,h/unit);
    page.setBleedBox(geometry.slug.left*MM/unit,geometry.slug.bottom*MM/unit,geometry.bleedWidth*MM/unit,geometry.bleedHeight*MM/unit);
    page.setTrimBox(geometry.trimX*MM/unit,geometry.trimY*MM/unit,spec.faceWidth*MM/unit,spec.faceHeight*MM/unit);
  }
  setBoxes();
  const commands=[`q ${number(checked.scale)} 0 0 ${number(checked.scale)} ${number(offsetX)} ${number(offsetY)} cm`];
  for(const field of checked.fields){commands.push(`q ${field.color.map(number).join(" ")} k`);const sx=field.size/field.font.unitsPerEm*field.horizontalScale,sy=field.size/field.font.unitsPerEm;
    [...field.value].forEach((c,index)=>{const glyph=field.font.glyphs[String(c.codePointAt(0))];if(glyph.path)commands.push(`q ${number(sx)} 0 0 ${number(sy)} ${number(field.x+field.offsets[index])} ${number(field.y)} cm\n${glyph.path}\nf Q`);});commands.push("Q");}
  commands.push("Q");
  if(geometry.marks)commands.push(`0 1 1 0 k ${number((geometry.trimX-5)*MM)} ${number((geometry.trimY-5)*MM)} ${number(5*MM)} ${number(5*MM)} re f\n${number((geometry.trimX+spec.faceWidth)*MM)} ${number((geometry.trimY-5)*MM)} ${number(5*MM)} ${number(5*MM)} re f`);
  page.node.addContentStream(doc.context.register(doc.context.flateStream(bytes(commands.join("\n")))));
  refreshGeneratedBleed(doc,page);
  // Signboards deliver at 25%; paper products deliver at 100%.
  const factor=exportScale(spec),percent=exportPercent(spec);const userUnit=Math.max(1,Math.ceil(Math.max(w,h)*factor/14400));
  page.scale(factor/userUnit,factor/userUnit);setBoxes(userUnit/factor);
  page.node.set(PDFName.of("UserUnit"),PDFNumber.of(userUnit));
  const icc=doc.context.flateStream(template.outputProfile?profileBytes(template.outputProfile):assets.icc,{N:4,Alternate:"DeviceCMYK"});const profile=doc.context.register(icc);
  const intent=doc.context.obj({Type:"OutputIntent",S:"GTS_PDFX",DestOutputProfile:profile,OutputConditionIdentifier:PDFString.of(template.outputProfile?"Embedded CMYK profile":"CGATS TR 001"),Info:PDFString.of(template.outputProfile?"Source CMYK output profile preserved":"U.S. Web Coated (SWOP) v2"),RegistryName:PDFString.of("http://www.color.org")});
  doc.catalog.set(PDFName.of("OutputIntents"),doc.context.obj([doc.context.register(intent)]));
  doc.setTitle(`${template.name} - ${percent} Percent Print`);doc.setSubject(`Supplied at ${percent} percent; output at ${100/factor} percent for final size. Final face ${spec.faceWidth} x ${spec.faceHeight} mm; ${bleedDescription(spec)}${geometry.marks?"; two 5 mm registration squares":""}.`);doc.setCreator("Signboard Studio");
  return doc.save({useObjectStreams:false});
}
