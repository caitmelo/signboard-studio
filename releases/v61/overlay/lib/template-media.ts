import {isBackgroundArtwork} from './fixed-background';
import {sourceFrame} from "./print-specs";
import { PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFRef, PDFString, decodePDFRawStream } from 'pdf-lib';
import jpeg from 'jpeg-js';
import { decode as decodePng, encode as encodePng } from 'fast-png';
import jsQR from 'jsqr';
import QRCode from 'qrcode';
import { bytes, operations, latin, type inspectPdf } from './pdf-content';
import { colourConverter } from './template-colour';
import type { MediaSlot, MediaValues, PreparedImage, SavedTemplate, PrintSpec, QrStyle } from './template-types';
const MM=72/25.4;
const num=(n:number)=>{if(!Number.isFinite(n))throw new Error('Invalid media position.');return Number(n.toFixed(7));};
const base64=(data:Uint8Array)=>{let s='';for(let i=0;i<data.length;i+=8192)s+=String.fromCharCode(...data.subarray(i,i+8192));return btoa(s);};
type Pixels={width:number;height:number;data:Uint8Array|Uint8ClampedArray};
const defaultStyle=():QrStyle=>({foreground:[0,0,0,1],background:[0,0,0,0],quietZone:4,shape:'square',correction:'M'});
function thumbnail(p:Pixels){const scale=Math.min(240/p.width,180/p.height,1),w=Math.max(1,Math.round(p.width*scale)),h=Math.max(1,Math.round(p.height*scale)),data=new Uint8Array(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(Math.min(p.height-1,Math.floor(y/scale))*p.width+Math.min(p.width-1,Math.floor(x/scale)))*4;data.set(p.data.subarray(i,i+4),(y*w+x)*4);}return 'data:image/png;base64,'+base64(encodePng({width:w,height:h,channels:4,data}));}
function imageBytes(image:PDFRawStream,doc:PDFDocument){const filters=doc.context.lookup(image.dict.get(PDFName.of('Filter')));const names=filters instanceof PDFArray?filters.asArray().map(x=>x.toString()):filters?[filters.toString()]:[];let data=image.contents;if(names.at(-1)==='/DCTDecode'){if(names.length>1){const dict=image.dict.clone(doc.context);dict.set(PDFName.of('Filter'),doc.context.obj(names.slice(0,-1).map(n=>n.slice(1))));data=decodePDFRawStream(PDFRawStream.of(dict,data)).decode();}return{jpeg:true,data};}return{jpeg:false,data:decodePDFRawStream(image).decode()};}
function pdfPixels(image:PDFRawStream,doc:PDFDocument):Pixels|undefined{
 const get=(key:string)=>doc.context.lookup(image.dict.get(PDFName.of(key)));const w=(get('Width')as PDFNumber).asNumber(),h=(get('Height')as PDFNumber).asNumber();if(w*h>12000000)return;
 const encoded=imageBytes(image,doc);if(encoded.jpeg){const p=jpeg.decode(encoded.data,{useTArray:true,maxResolutionInMP:18,maxMemoryUsageInMB:220});return{width:p.width,height:p.height,data:p.data};}
 if((get('BitsPerComponent')as PDFNumber)?.asNumber()!==8)return;
 const raw=encoded.data,space=get('ColorSpace');let name=space instanceof PDFName?space.decodeText():'';let palette:Uint8Array|undefined;
 const resolvedName=(value:any):string=>{const v=doc.context.lookup(value);if(v instanceof PDFName)return v.decodeText();if(v instanceof PDFArray&&v.get(0).toString()==='/ICCBased'){const profile=doc.context.lookup(v.get(1));if(profile instanceof PDFRawStream){const n=profile.dict.lookup(PDFName.of('N'),PDFNumber).asNumber();return n===4?'DeviceCMYK':n===3?'DeviceRGB':n===1?'DeviceGray':'';}}return '';};
 if(space instanceof PDFArray&&space.get(0).toString()==='/Indexed'){name=resolvedName(space.get(1));const lookup=doc.context.lookup(space.get(3));palette=lookup instanceof PDFRawStream?decodePDFRawStream(lookup).decode():lookup instanceof PDFHexString||lookup instanceof PDFString?lookup.asBytes():undefined;}
 else if(space instanceof PDFArray)name=resolvedName(space);
 const channels=name==='DeviceCMYK'?4:name==='DeviceRGB'?3:name==='DeviceGray'?1:0;if(!channels)return;
 const data=new Uint8Array(w*h*4);for(let i=0;i<w*h;i++){const source=palette??raw,offset=palette?raw[i]*channels:i*channels;const c=source[offset]/255,m=source[offset+1]/255,y=source[offset+2]/255,k=source[offset+3]/255;
  data[i*4]=name==='DeviceCMYK'?Math.round(255*(1-c)*(1-k)):source[offset];data[i*4+1]=name==='DeviceCMYK'?Math.round(255*(1-m)*(1-k)):source[offset+(channels===1?0:1)];data[i*4+2]=name==='DeviceCMYK'?Math.round(255*(1-y)*(1-k)):source[offset+(channels===1?0:2)];data[i*4+3]=255;
 }return{width:w,height:h,data};
}
function detectQr(p:Pixels){if(p.width>1600||p.height>1600||p.width/p.height<.65||p.width/p.height>1.5)return;
 const scale=Math.max(1,Math.min(8,Math.ceil(320/Math.max(p.width,p.height)))),pad=16,w=p.width*scale+pad*2,h=p.height*scale+pad*2;const data=new Uint8ClampedArray(w*h*4).fill(255);
 for(let y=0;y<p.height*scale;y++)for(let x=0;x<p.width*scale;x++){const si=(Math.floor(y/scale)*p.width+Math.floor(x/scale))*4;data.set(p.data.subarray(si,si+4),((y+pad)*w+x+pad)*4);}
 return jsQR(data,w,h,{inversionAttempts:'attemptBoth'})??undefined;
}
export async function analyseMedia(inspected:Awaited<ReturnType<typeof inspectPdf>>,spec:PrintSpec,table:Uint8Array):Promise<MediaSlot[]>{
 const photoLike=new Set<string>();
 const lowColour=new Set<string>();
 const samples=new Map<string,Float32Array>();
 const result:MediaSlot[]=[];const cache=new Map<string,{preview?:string;url?:string;style:QrStyle}>();const scale=sourceFrame(spec).width*MM/inspected.width;
 for(const placement of inspected.placements){const m=placement.matrix;const points=[[0,0],[0,1],[1,0],[1,1]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);let x=Math.min(...points.map(p=>p[0])),y=Math.min(...points.map(p=>p[1])),right=Math.max(...points.map(p=>p[0])),top=Math.max(...points.map(p=>p[1]));
  if(placement.clip){x=Math.max(x,placement.clip[0]);y=Math.max(y,placement.clip[1]);right=Math.min(right,placement.clip[2]);top=Math.min(top,placement.clip[3]);}if(right<=x||top<=y)continue;
  const axisAligned=Math.abs(m[1])<1e-6&&Math.abs(m[2])<1e-6;let viewport=[0,0,1,1];if(axisAligned){const a=(x-m[4])/m[0],b=(right-m[4])/m[0],c=(y-m[5])/m[3],d=(top-m[5])/m[3];viewport=[Math.min(a,b),Math.min(c,d),Math.max(a,b),Math.max(c,d)];}
  let sampled=cache.get(String(placement.ref));if(!sampled){sampled={style:defaultStyle()};try{const p=pdfPixels(placement.object,inspected.doc);if(p){const colours=new Set<number>();let chromatic=0,count=0;for(let y=0;y<p.height;y+=Math.max(1,Math.floor(p.height/64)))for(let x=0;x<p.width;x+=Math.max(1,Math.floor(p.width/64))){const i=(y*p.width+x)*4,r=p.data[i],g=p.data[i+1],b=p.data[i+2];colours.add((r>>4)*256+(g>>4)*16+(b>>4));if(Math.max(r,g,b)-Math.min(r,g,b)>18)chromatic++;count++;}if(colours.size<=40)lowColour.add(String(placement.ref));if(colours.size>80&&chromatic/count>.15)photoLike.add(String(placement.ref));const grid=new Float32Array(1024*1024);for(let y=0;y<1024;y++)for(let x=0;x<1024;x++){const i=(Math.min(p.height-1,Math.floor((y+.5)*p.height/1024))*p.width+Math.min(p.width-1,Math.floor((x+.5)*p.width/1024)))*4;grid[y*1024+x]=(p.data[i]+p.data[i+1]+p.data[i+2])/3;}samples.set(String(placement.ref),grid);sampled.preview=thumbnail(p);const qr=detectQr(p);if(qr){sampled.url=qr.data;const dark=[0,0,0],light=[0,0,0];let nd=0,nl=0;for(let i=0;i<p.data.length;i+=4){const lum=(p.data[i]+p.data[i+1]+p.data[i+2])/3;const target=lum<128?dark:light;if(lum<128)nd++;else nl++;for(let j=0;j<3;j++)target[j]+=p.data[i+j];}const convert=colourConverter(table);if(nd)sampled.style.foreground=dark.every(v=>v/nd<20)?[0,0,0,1]:convert(dark.map(v=>v/nd/255));if(nl)sampled.style.background=light.every(v=>v/nl>235)?[0,0,0,0]:convert(light.map(v=>v/nl/255));}}}catch{/* A source preview is optional; its actual image remains in the PDF. */}cache.set(String(placement.ref),sampled);}
  const supported=axisAligned&&(inspected.streams.get(placement.stream)?.uses??0)===1;
  result.push({id:`media_${result.length+1}`,key:`image_${result.length+1}`,label:`Image ${result.length+1}`,role:supported?(sampled.url?'qr':'image'):'fixed',stream:placement.stream,opIndex:placement.opIndex,resourceName:placement.resourceName,matrix:m,x,y,width:right-x,height:top-y,viewport,pixelWidth:placement.pixelWidth,pixelHeight:placement.pixelHeight,supported,issue:!supported?'This image has a rotated or shared frame. Separate its instances in the source to edit them independently.':undefined,preview:sampled.preview,sourceUrl:sampled.url,qrStyle:sampled.style,sourceDpi:placement.pixelWidth/(Math.hypot(m[0],m[1])*scale/72)});
 }
 // Match overlapping export fragments by resolution, position and image content.
 const sampleFor=(slot:MediaSlot)=>samples.get(String(inspected.placements.find(p=>p.stream===slot.stream&&p.opIndex===slot.opIndex)?.ref));
 const parents=result.filter(s=>s.role==='image'&&s.width*s.height>inspected.width*inspected.height*.08).sort((a,b)=>b.width*b.height-a.width*a.height);
 const removed=new Set<string>();
 for(const parent of parents){if(removed.has(parent.id))continue;const a=sampleFor(parent);if(!a)continue;
  for(const child of result){if(child===parent||removed.has(child.id)||child.role!=='image'||child.width*child.height>=parent.width*parent.height*.8||Math.abs(child.sourceDpi/parent.sourceDpi-1)>.015)continue;
   if(child.x<parent.x-2||child.y<parent.y-2||child.x+child.width>parent.x+parent.width+2||child.y+child.height>parent.y+parent.height+2)continue;
   const b=sampleFor(child);if(!b)continue;const pairs:number[][]=[];
   for(let y=1;y<10;y++)for(let x=1;x<10;x++){const px=(child.matrix[4]+x/10*child.matrix[0]-parent.matrix[4])/parent.matrix[0],py=(child.matrix[5]+(1-y/10)*child.matrix[3]-parent.matrix[5])/parent.matrix[3];const ax=Math.max(0,Math.min(1023,Math.floor(px*1024))),ay=Math.max(0,Math.min(1023,Math.floor((1-py)*1024)));pairs.push([a[ay*1024+ax],b[Math.floor(y/10*1024)*1024+Math.floor(x/10*1024)]]);}
   const ma=pairs.reduce((n,p)=>n+p[0],0)/pairs.length,mb=pairs.reduce((n,p)=>n+p[1],0)/pairs.length;let ab=0,aa=0,bb=0;for(const [x,y]of pairs){ab+=(x-ma)*(y-mb);aa+=(x-ma)**2;bb+=(y-mb)**2;}
   if(ab/Math.sqrt(aa*bb)>.75){(parent.fragments??=[]).push(child);removed.add(child.id);if(mb/Math.max(ma,1)<.85)parent.flattenedShading=true;}
  }
 }
 for(let i=result.length-1;i>=0;i--)if(removed.has(result[i].id))result.splice(i,1);
 for(const [i,slot]of result.entries()){
  const ref=String(inspected.placements.find(p=>p.stream===slot.stream&&p.opIndex===slot.opIndex)?.ref);
  const backing=isBackgroundArtwork(slot,result.slice(i+1),inspected.width,inspected.height);
  if(slot.role==='image'&&(backing||lowColour.has(ref))){slot.role='fixed';slot.assetKind='artwork';if(backing)slot.locked=true;slot.issue=backing?'Background artwork is locked to prevent accidental replacement.':'Flat-colour artwork or raster lettering. Preserved as artwork; change its type if this should be replaceable media.';}
 }
 for(const slot of result)if(slot.role==='image'&&slot.width*slot.height<inspected.width*inspected.height*.02&&!photoLike.has(String(inspected.placements.find(p=>p.stream===slot.stream&&p.opIndex===slot.opIndex)?.ref))){slot.role='fixed';slot.issue='Small artwork asset. Preserved in its original position; change its role if this is a photo.';}
 result.sort((a,b)=>Math.abs((a.y+a.height)-(b.y+b.height))<10?a.x-b.x:(b.y+b.height)-(a.y+a.height));let photos=0,qrs=0;for(const slot of result){if(slot.role==='qr'){slot.key=`qr_${++qrs}`;slot.label=`QR code ${qrs}`;}else if(slot.role==='image'){slot.key=`image_${++photos}`;slot.label=`Image ${photos}`;}else{slot.label='Artwork asset';}}
 return result;
}
export function wrapMediaSlots(inspected:Awaited<ReturnType<typeof inspectPdf>>,slots:MediaSlot[]){
 const changes=new Map<string,{start:number;end:number;text:string}[]>();const doc=inspected.doc;
 for(const slot of slots.filter(s=>s.role!=='fixed'&&!s.region).flatMap(s=>[s,...(s.fragments??[])])){const placement=inspected.placements.find(p=>p.stream===slot.stream&&p.opIndex===slot.opIndex),content=inspected.streams.get(slot.stream);if(!placement||!content?.resources||!slot.supported)throw new Error(`${slot.label} cannot be mapped to its original image.`);
  const name=`SignboardMedia_${slot.id}`;let objects=content.resources.lookupMaybe(PDFName.of('XObject'),PDFDict);if(!objects){objects=doc.context.obj({});content.resources.set(PDFName.of('XObject'),objects);}
  const form=doc.context.flateStream(bytes('/Original Do'),{Type:'XObject',Subtype:'Form',BBox:[0,0,1,1],Resources:{XObject:{Original:placement.ref}},SignboardSlot:PDFString.of(slot.id)});objects.set(PDFName.of(name),doc.context.register(form));
  const op=content.ops[slot.opIndex];const list=changes.get(slot.stream)??[];list.push({start:op.start,end:op.end,text:`/${name} Do`});changes.set(slot.stream,list);
 }return changes;
}
export function addQrRegions(doc:PDFDocument,slots:MediaSlot[]){
 const regions=slots.filter(s=>s.region&&s.role==='qr');if(!regions.length)return;const page=doc.getPage(0);
 page.node.wrapContentStreams(doc.context.register(doc.context.flateStream(bytes('q'))),doc.context.register(doc.context.flateStream(bytes('Q'))));
 let resources=page.node.Resources();if(!resources){resources=doc.context.obj({});page.node.set(PDFName.of('Resources'),resources);}let objects=resources.lookupMaybe(PDFName.of('XObject'),PDFDict);if(!objects){objects=doc.context.obj({});resources.set(PDFName.of('XObject'),objects);}
 for(const slot of regions){const key=`Region_${slot.id}`;const form=doc.context.flateStream(bytes(''),{Type:'XObject',Subtype:'Form',BBox:[0,0,1,1],Resources:{XObject:{}},SignboardSlot:PDFString.of(slot.id)});objects.set(PDFName.of(key),doc.context.register(form));page.node.addContentStream(doc.context.register(doc.context.flateStream(bytes(`q ${slot.matrix.map(num).join(' ')} cm /${key} Do Q`))));}
}
export function savedMediaValues(values:MediaValues){return Object.fromEntries(Object.entries(values).map(([id,v])=>[id,v.kind==='image'?{...v,image:{...v.image,pdf:undefined,pdfBase64:encodeMediaBytes(v.image.pdf)}}:v]));}
function encodeMediaBytes(bytes:Uint8Array){let s='';for(let i=0;i<bytes.length;i+=32768)s+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(s);}
export function defaultMediaValues(template:{media?:MediaSlot[];defaults?:{media?:Record<string,any>}}):MediaValues{const values:MediaValues=Object.fromEntries((template.media??[]).filter(s=>s.role!=='fixed').map(s=>[s.id,{kind:'original',slotId:s.id}]));for(const[id,v]of Object.entries(template.defaults?.media??{})){if(v.kind==='image'){const {pdfBase64,...image}=v.image;values[id]={...v,image:{...image,pdf:Uint8Array.from(atob(pdfBase64),c=>c.charCodeAt(0))}};}else values[id]=v;}return values;}
export function evaluateMedia(template:SavedTemplate,values:MediaValues={}):{valid:boolean;errors:string[];printIssues:string[]}{
 if(template.pages?.length){const checks=template.pages.map(p=>evaluateMedia(p,values));return {valid:checks.every(c=>c.valid),errors:checks.flatMap((c,i)=>c.errors.map(e=>`Page ${i+1}: ${e}`)),printIssues:checks.flatMap((c,i)=>c.printIssues.map(e=>`Page ${i+1}: ${e}`))};}
 const errors:string[]=[],printIssues:string[]=[];const scale=sourceFrame(template.spec).width*MM/template.sourceWidth;
 for(const slot of template.media??[]){if(slot.role==='fixed')continue;const value=values[slot.id]??{kind:'original',slotId:slot.id};
  if(slot.flattenedShading&&!(value.kind==='original'&&value.slotId===slot.id&&!value.fit&&value.focalX===undefined&&value.focalY===undefined))printIssues.push(`${slot.label}: the source has shading baked into photo fragments. This replacement is proof-only until the shading is recreated from the editable source artwork.`);
  if(slot.role==='qr'&&value.kind!=='qr'&&!(value.kind==='original'&&value.slotId===slot.id)){errors.push(`${slot.label}: provide a destination link for this QR field.`);continue;}
  if(value.kind==='qr'){
   if(slot.role!=='qr'){errors.push(`${slot.label} is an image slot, not a QR field.`);continue;}
   if(slot.qrStyle.quietZone<4)printIssues.push(`${slot.label}: the QR quiet zone is below four modules; printer review is required.`);
   const colours=[slot.qrStyle.foreground,slot.qrStyle.background];
   if(colours.some(c=>c.length!==4||c.some(v=>!Number.isFinite(v)||v<0||v>1))){errors.push(`${slot.label}: choose valid code and background colours.`);continue;}
   const luminance=colours.map(c=>[0,1,2].map(i=>(1-c[i])*(1-c[3])).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0));
   if((Math.max(...luminance)+.05)/(Math.min(...luminance)+.05)<4.5){errors.push(`${slot.label}: the code and background colours need more contrast to scan reliably.`);continue;}
   try{const url=new URL(value.url);if(!['http:','https:'].includes(url.protocol)||value.url.length>2048)throw new Error();const matrix=QRCode.create(value.url,{errorCorrectionLevel:slot.qrStyle.correction}).modules;const moduleMm=Math.min(slot.width,slot.height)*scale/MM/(matrix.size+2*slot.qrStyle.quietZone);if(moduleMm<.3)printIssues.push(`${slot.label}: shorten the link so the printed QR modules remain at least 0.3 mm wide.`);}catch{errors.push(`${slot.label}: enter a valid http:// or https:// link.`);}continue;
  }
  const original=value.kind==='original'?(template.media??[]).find(s=>s.id===value.slotId):undefined;
  if(value.kind==='original'&&!original){errors.push(`${slot.label}: the source image no longer exists.`);continue;}
  if(value.kind==='image'&&(!value.image.pdf?.length||![value.image.width,value.image.height].every(n=>Number.isFinite(n)&&n>=1))){errors.push(`${slot.label}: choose an image.`);continue;}
  const pw=value.kind==='image'?value.image.width:original!.pixelWidth,ph=value.kind==='image'?value.image.height:original!.pixelHeight;
  const w=slot.width*scale/72,h=slot.height*scale/72;const dpi=value.fit==='contain'?Math.max(pw/w,ph/h):Math.min(pw/w,ph/h);
  if(slot.role!=='qr'&&dpi<40&&w*25.4>200&&h*25.4>200)printIssues.push(`${slot.label} is about ${Math.round(dpi)} dpi at full size. Replace it with a higher-resolution image before print export.`);
 }return{valid:!errors.length,errors,printIssues};
}
function decodeFile(data:Uint8Array):Pixels{
 if(data[0]===255&&data[1]===216){const p=jpeg.decode(data,{useTArray:true,maxResolutionInMP:24,maxMemoryUsageInMB:320});return{width:p.width,height:p.height,data:p.data};}
 const p=decodePng(data);if(p.width*p.height>24000000)throw new Error('Use an image up to 24 megapixels.');const out=new Uint8Array(p.width*p.height*4),max=2**p.depth-1;
 for(let i=0;i<p.width*p.height;i++){if(p.palette){const c=p.palette[p.data[i]];out.set([c[0],c[1],c[2],c[3]??255],i*4);}else{const at=i*p.channels;const channel=(n:number)=>Math.round(p.data[at+n]/max*255);out.set(p.channels<=2?[channel(0),channel(0),channel(0),p.channels===2?channel(1):255]:[channel(0),channel(1),channel(2),p.channels===4?channel(3):255],i*4);}}
 return{width:p.width,height:p.height,data:out};
}
export async function prepareImage(data:Uint8Array,name:string,table:Uint8Array,pixels?:Pixels):Promise<PreparedImage>{
 const p=pixels??decodeFile(data);if(p.width*p.height>24000000)throw new Error('Use an image up to 24 megapixels.');const convert=colourConverter(table),cmyk=new Uint8Array(p.width*p.height*4),alpha=new Uint8Array(p.width*p.height);let transparency=false;
 for(let i=0;i<p.width*p.height;i++){if(i&&i%32768===0)await new Promise(r=>setTimeout(r,0));const c=convert([p.data[i*4]/255,p.data[i*4+1]/255,p.data[i*4+2]/255]);for(let j=0;j<4;j++)cmyk[i*4+j]=Math.round(c[j]*255);alpha[i]=p.data[i*4+3];if(alpha[i]!==255)transparency=true;}
 const doc=await PDFDocument.create(),page=doc.addPage([p.width,p.height]);const mask=transparency?doc.context.register(doc.context.flateStream(alpha,{Type:'XObject',Subtype:'Image',Width:p.width,Height:p.height,ColorSpace:'DeviceGray',BitsPerComponent:8})):undefined;
 const image=doc.context.flateStream(cmyk,{Type:'XObject',Subtype:'Image',Width:p.width,Height:p.height,ColorSpace:'DeviceCMYK',BitsPerComponent:8,...(mask?{SMask:mask}:{})});page.node.set(PDFName.of('Resources'),doc.context.obj({XObject:{Image:doc.context.register(image)}}));page.node.addContentStream(doc.context.register(doc.context.flateStream(bytes(`q ${p.width} 0 0 ${p.height} 0 0 cm /Image Do Q`))));doc.catalog.set(PDFName.of('SignboardImageAsset'),PDFNumber.of(1));doc.setCreator('Signboard Studio image preparation');
 return{pdf:await doc.save({useObjectStreams:false}),width:p.width,height:p.height,name,preview:thumbnail(p)};
}
export async function validatePreparedImage(data:Uint8Array){const doc=await PDFDocument.load(data);if(doc.getPageCount()!==1||doc.catalog.get(PDFName.of('SignboardImageAsset'))?.toString()!=='1')throw new Error('Upload an image prepared by Signboard Studio.');const page=doc.getPage(0),resource=page.node.Resources()?.lookupMaybe(PDFName.of('XObject'),PDFDict);const image=doc.context.lookup(resource?.get(PDFName.of('Image')));if(!(image instanceof PDFRawStream)||image.dict.get(PDFName.of('ColorSpace'))?.toString()!=='/DeviceCMYK')throw new Error('The prepared image must use CMYK.');if(page.node.Annots()?.size())throw new Error('Image assets cannot contain annotations.');const contents=page.node.Contents();const streams=contents instanceof PDFArray?contents.asArray():[contents];for(const ref of streams){const s=doc.context.lookup(ref);if(!(s instanceof PDFRawStream)||operations(latin(decodePDFRawStream(s).decode())).some(op=>!['q','Q','cm','Do'].includes(op.op)||(op.op==='Do'&&op.args[0]?.value!=='Image')))throw new Error('The image asset contains unsupported artwork.');}const width=Number(image.dict.get(PDFName.of('Width'))?.toString()),height=Number(image.dict.get(PDFName.of('Height'))?.toString());if(![width,height].every(n=>Number.isInteger(n)&&n>0)||width*height>24000000||width!==page.getWidth()||height!==page.getHeight()||image.dict.get(PDFName.of('BitsPerComponent'))?.toString()!=='8')throw new Error('The prepared image dimensions or bit depth are invalid.');return{width,height};}
function roundedRect(x:number,y:number,w:number,h:number,r:number){const c=r*.55228475;return`${num(x+r)} ${num(y)} m ${num(x+w-r)} ${num(y)} l ${num(x+w-r+c)} ${num(y)} ${num(x+w)} ${num(y+r-c)} ${num(x+w)} ${num(y+r)} c ${num(x+w)} ${num(y+h-r)} l ${num(x+w)} ${num(y+h-r+c)} ${num(x+w-r+c)} ${num(y+h)} ${num(x+w-r)} ${num(y+h)} c ${num(x+r)} ${num(y+h)} l ${num(x+r-c)} ${num(y+h)} ${num(x)} ${num(y+h-r+c)} ${num(x)} ${num(y+h-r)} c ${num(x)} ${num(y+r)} l ${num(x)} ${num(y+r-c)} ${num(x+r-c)} ${num(y)} ${num(x+r)} ${num(y)} c h f`;}
export async function applyMedia(doc:PDFDocument,template:SavedTemplate,values:MediaValues={},oneAgent=false,imageProfile?:Uint8Array){
 const checked=evaluateMedia(template,values);if(!checked.valid)throw new Error(checked.errors[0]);
 const forms=new Map<string,{ref:PDFRef;object:PDFRawStream;original:any}>();for(const[ref,object]of doc.context.enumerateIndirectObjects())if(object instanceof PDFRawStream){const id=object.dict.get(PDFName.of('SignboardSlot'));if(id instanceof PDFString){const resources=object.dict.lookup(PDFName.of('Resources'),PDFDict);const original=resources.lookup(PDFName.of('XObject'),PDFDict).get(PDFName.of('Original'));forms.set(id.decodeText(),{ref,object,original});}}
 const embedded=new Map<Uint8Array,any>();
 for(const slot of template.media??[]){if(slot.role==='fixed')continue;if(slot.hidden||(oneAgent&&slot.agent===2)){const form=forms.get(slot.id);if(form)doc.context.assign(form.ref,doc.context.flateStream(bytes(''),{Type:'XObject',Subtype:'Form',BBox:[0,0,1,1],Resources:{XObject:{}},SignboardSlot:PDFString.of(slot.id)}));continue;}const value=values[slot.id];if(!value||(value.kind==='original'&&value.slotId===slot.id&&!value.fit&&value.focalX===undefined&&value.focalY===undefined))continue;const form=forms.get(slot.id);if(!form)throw new Error(`${slot.label} is missing from the prepared template.`);
  const [x0,y0,x1,y1]=slot.viewport,w=x1-x0,h=y1-y0;let raw=`q ${num(x0)} ${num(y0)} ${num(w)} ${num(h)} re W n\n`;let resources:any={};
  if(value.kind==='qr'){
   const qr=QRCode.create(value.url,{errorCorrectionLevel:slot.qrStyle.correction}),count=qr.modules.size,quiet=slot.qrStyle.quietZone,total=count+quiet*2;
   const physical=Math.min(Math.abs(slot.matrix[0])*w,Math.abs(slot.matrix[3])*h),uw=physical/Math.abs(slot.matrix[0]),uh=physical/Math.abs(slot.matrix[3]),left=x0+(w-uw)/2,bottom=y0+(h-uh)/2;
   raw+=`${slot.qrStyle.background.join(' ')} k ${num(x0)} ${num(y0)} ${num(w)} ${num(h)} re f\n${slot.qrStyle.foreground.join(' ')} k\n`;
   // Fill square modules as one path so PDF antialiasing cannot split the finder patterns.
   // Finder eyes remain continuous even when the data modules use rounded corners.
   for(let row=0;row<count;row++)for(let col=0;col<count;col++)if(qr.modules.get(row,col)){const x=left+(col+quiet)*uw/total,y=bottom+(count-row-1+quiet)*uh/total,mw=uw/total,mh=uh/total;const eye=(row<7&&col<7)||(row<7&&col>=count-7)||(row>=count-7&&col<7);raw+=slot.qrStyle.shape==='rounded'&&!eye?roundedRect(x,y,mw,mh,Math.min(mw,mh)*.24).replace(/ f$/,'')+'\n':`${num(x)} ${num(y)} ${num(mw)} ${num(mh)} re\n`;}
   raw+='f\n';
  }else{
   let ref:PDFRef,pw:number,ph:number;if(value.kind==='image'){let e=embedded.get(value.image.pdf);if(!e){let data=value.image.pdf;if(imageProfile){const asset=await PDFDocument.load(data);const resources=asset.getPage(0).node.Resources();if(resources){const spaces=resources.lookupMaybe(PDFName.of('ColorSpace'),PDFDict)??asset.context.obj({});spaces.set(PDFName.of('DefaultCMYK'),asset.context.obj(['ICCBased',asset.context.register(asset.context.flateStream(imageProfile,{N:4,Alternate:'DeviceCMYK'}))]));resources.set(PDFName.of('ColorSpace'),spaces);}data=await asset.save();}[e]=await doc.embedPdf(data,[0]);await e.embed();embedded.set(value.image.pdf,e);}ref=e.ref;pw=e.width;ph=e.height;}else{const originalSlot=template.media?.find(s=>s.id===value.slotId),original=forms.get(value.slotId);if(!originalSlot||!original?.original)throw new Error('The source image for this slot is missing.');ref=original.original;pw=originalSlot.pixelWidth;ph=originalSlot.pixelHeight;}
   const targetW=Math.abs(slot.matrix[0])*w,targetH=Math.abs(slot.matrix[3])*h;const factor=value.fit==='contain'?Math.min(targetW/pw,targetH/ph):Math.max(targetW/pw,targetH/ph);const drawW=pw*factor/Math.abs(slot.matrix[0]),drawH=ph*factor/Math.abs(slot.matrix[3]);const fx=Math.max(0,Math.min(1,value.focalX??.5)),fy=Math.max(0,Math.min(1,value.focalY??.5));
   const tx=x0+(w-drawW)*fx,ty=y0+(h-drawH)*(1-fy);const divisor=value.kind==='image'?[pw,ph]:[1,1];raw+=`${num(drawW/divisor[0])} 0 0 ${num(drawH/divisor[1])} ${num(tx)} ${num(ty)} cm /Replacement Do\n`;resources={XObject:{Replacement:ref}};
  }
  // Image transparency defines the destination frame, independently of replacement crop.
  const originalImage=form.original?doc.context.lookup(form.original):undefined;
  const frameMask=originalImage instanceof PDFRawStream?originalImage.dict.get(PDFName.of('SMask')):undefined;
  if(value.kind!=='qr'&&frameMask){const maskForm=doc.context.register(doc.context.flateStream(bytes('/FrameMask Do'),{Type:'XObject',Subtype:'Form',BBox:[0,0,1,1],Group:{S:'Transparency',CS:'DeviceGray',I:true},Resources:{XObject:{FrameMask:frameMask}}}));resources.ExtGState={FrameAlpha:{Type:'ExtGState',SMask:{S:'Luminosity',G:maskForm}}};raw='q /FrameAlpha gs\n'+raw+'Q\n';}
  raw+='Q';const replacement=doc.context.flateStream(bytes(raw),{Type:'XObject',Subtype:'Form',BBox:[0,0,1,1],Resources:resources,SignboardSlot:PDFString.of(slot.id)});doc.context.assign(form.ref,replacement);
  for(const fragment of slot.fragments??[]){const target=forms.get(fragment.id);if(!target)throw new Error('A photo fragment is missing from the prepared template.');const m=fragment.matrix,p=slot.matrix;const transform=[p[0]/m[0],0,0,p[3]/m[3],(p[4]-m[4])/m[0],(p[5]-m[5])/m[3]];doc.context.assign(target.ref,doc.context.flateStream(bytes(`q ${transform.map(num).join(' ')} cm /Group Do Q`),{Type:'XObject',Subtype:'Form',BBox:[0,0,1,1],Resources:{XObject:{Group:form.ref}},SignboardSlot:PDFString.of(fragment.id)}));}

 }
}
