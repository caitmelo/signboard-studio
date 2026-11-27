import assert from 'node:assert/strict';import {pdfNumber} from '../lib/pdf-number';
for(const v of [0,-0,1e-7,-1e-7,100,100.01,1e-8,123456.789]){const s=pdfNumber(v);assert.match(s,/^-?\d+(?:\.\d+)?$/);assert.ok(Math.abs(Number(s)-v)<1e-7);}
assert.throws(()=>pdfNumber(Infinity));console.log('PDF number regression passed');
