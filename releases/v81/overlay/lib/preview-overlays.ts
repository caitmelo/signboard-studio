import {evaluateTemplate} from './template-engine';
import {printGeometry,exportScale} from './print-specs';
import {sourcePlacement} from './size-resolution';
import type {SavedTemplate,ContentValues} from './template-types';
export function previewOverlays(t:SavedTemplate,values:Record<string,string>,oneAgent:boolean,content:ContentValues){
 const checked=evaluateTemplate(t,values,oneAgent,content),p=sourcePlacement(t.spec,t.sourceWidth,t.sourceHeight),g=printGeometry(t.spec),MM=72/25.4;
 const factor=exportScale(t.spec),unit=Math.max(1,Math.ceil(Math.max(g.width,g.height)*MM*factor/14400)),out=factor/unit;
 const sx=p.scale*out,dx=(g.offsetX*MM+p.x)*out,dy=(g.offsetY*MM+p.y)*out;
 const id=(v:string)=>v.replace(/^p\d+_/,'');
 return {runs:checked.fields.map(f=>({...f,id:id(f.id),text:f.value,x:f.x*sx+dx,y:f.y*sx+dy,width:f.width*sx,size:f.size*sx})),media:(t.media??[]).filter(s=>s.role!=='fixed').map(s=>({...s,id:id(s.id),x:s.x*sx+dx,y:s.y*sx+dy,width:s.width*sx,height:s.height*sx}))};
}
