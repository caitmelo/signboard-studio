import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fontStorageKey,readFontUpload} from '../lib/font-library';
import {fontFromFile,loadEngineAssets,resetFontCache} from '../lib/template-engine';
import {templateName,stepError} from '../lib/template-names';
const bytes=fs.readFileSync('public/pdfjs/standard_fonts/LiberationSans-Regular.ttf');
const expected=fontFromFile(bytes),name=expected.name;
assert.notEqual(await fontStorageKey('owner-one',name),await fontStorageKey('owner-two',name));
assert.equal(await fontStorageKey('owner-one',name),await fontStorageKey('owner-one','ABCDEF+'+name));
const upload=new Request('https://example.test',{method:'PUT',body:bytes});
assert.deepEqual(await readFontUpload(upload),new Uint8Array(bytes));
await assert.rejects(readFontUpload(new Request('https://example.test',{method:'PUT',body:'not a font file'})),/TTF/);
await assert.rejects(readFontUpload(new Request('https://example.test',{method:'PUT',body:'x',headers:{'Content-Length':String(13*1024*1024)}})),/12 MB/);
let installed=false,lookups=0;
globalThis.fetch=async(input:any)=>{
 const url=new URL(String(input),'https://example.test');
 if(url.pathname==='/api/fonts/installed'){lookups++;assert.equal(url.searchParams.get('name'),name);return installed?new Response(bytes):new Response(null,{status:204});}
 if(url.pathname==='/api/fonts')return Response.json({files:[]});
 if(url.pathname==='/template/fonts/manifest.json')return Response.json({});
 return new Response(fs.readFileSync('public'+url.pathname));
};
resetFontCache();const assets=await loadEngineAssets();assert.equal(await assets.loadFont!(name),undefined);
installed=true;const recovered=await assets.loadFont!(name);assert.equal(recovered?.subset,false);assert.deepEqual(recovered?.glyphs,expected.glyphs);assert.equal(lookups,2);
assert.equal(templateName('mailcard_tag-listed.pdf'),'TAG RE · Listed mailcard');
assert.equal(templateName('mailcard tag-sold.pdf'),'TAG RE · Sold mailcard');
assert.equal(templateName('Stone A4 brochure.pdf'),'Stone · brochure');
assert.equal(templateName('Custom design 2.pdf'),'Custom design 2');
assert.match(stepError('Uploading original PDF',new Error('Connection lost')),/^Uploading original PDF failed: Connection lost$/);
console.log('PASS private font keys, bounded upload validation, font reuse after a miss, exact glyphs, names and error context');
