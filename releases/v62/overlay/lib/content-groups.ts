import {layoutRich,defaultRichText} from './rich-text';
import type {ContentGroup,ContentKind,ContentValues,GroupValue,SavedTemplate,TextRun,FontData} from './template-types';

export const CONTENT_LABELS:Record<ContentKind,string>={heading:'Heading',address:'Address',details:'Details',agents:'Agent details',sale:'Sale type',viewing:'Viewing details',features:'Beds, baths & cars',agency:'Agency details',contact:'Contact details',text:'Text block'};
const reading=(a:TextRun,b:TextRun)=>Math.abs(a.y-b.y)<Math.min(a.size,b.size)*.4?a.x-b.x:b.y-a.y;
const phone=(s:string)=>/^[+\d(][\d\s().-]{6,}$/.test(s.trim())&&s.replace(/\D/g,'').length>=8;
const contact=(s:string)=>/@|(?:[a-z0-9-]+\.)+(?:com|au|net|org|co)(?:\b|\/)/i.test(s);
const icon=(r:TextRun)=>/icon|dingbat|symbol/i.test(r.fontName);
export function bindGroup(group:ContentGroup,runs:TextRun[]):ContentGroup{
 const fields=group.fieldIds.map(id=>runs.find(r=>r.id===id)).filter(Boolean)as TextRun[];
 const bindings:Record<string,string>={};
 if(group.kind==='agents')for(const f of fields)if(f.role.startsWith('agent'))bindings[f.role]=f.id;
 if(group.kind==='agency'){const p=fields.find(f=>phone(f.text)),c=fields.find(f=>contact(f.text));if(p)bindings.phone=p.id;if(c)bindings.contact=c.id;}
 if(group.kind==='features')fields.filter(f=>/^\d{1,2}$/.test(f.text.trim())&&!icon(f)).sort((a,b)=>a.x-b.x).slice(0,3).forEach((f,i)=>bindings[['beds','baths','cars'][i]]=f.id);
 if(group.kind==='viewing'){const l=fields.find(f=>/^\s*(view|viewing|inspect(?:ion)?)[\s:]*$/i.test(f.text));if(l)bindings.label=l.id;const v=fields.find(f=>f!==l);if(v)bindings.text=v.id;}
 if(group.kind==='sale'&&fields[0])bindings.text=fields[0].id;
 return {...group,bindings};
}
export function inferContentGroups(runs:TextRun[]):ContentGroup[]{
 const all=runs.filter(r=>r.role!=='fixed'),used=new Set<string>(),groups:ContentGroup[]=[],counts:Record<string,number>={};
 const available=()=>all.filter(r=>!used.has(r.id));
 function add(kind:ContentKind,fields:TextRun[]){if(!fields.length)return;fields.sort(reading);fields.forEach(f=>used.add(f.id));const n=(counts[kind]??0)+1;counts[kind]=n;const key=kind+(n>1?`_${n}`:'');groups.push(bindGroup({id:`group_${fields[0].id}`,key,kind,label:CONTENT_LABELS[kind]+(n>1?` ${n}`:''),fieldIds:fields.map(f=>f.id)},all));}
 // Build local contact cards before global role/type grouping separates their lines.
 for(const email of all.filter(r=>/@/.test(r.text)).sort((a,b)=>a.x-b.x)){
  if(used.has(email.id))continue;
  const fragments=available().filter(r=>Math.abs(r.y-email.y)<email.size*.3&&r.x<email.x&&email.x-r.x-r.width<email.size);const anchor=fragments.sort((a,b)=>a.x-b.x)[0]??email;
  const nearby=available().filter(r=>r.y>=email.y-.2&&r.y-email.y<r.size*8&&Math.abs(r.x-anchor.x)<r.size*2.1&&Math.abs(r.size/email.size-1)<.2).sort((a,b)=>a.y-b.y);
  const candidates:TextRun[]=[];let previousY=email.y;for(const r of nearby){if(r.y-previousY>Math.max(r.size,email.size)*3+.5)break;candidates.push(r);previousY=r.y;}
  const top=candidates.sort((a,b)=>b.y-a.y)[0];if(!top)continue;
  const left=Math.min(...candidates.map(r=>r.x)),right=Math.min(Math.max(...candidates.map(r=>r.x+r.width)),...available().filter(r=>r.x>left+email.size*3&&Math.abs(r.y-top.y)<email.size*.7).map(r=>r.x));
  const fields=available().filter(r=>r.y>=email.y-.5&&r.y<=top.y+.5&&r.x>=left-.5&&r.x<right&&Math.abs(r.size/email.size-1)<.2);
  if(fields.length<4||!fields.some(r=>phone(r.text)))continue;
  // A contact card owns these fields; don't treat office phones as a second agent.
  fields.forEach(r=>{if(r.role.startsWith('agent'))r.role='custom';});
  add('contact',fields);const g=groups[groups.length-1];g.label=/agent|director|principal|consultant/i.test(fields.map(r=>r.text).join(' '))?'Agent details':top.text.trim();if(g.label==='Agent details'){top.role='agent1_name';const ph=fields.find(r=>phone(r.text));if(ph)ph.role='agent1_phone';email.role='agent1_email';}g.label=`Content group ${counts.contact}`;
 }
 add('agents',available().filter(r=>r.role.startsWith('agent')));
 const icons=available().filter(icon).sort((a,b)=>a.x-b.x);
 if(icons.length){const numbers=icons.map(i=>available().filter(r=>!icon(r)&&/^\d{1,2}$/.test(r.text.trim())&&Math.abs(r.y-i.y)<i.size*.5&&r.x<i.x&&i.x-r.x-r.width<i.size*2).sort((a,b)=>b.x-a.x)[0]).filter(Boolean);if(numbers.length===3&&new Set(numbers.map(r=>r.id)).size===3)add('features',[...numbers,...icons.filter(i=>numbers.some(n=>Math.abs(n.y-i.y)<i.size*.5))]);}
 if(!groups.some(g=>g.kind==='features')){const nums=available().filter(r=>/^\d{1,2}$/.test(r.text.trim())&&!icon(r));for(const n of nums){const row=nums.filter(r=>Math.abs(r.y-n.y)<n.size*.4);if(row.length===3&&Math.max(...row.map(r=>r.x))-Math.min(...row.map(r=>r.x))<n.size*30){add('features',row);break;}}}
 for(const r of available())if(!used.has(r.id)&&/^\s*(for\s+sale|auction)\b/i.test(r.text))add('sale',[r,...available().filter(f=>f!==r&&Math.abs(f.y-r.y)<r.size*.3&&f.x>r.x+r.width&&f.x-r.x-r.width<r.size*8)]);
 for(const r of available())if(!used.has(r.id)&&/^\s*(view|viewing|inspection)[\s:]*$/i.test(r.text)){const value=available().filter(f=>f!==r&&Math.abs(f.y-r.y)<r.size*.4&&f.x>r.x).sort((a,b)=>a.x-b.x)[0];add('viewing',value?[r,value]:[r]);}
 for(const r of available())if(!used.has(r.id)&&/by appointment/i.test(r.text))add('viewing',[r]);
 for(const r of available())if(!used.has(r.id)&&phone(r.text)){const c=available().filter(f=>contact(f.text)&&Math.abs(f.x-r.x)<Math.max(r.size,f.size)*2&&Math.abs(f.y-r.y)<Math.max(r.size,f.size)*3).sort((a,b)=>Math.abs(a.y-r.y)-Math.abs(b.y-r.y))[0];add('agency',c?[r,c]:[r]);}
 for(const r of available())if(!used.has(r.id)&&contact(r.text))add('agency',[r]);
 function block(start:TextRun,pool:TextRun[],limit=200){const result=[start];let last=start;while(result.length<limit){const next=pool.filter(r=>!result.includes(r)&&r.y<last.y-Math.min(r.size,last.size)*.5&&last.y-r.y<Math.max(last.size,r.size)*1.9&&Math.abs(r.x-start.x)<Math.max(r.size,start.size)*.7&&Math.abs(r.size/start.size-1)<.25).sort(reading)[0];if(!next)break;result.push(next);last=next;}return result;}
 // A list is one frame: bullet and text on each baseline belong together.
 for(const bullet of available().filter(f=>/^[•●▪]$/.test(f.text.trim())).sort(reading)){
  if(used.has(bullet.id))continue;
  const bullets=available().filter(f=>/^[•●▪]$/.test(f.text.trim())&&Math.abs(f.x-bullet.x)<.3&&Math.abs(f.size-bullet.size)<.1).sort(reading);
  const section:TextRun[]=[];let y=bullet.y;
  for(const b of bullets){if(b.y>bullet.y+.1)continue;if(y-b.y>b.size*1.9)break;section.push(...available().filter(f=>Math.abs(f.y-b.y)<b.size*.3&&Math.abs(f.size-b.size)<.1&&f.x>=b.x-.1&&f.stream===b.stream));y=b.y;}
  if(section.length>1)add('details',section);
 }
 // Detect prose rows before headings/addresses: footer font sizes must not turn body copy into headings.
 const rows:TextRun[][]=[];
 for(const r of available().sort(reading)){const row=rows.find(row=>Math.abs(row[0].y-r.y)<Math.min(row[0].size,r.size)*.3);if(row)row.push(r);else rows.push([r]);}
 const proseRows=rows.map(row=>row.sort((a,b)=>a.x-b.x)).filter(row=>row.every((r,i)=>!i||r.x-row[i-1].x-row[i-1].width<r.size*1.5));
 for(const row of proseRows){if(row.some(r=>used.has(r.id))||row.map(r=>r.text).join(' ').length<55)continue;
  const paragraph=[...row];let last=row;
  for(const next of proseRows){if(next===row||next.some(r=>used.has(r.id))||next[0].y>=last[0].y)continue;
   const gap=last[0].y-next[0].y, size=row[0].size;
   if(gap>size*2.65)break;
   if(gap<size*.65||Math.abs(next[0].x-row[0].x)>size*.6||next.some(r=>Math.abs(r.size/size-1)>.15))continue;
   if(next.map(r=>r.text).join(' ').trim().length<25&&!/^[a-z]/.test(next[0].text.trim()))break;
   paragraph.push(...next);last=next;
  }
  if(paragraph.length>row.length){add('details',paragraph);groups[groups.length-1].label=`Body paragraph ${counts.details}`;}
 }
 for(const r of available().sort(reading))if(!used.has(r.id)&&/^\s*\d[\w/-]*\s*.*\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|place|pl|parade|pde|crescent|cres|way|terrace|tce)\b/i.test(r.text))add('address',block(r,available(),3));
 // A street number exported separately still belongs to its nearby street address.
 for(const number of available().sort(reading)){
  if(used.has(number.id)||!/^\d+[A-Za-z]?(?:[/-]\d+[A-Za-z]?)?$/.test(number.text.trim()))continue;
  const street=available().filter(r=>r!==number&&/\b(street|st|road|rd|avenue|ave|drive|dr|lane|ln|court|ct|place|pl|parade|pde|crescent|cres|way|terrace|tce)\b/i.test(r.text)&&r.y<=number.y+number.size*.25&&number.y-r.y<Math.max(number.size,r.size)*2.5&&Math.abs(r.x-number.x)<Math.max(number.size,r.size)*.7).sort((a,b)=>Math.abs(a.y-number.y)-Math.abs(b.y-number.y))[0];
  if(street)add('address',[number,...block(street,available().filter(r=>r!==number),3)]);
 }
 const sizes=all.filter(r=>!icon(r)).map(r=>r.size).sort((a,b)=>a-b),median=sizes[Math.floor(sizes.length/2)]??12;
 // A letter's greeting and closing are not headings just because its footer
 // uses much smaller text. Keep them independent from the campaign title.
 for(const r of available().sort(reading))if(!used.has(r.id)&&/^(?:dear\s+.{1,80}|(?:kind|warm|best)\s+regards|yours\s+(?:sincerely|faithfully)|sincerely|regards)[,.!\s]*$/i.test(r.text.trim()))add('text',[r]);
 for(const r of available().sort(reading))if(!used.has(r.id)&&r.size>median*1.45&&!icon(r))add('heading',block(r,available(),4));
 for(const r of available().sort(reading)){if(used.has(r.id))continue;const fields=block(r,available());add(fields.length>1&&fields.map(f=>f.text).join(' ').length>70?'details':'text',fields);}
 const order:ContentKind[]=['heading','address','details','agents','sale','viewing','features','agency','contact','text'];
 return groups.sort((a,b)=>order.indexOf(a.kind)-order.indexOf(b.kind));
}
export function contentGroups(template:Pick<SavedTemplate,'fields'|'groups'> & Partial<Pick<SavedTemplate,'defaults'>>){
 if(!template.groups)return inferContentGroups(template.fields);
 const groups=template.groups.map(g=>bindGroup({...g,fieldIds:g.fieldIds.filter(id=>template.fields.some(f=>f.id===id))},template.fields)).filter(g=>g.fieldIds.length);
 for(const field of template.fields)if(!groups.some(g=>g.fieldIds.includes(field.id))){let n=groups.length+1;while(groups.some(g=>g.key===`text_${n}`))n++;groups.push({...inferContentGroups([field])[0],key:`text_${n}`});}
 // Join a short lowercase continuation left behind by older importers.
 for(const tail of [...groups]){
  if(tail.kind!=='text'||tail.fieldIds.length!==1||template.defaults?.content?.[tail.key]!==undefined)continue;
  const f=template.fields.find(f=>f.id===tail.fieldIds[0])!;if(!/^[a-z]/.test(f.text.trim())||f.text.trim().length>=25)continue;
  const previous=groups.filter(g=>g.kind==='details').map(g=>({g,last:groupRuns(g,template.fields).sort((a,b)=>a.y-b.y)[0]})).filter(({last})=>last&&last.y>f.y&&last.y-f.y<f.size*1.9&&Math.abs(last.x-f.x)<f.size*.5&&Math.abs(last.size-f.size)<.1).sort((a,b)=>a.last.y-b.last.y)[0];
  if(previous){previous.g.fieldIds.push(f.id);groups.splice(groups.indexOf(tail),1);}
 }
 return groups;
}
export function groupRuns(group:ContentGroup,runs:TextRun[]){return group.fieldIds.map(id=>runs.find(r=>r.id===id)).filter(Boolean)as TextRun[];}
export function defaultGroupValue(group:ContentGroup,runs:TextRun[],values:Record<string,string>={}):GroupValue{
 const fields=groupRuns(group,runs),get=(id?:string)=>{const f=fields.find(r=>r.id===id);return f?(values[f.id]??f.text):'';};
 if(group.kind==='sale')return {type:/^auction/i.test(fields[0]?.text??'')?'original':'for_sale',date:'',time:'12:00'};
 if(group.kind==='viewing'){const text=get(group.bindings?.text);return {mode:/^by appointment$/i.test(text)?'appointment':'custom',text};}
 if(group.kind==='agency')return {visible:true,phone:get(group.bindings?.phone),contact:get(group.bindings?.contact)};
 if(group.kind==='features')return {beds:get(group.bindings?.beds),baths:get(group.bindings?.baths),cars:get(group.bindings?.cars)};
 return fields.map(f=>values[f.id]??f.text).join(group.kind==='details'?' ':'\n');
}
export function textWidth(field:TextRun,text:string,font?:FontData){if(text===field.text&&field.positions?.length===[...text].length)return field.width;if(!font)return Infinity;return [...text].reduce((n,c)=>n+(font.glyphs[String(c.codePointAt(0))]?.advance??font.unitsPerEm)*field.size/font.unitsPerEm*field.horizontalScale+field.charSpace+(c===' '?field.wordSpace:0),0);}
export function groupFrame(group:ContentGroup,template:Pick<SavedTemplate,'fields'|'sourceWidth'|'media'>){
 const fields=groupRuns(group,template.fields);const left=Math.min(...fields.map(f=>f.x)),right=Math.max(...fields.map(f=>f.x+f.width));
 if(group.kind==='sale'){
  const f=fields[0];if(!f)return{left:0,right:0,width:0};
  const obstacles=[...template.fields.filter(r=>!group.fieldIds.includes(r.id)&&Math.abs(r.y-f.y)<Math.max(r.size,f.size)*.5&&r.x>left).map(r=>r.x),...(template.media??[]).filter(s=>s.x>left&&s.y<f.y+f.size&&s.y+s.height>f.y).map(s=>s.x)];
  const edge=Math.min(template.sourceWidth*.96,...obstacles)-f.size*.4;
  return {left,right:Math.max(right,edge),width:Math.max(right,edge)-left};
 }
 if(group.kind==='viewing')return {left,right,width:right-left};
 // The measured paragraph column is the safe editing boundary. Page-wide
 // clipping paths describe artwork, not permission to flow over photographs.
 if(['heading','address','details','text'].includes(group.kind)&&fields.length){
  return {left,right:right+.1,width:right-left+.1};
 }

 return {left,right,width:right-left};
}
export function viewingLimit(group:ContentGroup,template:Pick<SavedTemplate,'fields'|'fonts'|'sourceWidth'|'media'>){
 const fields=groupRuns(group,template.fields),value=fields.find(r=>r.id===group.bindings?.text),label=fields.find(r=>r.id===group.bindings?.label);if(!value)return 0;
 const width=value.x+value.width-(label?label.x+label.width+value.size*.5:value.x),font=template.fonts[value.fontName];
 // A practical template-specific cap plus an exact width check: character count
 // alone cannot account for the difference between wide W and narrow i glyphs.
 const sample='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 ';
 const glyphWidth=font?textWidth(value,sample,font)/sample.length:value.size;
 return Math.max(value.text.length,Math.min(120,Math.floor(width/Math.max(1,glyphWidth))));
}
export function auctionText(date:string,time:string){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))throw new Error('Choose an auction date and time.');
 const [y,m,d]=date.split('-').map(Number),[h,min]=time.split(':').map(Number),check=new Date(Date.UTC(y,m-1,d));
 if(check.getUTCFullYear()!==y||check.getUTCMonth()!==m-1||check.getUTCDate()!==d||h>23||min>59)throw new Error('Choose a valid auction date and time.');
 const suffix=d%100>=11&&d%100<=13?'th':({1:'st',2:'nd',3:'rd'}as Record<number,string>)[d%10]??'th';
 const month=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][m-1];
 return `Auction: ${d}${suffix} ${month} at ${h%12||12}:${String(min).padStart(2,'0')} ${h<12?'am':'pm'}`;
}
export function resolveContent(template:SavedTemplate,values:Record<string,string>,content:ContentValues={}){
 const groups=contentGroups(template),errors:string[]=[],hidden=new Set<string>(),overrides=new Map<string,TextRun>(),nextValues={...values};const generated:TextRun[]=[];
 for(const key of Object.keys(content))if(!groups.some(g=>g.key===key))errors.push(`Unknown content group: ${key}`);
 function set(f:TextRun|undefined,text:string,right?:number,left?:number){if(!f)return;if(text.trim()===f.text.trim())text=f.text;if(text===f.text){nextValues[f.id]=text;return;}if(!text.trim()){hidden.add(f.id);return;}let field={...f};if(right!==undefined){const width=textWidth(f,text,template.fonts[f.fontName]);field.x=left??right-width;if(width>right-field.x+.01)errors.push(`${groups.find(g=>g.fieldIds.includes(f.id))?.label??'Text'} does not fit its text box at the original font size.`);}if(right!==undefined){field.width=textWidth(f,text,template.fonts[f.fontName]);field.positions=undefined;field.align='left';}overrides.set(f.id,field);nextValues[f.id]=text;}
 for(const g of groups){if(content[g.key]===undefined)continue;const value=content[g.key],fields=groupRuns(g,template.fields),bindings=g.bindings??{},find=(key:string)=>fields.find(f=>f.id===bindings[key]);if(!fields.length)continue;
  try{
   if(typeof value==='object'&&value.hidden===true){fields.forEach(f=>hidden.add(f.id));const mediaIds=new Set(contactMedia(template,g).map(m=>m.id));template={...template,media:template.media?.map(m=>mediaIds.has(m.id)?{...m,hidden:true}:m)};continue;}
   if(g.kind==='agents'&&!(typeof value==='object'&&value.fieldFormatting))throw new Error('Supply agents through the agents list or agent text fields.');
   if(['heading','address','details','text'].includes(g.kind)){
    const rich=typeof value==='string'?{rich:true as const,text:value,styles:[]}:value.rich&&typeof value.text==='string'?{...value,rich:true as const,text:value.text}:null;
    if(!rich)throw new Error('Enter paragraph text.');
    const original=fields.map(f=>values[f.id]??f.text).join(g.kind==='details'?' ':'\n');if(typeof value==='string'&&value===original)continue;
    const requiredInline=defaultRichText(g,fields).inline??{};
    for(const key of Object.keys(requiredInline))if(!rich.text.includes('{{'+key+'}}'))throw new Error('Keep {{'+key+'}} in this paragraph and edit the Address field below.');
    const first=fields[0],second=fields.find(f=>f.y<first.y-first.size*.3);
    if(g.kind==='address'&&second&&first.size>second.size*1.5&&!rich.text.includes('\n'))rich.text=rich.text.replace(/^(\d+[\w/-]*)\s+/, '$1\n');
    const unchanged=defaultRichText(g,fields,values);if(rich.text===unchanged.text&&JSON.stringify(rich.styles??[])===JSON.stringify(unchanged.styles??[])&&JSON.stringify(rich.inline??{})===JSON.stringify(unchanged.inline??{}))continue;
    const laid=layoutRich(fields,rich,template,groupFrame(g,template).right,g.kind==='details');
    fields.forEach(f=>hidden.add(f.id));generated.push(...laid.fields);Object.assign(nextValues,laid.values);
   }else{
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Supply the fields for this content group.');
    if(g.kind==='sale'){
     if(value.type==='original')continue;
     if(!['for_sale','auction'].includes(value.type??''))throw new Error('Choose For sale or Auction.');
     const text=value.type==='auction'?auctionText(value.date??'',value.time??''):/^for\s+sale/i.test(fields[0].text)?fields[0].text:'For Sale:';
     const frame=groupFrame(g,template),f=fields[0];
     const width=textWidth(f,text,template.fonts[f.fontName]),available=frame.right-f.x;
     const ratio=Math.min(1,available/Math.max(width,.01));
     if(ratio<.55)throw new Error('Auction details need a wider sale area.');
     const fitted={...f,size:f.size*ratio,charSpace:f.charSpace*ratio,wordSpace:f.wordSpace*ratio,align:'left' as const,clip:f.clip?[f.clip[0],f.clip[1],Math.max(f.clip[2],frame.right),f.clip[3]]:undefined};
     overrides.set(f.id,fitted);nextValues[f.id]=text;fields.slice(1).forEach(f=>hidden.add(f.id));
    }else if(g.kind==='viewing'){
     if(!['appointment','custom'].includes(value.mode??''))throw new Error('Choose By appointment or custom viewing details.');
     const text=value.mode==='appointment'?'By Appointment':value.text;
     if(typeof text!=='string'||!text.trim())throw new Error('Enter viewing details.');
     if(value.mode==='custom'&&text.length>viewingLimit(g,template))throw new Error(`Viewing details allow up to ${viewingLimit(g,template)} characters in this template.`);
     const f=find('text'),label=find('label');if(!f)throw new Error('Assign the viewing text field in group settings.');const left=label?label.x+label.width+f.size*.5:f.x,right=f.x+f.width;
     if(textWidth(f,text,template.fonts[f.fontName])>right-left+.01)throw new Error('Viewing details do not fit beside the label. Shorten the text.');set(f,text,right);
    }else if(g.kind==='agency'){
     if(typeof value.visible!=='boolean')throw new Error('Choose Show or None for agency details.');
     if(!value.visible){fields.forEach(f=>hidden.add(f.id));continue;}
     for(const key of ['phone','contact']as const){const f=find(key);if(value[key]!==undefined&&typeof value[key]!=='string')throw new Error(`${key} must be text.`);if(f){
      const text=value[key]??f.text,right=groupFrame(g,template).right,available=right-f.x;
      const width=textWidth(f,text,template.fonts[f.fontName]);
      // Fit contact replacements inside their original frame without moving neighbours.
      const ratio=Math.min(1,available/Math.max(width,.01));
      if(Number.isFinite(ratio)&&ratio>=.55&&ratio<1){
       const fitted={...f,size:f.size*ratio,charSpace:f.charSpace*ratio,wordSpace:f.wordSpace*ratio,width:f.width,positions:undefined};
       overrides.set(f.id,fitted);nextValues[f.id]=text;
      }else set(f,text);
     }}
    }else if(g.kind==='features'){
     for(const key of ['beds','baths','cars']as const){const f=find(key);if(!f)continue;const n=value[key];if(typeof n!=='string'||!/^\d{1,2}$/.test(n))throw new Error('Use a whole number from 0 to 99 for beds, baths and cars.');set(f,(f.text.match(/^\s*/u)?.[0]??'')+n+(f.text.match(/\s*$/u)?.[0]??''));}
    }
   }
   if(typeof value==='object'&&value.fieldFormatting){
    for(const [id,styles] of Object.entries(value.fieldFormatting)){
     const f=fields.find(f=>f.id===id);if(!f)throw new Error('Unknown formatted field.');if(hidden.has(id))continue;
     const text=nextValues[id]??f.text;if(!text.trim()){if(f.role.endsWith('_email')||g.kind==='agency'){hidden.add(id);continue;}throw new Error('This field is required.');}
     const source=overrides.get(id)??f;
     const obstacles=template.fields.filter(r=>r.id!==id&&r.x>source.x+source.width+.2&&Math.abs(r.y-source.y)<Math.max(r.size,source.size)*.6).map(r=>r.x-source.size*.3);
     const edge=g.kind==='viewing'?groupFrame(g,template).right:Math.max(source.x+source.width,Math.min(source.clip?.[2]??source.x+source.width+source.size,template.sourceWidth*.96,...obstacles));
     const expanded={...source,clip:[Math.min(source.x-source.size*.2,source.clip?.[0]??source.x),Math.min(source.y-source.size*.35,source.clip?.[1]??source.y),edge+source.size*.1,Math.max(source.y+source.size,source.clip?.[3]??source.y)]};
     if(source.clip&&(source.align==='right'||(!source.align&&source.x-source.clip[0]>source.size*.5&&Math.abs(source.x+source.width-source.clip[2])<.2))){expanded.x=source.clip[0];expanded.width=source.x+source.width-expanded.x;expanded.align='right';}
     const laid=layoutRich([expanded],{rich:true,text,styles},template,edge,false);hidden.add(id);generated.push(...laid.fields);Object.assign(nextValues,laid.values);
    }
   }
  }catch(e){errors.push(`${g.label}: ${e instanceof Error?e.message:'Invalid group value.'}`);}
 }
 return {template:{...template,fields:[...template.fields.filter(f=>!hidden.has(f.id)).map(f=>overrides.get(f.id)??f),...generated]},values:nextValues,errors};
}

export function contactMedia(template:SavedTemplate,group?:ContentGroup){
 const groups=group?[group]:contentGroups(template).filter(g=>g.kind==='contact'||g.kind==='agents');
 return (template.media??[]).filter(s=>s.role==='image'&&groups.some(g=>{const fs=groupRuns(g,template.fields);if(!fs.length)return false;const left=Math.min(...fs.map(f=>f.x)),bottom=Math.min(...fs.map(f=>f.y)),top=Math.max(...fs.map(f=>f.y+f.size)),size=Math.max(...fs.map(f=>f.size));return s.height<size*16&&s.width<size*16&&s.x+s.width<=left+size&&left-s.x-s.width<size*4&&s.y<top&&s.y+s.height>bottom;}));
}
