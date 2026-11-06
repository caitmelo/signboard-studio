import {extendedBackdrop} from './signboard-backdrop';
import {cleanCornerMarks} from './signboard-corner-marks';
import {signboardFrame} from './signboard-frame';
import {PDFDocument,PDFName,PDFArray,PDFDict,PDFRawStream,decodePDFRawStream} from 'pdf-lib';
import {operations,bytes,latin,multiply} from './pdf-content';
import {isSignboard,bleedInsets} from './print-specs';
import type {PrintSpec} from './template-types';
function fullWidthBands(doc:PDFDocument,raw:string,resources:PDFDict,trim:{x:number;y:number;width:number;height:number},parent=[1,0,0,1,0,0],depth=0):{y:number;h:number;colour:string}[]{
 if(depth>12)return [];const out:{y:number;h:number;colour:string}[]=[];let m=parent,colour='0 g',stack:{m:number[];colour:string}[]=[],pts:number[][]=[];
 for(const op of operations(raw)){const a=op.args.map(t=>Number(t.value));
  if(op.op==='q')stack.push({m:[...m],colour});else if(op.op==='Q'){const s=stack.pop();if(s){m=s.m;colour=s.colour;}}
  else if(op.op==='cm')m=multiply(m,a);else if(['g','rg','k'].includes(op.op))colour=raw.slice(op.start,op.end);
  else if(op.op==='Do'){const ref=resources.lookupMaybe(PDFName.of('XObject'),PDFDict)?.get(PDFName.of(String(op.args[0]?.value)));const form=doc.context.lookup(ref);if(form instanceof PDFRawStream&&form.dict.get(PDFName.of('Subtype'))?.toString()==='/Form'){const matrix=form.dict.lookupMaybe(PDFName.of('Matrix'),PDFArray)?.asArray().map(v=>Number(v.toString()))??[1,0,0,1,0,0];out.push(...fullWidthBands(doc,latin(decodePDFRawStream(form).decode()),form.dict.lookupMaybe(PDFName.of('Resources'),PDFDict)??resources,trim,multiply(m,matrix),depth+1));}}
  else if(op.op==='re')pts=[[a[0],a[1]],[a[0]+a[2],a[1]+a[3]]].map(([x,y])=>[m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);
  else if(['m','l'].includes(op.op))pts.push([m[0]*a[0]+m[2]*a[1]+m[4],m[1]*a[0]+m[3]*a[1]+m[5]]);
  else if(['c','v','y'].includes(op.op))pts=[];
  else if(['S','s','f','F','f*','B','B*','b','b*','n'].includes(op.op)){if(!['S','s','n'].includes(op.op)&&pts.length){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),left=Math.min(...xs),right=Math.max(...xs),y=Math.min(...ys),h=Math.max(...ys)-y;if(right-left>=trim.width*.95&&left<=trim.x+trim.width*.01&&right>=trim.x+trim.width*.99&&h>1)out.push({y,h,colour});}pts=[];}
 }return out;
}
// Only confidently identified printer furniture is removed. Never erase white artwork by colour alone.
export async function prepareSignboard(data:Uint8Array,pageIndex:number,spec:PrintSpec){
 if(!isSignboard(spec))return data;
 const doc=await PDFDocument.load(data,{updateMetadata:false}),page=doc.getPage(pageIndex),media=page.getMediaBox();
 const trim=await signboardFrame(doc,pageIndex)??page.getTrimBox();
 const insetTrim=trim.x>media.x+.1&&trim.y>media.y+.1&&trim.width<media.width-.2&&trim.height<media.height-.2;
 if(!insetTrim&&!spec.resizeMode)return data;
 const fit=spec.resizeMode==='fit';
 const unit=Math.min(trim.width/spec.faceWidth,trim.height/spec.faceHeight),fw=spec.faceWidth*unit,fh=spec.faceHeight*unit;
 const face={x:trim.x+(trim.width-fw)/2,y:trim.y+(trim.height-fh)/2,w:fw,h:fh},b=bleedInsets(spec);
 const crop={x:face.x-b.left*unit,y:face.y-b.bottom*unit,w:fw+(b.left+b.right)*unit,h:fh+(b.top+b.bottom)*unit};
 // Do not manufacture missing bleed or stretch artwork to fill it.
 const needsExtension=crop.x<media.x-.2||crop.y<media.y-.2||crop.x+crop.w>media.x+media.width+.2||crop.y+crop.h>media.y+media.height+.2;
 const content=page.node.Contents(),refs=content instanceof PDFArray?content.asArray():[content];let raw=refs.map(ref=>{const o=doc.context.lookup(ref);return o instanceof PDFRawStream?latin(decodePDFRawStream(o).decode()):'';}).join('\n');
 const cleaned=cleanCornerMarks(doc,raw,page.node.Resources()!,trim,unit);raw=cleaned.raw;if(cleaned.changed)page.node.set(PDFName.of('Resources'),cleaned.resources);
 let state={m:[1,0,0,1,0,0],fillWhite:false,strokeWhite:false,strokeRed:false,fill:'0 g'},stack:typeof state[]=[],pts:number[][]=[],rect=false;const edits:{start:number;end:number}[]=[];let backing:string|undefined;const bands:{y:number;h:number;colour:string}[]=[];const whiteBackings:{start:number;end:number}[]=[];
 for(const op of operations(raw)){const a=op.args.map(t=>Number(t.value));const point=(x:number,y:number)=>{const m=state.m;pts.push([m[0]*x+m[2]*y+m[4],m[1]*x+m[3]*y+m[5]]);};
 if(op.op==='q')stack.push({...state,m:[...state.m]});else if(op.op==='Q')state=stack.pop()??state;else if(op.op==='cm')state.m=multiply(state.m,a);
 else if(['g','rg','k'].includes(op.op)){state.fillWhite=op.op==='k'?a.every(x=>x===0):a.every(x=>x===1);state.fill=raw.slice(op.start,op.end);}
 else if(['G','RG','K'].includes(op.op)){state.strokeWhite=op.op==='K'?a.every(x=>x===0):a.every(x=>x===1);state.strokeRed=op.op==='K'?a[0]<.2&&a[1]>.7&&a[2]>.7&&a[3]<.2:op.op==='RG'&&a[0]>.7&&a[1]<.2&&a[2]<.2;}
 else if(op.op==='re'){point(a[0],a[1]);point(a[0]+a[2],a[1]+a[3]);rect=true;}
 else if(['m','l','c','v','y'].includes(op.op)){for(let i=0;i<a.length;i+=2)point(a[i],a[i+1]);}
 else if(['S','s','f','F','f*','B','B*','b','b*','n'].includes(op.op)){
 if(pts.length&&op.op!=='n'){const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y;
 if(rect&&!['S','s'].includes(op.op)&&w>=trim.width*.95&&x<=trim.x+.2&&x+w>=trim.x+trim.width-.2)bands.push({y,h,colour:state.fill});
 const originalFace=fit?{x:trim.x,y:trim.y,w:trim.width,h:trim.height}:face;
 const outside=x+w<=originalFace.x+.1||x>=originalFace.x+originalFace.w-.1||y+h<=originalFace.y+.1||y>=originalFace.y+originalFace.h-.1;
 const small=w<=12*unit&&h<=12*unit;const stroke=['S','s'].includes(op.op),white=stroke?state.strokeWhite:state.fillWhite;
 const nearCorner=small&&w>0&&h>0&&Math.abs(w-h)<unit&&[originalFace.x,originalFace.x+originalFace.w].some(v=>Math.min(Math.abs(x-v),Math.abs(x+w-v))<.2)&&[originalFace.y,originalFace.y+originalFace.h].some(v=>Math.min(Math.abs(y-v),Math.abs(y+h-v))<.2);
 const frameLine=stroke&&!state.strokeRed&&((w<.2&&h>media.height*.95&&[trim.x,trim.x+trim.width].some(v=>Math.abs(x-v)<.2))||(h<.2&&w>media.width*.95&&[trim.y,trim.y+trim.height].some(v=>Math.abs(y-v)<.2)));
 if(rect&&!stroke&&w>media.width*.95&&h>media.height*.95){if(white)whiteBackings.push({start:op.start,end:op.end});else backing=state.fill;}
 const border=stroke&&white&&rect&&Math.abs(w-fw)<2*unit&&Math.abs(h-fh)<2*unit&&Math.abs(x-face.x)<unit&&Math.abs(y-face.y)<unit;
 if((outside&&small&&(white||(stroke&&!state.strokeRed)))||border||(nearCorner&&white)||frameLine)edits.push({start:op.start,end:op.end});}
 pts=[];rect=false;}
 }
 if(needsExtension&&!backing&&!fit)return data;
 if(backing)edits.push(...whiteBackings);
 for(const e of edits.sort((a,b)=>b.start-a.start))raw=raw.slice(0,e.start)+' n '+raw.slice(e.end);
 if(backing)raw=`q ${backing} ${crop.x} ${crop.y} ${crop.w} ${crop.h} re f Q\n${raw}`;
 if(fit){const scale=Math.min(fw/trim.width,fh/trim.height),dx=face.x+(fw-trim.width*scale)/2-trim.x*scale,dy=face.y+(fh-trim.height*scale)/2-trim.y*scale;const expanded={x:(crop.x-dx)/scale,y:(crop.y-dy)/scale,width:crop.w/scale,height:crop.h/scale};
 const backdrop=await extendedBackdrop(data,pageIndex,media,expanded);let imageBacking='';
 if(backdrop){const embedded=await doc.embedPage(backdrop.page,{left:expanded.x,bottom:expanded.y,right:expanded.x+expanded.width,top:expanded.y+expanded.height});const resources=page.node.Resources()!,objects=resources.lookupMaybe(PDFName.of('XObject'),PDFDict)??doc.context.obj({});objects.set(PDFName.of('StudioFixedBackground'),embedded.ref);resources.set(PDFName.of('XObject'),objects);imageBacking=`q ${scale} 0 0 ${scale} ${crop.x} ${crop.y} cm /StudioFixedBackground Do Q\n`;}
 const background=fullWidthBands(doc,raw,page.node.Resources()!,trim).map(b=>{const y=b.y<=trim.y+trim.height*.02?crop.y:b.y*scale+dy,top=b.y+b.h>=trim.y+trim.height*.98?crop.y+crop.h:(b.y+b.h)*scale+dy;return `q ${b.colour} ${crop.x} ${y} ${crop.w} ${top-y} re f Q`;}).join('\n');raw=`q 0 0 0 0 k ${crop.x} ${crop.y} ${crop.w} ${crop.h} re f Q\n${background}\n${imageBacking}q ${scale} 0 0 ${scale} ${dx} ${dy} cm ${media.x} ${media.y} ${media.width} ${media.height} re W n\n${raw}\nQ`;}
 page.node.set(PDFName.of('Contents'),doc.context.register(doc.context.flateStream(bytes(`q ${crop.x} ${crop.y} ${crop.w} ${crop.h} re W n\n${raw}\nQ`))));
 page.translateContent(-crop.x,-crop.y);page.setMediaBox(0,0,crop.w,crop.h);page.setCropBox(0,0,crop.w,crop.h);page.setBleedBox(0,0,crop.w,crop.h);page.setTrimBox(b.left*unit,b.bottom*unit,fw,fh);
 return doc.save();
}
