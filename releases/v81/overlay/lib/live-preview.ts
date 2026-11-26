import {PDFDocument} from 'pdf-lib';
import {renderTemplate,type EngineAssets} from './template-engine';
import type {SavedTemplate,ContentValues,MediaValues} from './template-types';
// Keep the live preview independent of Python initialization and render only the
// visible page. Downloads still use the full document and native Python engine.
const pages=new WeakMap<Uint8Array,Map<number,Promise<Uint8Array>>>();
export async function renderLivePreview(base:Uint8Array,t:SavedTemplate,values:Record<string,string>,oneAgent:boolean,assets:EngineAssets,media:MediaValues,content:ContentValues,index=0){
 const page=t.pages?.[index]??t;
 let data=base;
 if(t.pages){let cache=pages.get(base);if(!cache){cache=new Map();pages.set(base,cache);}let prepared=cache.get(index);if(!prepared){prepared=(async()=>{const source=await PDFDocument.load(base),out=await PDFDocument.create();out.addPage((await out.copyPages(source,[index]))[0]);return out.save();})();cache.set(index,prepared);}data=await prepared;}
 const textKeys=new Set(page.fields.flatMap(f=>[f.id,f.role]));
 const contentKeys=new Set(page.groups?.map(g=>g.key));const mediaKeys=new Set(page.media?.flatMap(s=>[s.id,s.key]));
 return renderTemplate(data,page,Object.fromEntries(Object.entries(values).filter(([k])=>textKeys.has(k))),oneAgent,assets,Object.fromEntries(Object.entries(media).filter(([k])=>mediaKeys.has(k))),Object.fromEntries(Object.entries(content).filter(([k])=>contentKeys.has(k))));
}
