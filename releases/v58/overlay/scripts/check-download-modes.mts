import assert from 'node:assert/strict';
import fs from 'node:fs';
import {renderPythonTemplate} from '../lib/python-engine';
const template=JSON.parse(fs.readFileSync('work/stone-qa/listed.json','utf8'));
const base=new Uint8Array(fs.readFileSync('work/stone-qa/listed-base.pdf'));
const assets={icc:new Uint8Array(),table:new Uint8Array(),poppins:Object.values(template.fonts)[0]} as any;
const modes:string[]=[];
globalThis.fetch=async(input:any,init:any)=>{
 if(input==='/runtime.json')return Response.json({engine:'server-python'});
 const job=JSON.parse(init.body);modes.push(job.job.mode);return new Response(base);
};
await renderPythonTemplate(base,template,{},false,assets,{}, {},'proof');
await renderPythonTemplate(base,template,{},false,assets,{}, {},'print');
assert.deepEqual(modes,['proof','print']);
const blocked={...template,printIssues:['Missing bleed']};
await assert.rejects(renderPythonTemplate(base,blocked,{},false,assets,{}, {},'print'),/Print checks failed: Missing bleed/);
await renderPythonTemplate(base,blocked,{},false,assets,{}, {},'proof');
assert.deepEqual(modes,['proof','print','proof']);
console.log('PASS separate proof/print modes; print blocks outstanding issues while proof remains available');
