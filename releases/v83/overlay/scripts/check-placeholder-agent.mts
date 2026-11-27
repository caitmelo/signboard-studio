import assert from 'node:assert/strict';import {mergeRuns} from '../lib/template-engine';
const base={stream:'page',opIndex:1,fontName:'Test',size:20,horizontalScale:1,color:[0,0,0,1] as number[],charSpace:0,wordSpace:0,role:'custom',supported:true,encodingComplete:true} as const;
const runs=mergeRuns([{...base,id:'name',text:'<Name>',label:'Name',x:50,y:100,width:100},{...base,id:'phone',text:'0400 000 000',label:'Phone',x:50,y:70,width:130}]);
assert.equal(runs.find(r=>r.id==='name')?.role,'agent1_name');assert.equal(runs.find(r=>r.id==='phone')?.role,'agent1_phone');console.log('Placeholder agent mapping passed');
