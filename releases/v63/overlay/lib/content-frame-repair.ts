import type {SavedTemplate,TextRun,ContentGroup,GroupValue} from './template-types';
import {defaultRichText} from './rich-text';
/** Recover a single authored list frame from older imports that separated
 * bullets and their text into arbitrary paragraph groups. */
export function repairContentFrames(t:SavedTemplate):SavedTemplate{
 if(!t.groups)return t;
 let groups=[...t.groups],defaults=t.defaults?{...t.defaults,content:{...t.defaults.content}}:undefined;
 for(const stream of new Set(t.fields.filter(f=>/^[•●▪]$/.test(f.text.trim())).map(f=>f.stream))){
  const fs=t.fields.filter(f=>f.stream===stream).sort((a,b)=>Math.abs(a.y-b.y)<Math.min(a.size,b.size)*.3?a.x-b.x:b.y-a.y);
  if(fs.filter(f=>/^[•●▪]$/.test(f.text.trim())).length<2)continue;
  const ids=new Set(fs.map(f=>f.id)),old=groups.filter(g=>g.fieldIds.every(id=>ids.has(id)));
  if(old.length<2||old.flatMap(g=>g.fieldIds).length!==fs.length)continue;
  const key=old.find(g=>g.kind==='details')?.key??old[0].key;
  const group:ContentGroup={id:'frame_'+fs[0].id,key,kind:'details',label:'Property details',fieldIds:fs.map(f=>f.id),bindings:{}};
  if(defaults&&old.some(g=>defaults!.content[g.key]!==undefined)){
   // Preserve edited copy while removing the artificial gaps between old groups.
   const fragments=old.map(g=>({g,fields:g.fieldIds.map(id=>fs.find(f=>f.id===id)!)})).sort((a,b)=>Math.max(...b.fields.map(f=>f.y))-Math.max(...a.fields.map(f=>f.y)));
   let text='';const styles:any[]=[];
   for(const {g,fields} of fragments){const value=defaults.content[g.key];if(value&&typeof value==='object'&&value.hidden)continue;if(value===undefined&&fields.every(f=>/^[•●▪]$/.test(f.text.trim())))continue;const rich=typeof value==='string'?{text:value,styles:[]}:value&&typeof value==='object'&&value.rich?value:defaultRichText(g,fields,defaults.text);if(!rich.text?.trim())continue;if(text)text+='\n';const offset=text.length;text+=rich.text;styles.push(...(rich.styles??[]).map(s=>({...s,start:s.start+offset,end:s.end+offset})));}
   for(const g of old)delete defaults.content[g.key];defaults.content[key]={rich:true,text,styles};
  }
  groups=groups.filter(g=>!old.includes(g));groups.push(group);
 }
 // An address and the smaller marketing headline below it are separate frames.
 for(const g of [...groups]){
  if(g.kind!=='address'||g.fieldIds.length!==2)continue;
  const [a,b]=g.fieldIds.map(id=>t.fields.find(f=>f.id===id)!);
  if(Math.abs(a.size/b.size-1)<.15||a.size/b.size>1.5)continue;
  const key=g.key+'_headline';g.fieldIds=[a.id];groups.push({id:g.id+'_headline',key,kind:'heading',label:'Headline',fieldIds:[b.id],bindings:{}});
  const value=defaults?.content[g.key];if(value){const rich=typeof value==='string'?{rich:true as const,text:value,styles:[]}:value;if(rich.text?.includes('\n')){const pos=rich.text.indexOf('\n');defaults!.content[g.key]={...rich,text:rich.text.slice(0,pos),styles:(rich.styles??[]).filter(s=>s.end<=pos)};defaults!.content[key]={...rich,text:rich.text.slice(pos+1),styles:(rich.styles??[]).filter(s=>s.start>pos).map(s=>({...s,start:s.start-pos-1,end:s.end-pos-1}))};}}
 }
 return {...t,groups,defaults};
}
