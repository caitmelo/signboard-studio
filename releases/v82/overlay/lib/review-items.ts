import type {Analysis} from './template-types';
export function reviewItems(messages:string[],pages:Analysis[]){
 const groups=new Map<string,{message:string;locations:{page:number;ids:string[]}[]}>();
 for(const raw of messages){const match=raw.match(/^Page (\d+):\s*/i),message=raw.replace(/^Page \d+:\s*/i,'');const targets=match?[Number(match[1])-1]:pages.map((_,i)=>i);
  const item=groups.get(message)??{message,locations:[]};
  for(const index of targets){const p=pages[index];if(!p)continue;const ids=[...p.runs.filter(f=>[f.label,f.text,f.fontName].some(v=>v&&v.length>2&&message.includes(v))).map(f=>f.id),...(p.media??[]).filter(f=>f.label.length>2&&message.includes(f.label)).map(f=>f.id)];if(!item.locations.some(l=>l.page===p.pageIndex))item.locations.push({page:p.pageIndex,ids:[...new Set(ids)]});}
  groups.set(message,item);
 }return [...groups.values()];
}
