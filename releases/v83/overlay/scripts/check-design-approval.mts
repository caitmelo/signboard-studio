import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {approveWithIssues} from '../lib/design-approval';
let stored:any;const clean=await approveWithIssues([],false,async r=>{stored=structuredClone(r)});assert.deepEqual(clean,stored);assert.equal(clean.acceptedIssues.length,0);
let wrote=false;await assert.rejects(approveWithIssues(['Missing font'],false,async()=>{wrote=true}),/accept/);assert.equal(wrote,false);
const approved=await approveWithIssues(['Missing font','Missing font','Bleed review'],true,async r=>{stored=structuredClone(r)});assert.deepEqual(approved.acceptedIssues,['Missing font','Bleed review']);assert.deepEqual(stored,approved);
await assert.rejects(approveWithIssues([],false,async()=>{throw Error('Storage full')}),/Storage full/);
const ui=readFileSync('components/template-builder.tsx','utf8');assert.ok(!ui.includes('Save template — keep unresolved issues'));assert.ok(ui.includes('No unresolved issues found.'));assert.ok(ui.includes('syncApprovedTemplate(record)'));
console.log('PASS approval persists exact acknowledged issues, clean approval needs no checkbox, failed storage cannot report success, separate Save removed.');
