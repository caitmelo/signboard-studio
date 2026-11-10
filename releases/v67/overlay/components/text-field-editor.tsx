"use client";
import {FontUpload} from "./font-upload";
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import type {FontData,Role,TextRun} from '@/lib/template-types';

export const roleNames:Record<Role,string>={custom:'Editable text',fixed:'Keep as fixed artwork',agent1_name:'Agent 1 · Name',agent1_phone:'Agent 1 · Phone',agent2_name:'Agent 2 · Name',agent2_phone:'Agent 2 · Phone',agent1_email:'Agent 1 · Email',agent2_email:'Agent 2 · Email'};
export function TextFieldEditor({runs,fonts,values,oneAgent,busy,onValue,onRole,onLabel,onFont,onSelect,selected}:{runs:TextRun[];fonts:Record<string,FontData>;values:Record<string,string>;oneAgent:boolean;busy:boolean;onValue:(id:string,value:string)=>void;onRole:(id:string,role:Role)=>void;onLabel:(id:string,label:string)=>void;onFont:(id:string,file:File,licensed:boolean)=>void;onSelect:(id:string)=>void;selected:string}){
 return <div className="text-edit-list">{runs.map((run,index)=>{
  const font=fonts[run.fontName],fixed=run.role==='fixed',hidden=oneAgent&&run.role.startsWith('agent2_'),supported=run.supported&&run.encodingComplete;
  return <div id={`field-${run.id}`} key={run.id} className={`text-edit-card ${selected===run.id?'selected':''}`} onFocusCapture={()=>onSelect(run.id)}>
   <label className="control-label" htmlFor={`value-${run.id}`}>{run.role.startsWith('agent')?roleNames[run.role]:run.label!==run.text?run.label:`Text ${index+1}`}</label>
   <Input id={`value-${run.id}`} value={fixed?run.text:values[run.id]??run.text} disabled={fixed||hidden||busy} onChange={e=>onValue(run.id,e.target.value)} maxLength={300} aria-label={`Edit ${run.text}`}/>
   <Select value={run.role} disabled={!supported||busy} onValueChange={role=>onRole(run.id,role as Role)}><SelectTrigger aria-label={`Use ${run.text} as`}><SelectValue/></SelectTrigger><SelectContent>{(Object.keys(roleNames)as Role[]).map(role=><SelectItem key={role} value={role}>{roleNames[role]}</SelectItem>)}</SelectContent></Select>
   <p className="field-font-note">{run.fontName} · {run.size.toFixed(2)} pt{font?.source==='catalogue'?' · Font available':''}{font?.fallbackName?` · Alternative for missing characters: ${font.fallbackName}`:''}</p>
   {run.role==='custom'&&<details className="field-name-setting"><summary>Field name</summary><Input aria-label={`Name for ${run.text}`} defaultValue={run.label} disabled={busy} maxLength={160} onBlur={e=>{const label=e.target.value.trim()||run.text;if(label!==run.label)onLabel(run.id,label);}}/></details>}
   {hidden&&<p className="help-text">Hidden while using one agent.</p>}
   {!supported&&<p className="help-text">{run.issue??'This text needs source preparation before it can be edited.'}</p>}
   {!fixed&&(!font||font.subset)&&<div className="field-font-attention"><p>{font?.subset?'The PDF contains only some characters. Upload the full matching font for unrestricted wording.':`Upload ${run.fontName} to reproduce new wording in the same font.`}</p><FontUpload name={run.fontName} busy={busy} onUpload={(file,licensed)=>onFont(run.id,file,licensed)}/></div>}
  </div>;
 })}</div>;
}
