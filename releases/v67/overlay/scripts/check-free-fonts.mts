import assert from 'node:assert/strict';import fs from 'node:fs';
import {withFreeFallback,freeFontName} from '../lib/free-fonts';
import {resolveInstalledFonts} from '../lib/installed-fonts';
import {acceptAlternative} from '../lib/font-choices';
const chars='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!?.,:;@&()–—‘’“”';
for(const name of ['HelveticaNeueLTStd-Bd','HelveticaNeueLTStd-Roman','HelveticaNeueLTStd-BoldItalic','SignPainterHouseScript']){
 const font=withFreeFallback(name)!;assert(font?.fallbackName,name);
 for(const c of chars)assert(font.glyphs[c.codePointAt(0)!]?.path||c===' ',`${name}: ${c}`);
 const original={name,unitsPerEm:1000,subset:true,source:'embedded' as const,glyphs:{'65':{advance:611,path:'0 0 m 500 0 l 250 700 l h',bounds:[0,0,500,700]}}};
 const merged=withFreeFallback(name,original)!;assert.deepEqual(merged.glyphs['65'],original.glyphs['65']);assert.equal(merged.unitsPerEm,1000);assert.equal(withFreeFallback(name,merged),merged);
 assert.equal(withFreeFallback(name,{...original,source:'upload',subset:false})?.fallbackName,undefined);
}
assert.equal(freeFontName('HelveticaNeueLTStd-Bd'),'Arimo Bold');assert.equal(freeFontName('HelveticaNeueLTStd-Roman'),'Arimo');
const icons=withFreeFallback('EOS-Icons-PBGeneric')!;for(const c of ['☎','☏','✉'])assert(icons.glyphs[c.codePointAt(0)!]?.path);assert(!icons.glyphs['57344'],'Do not guess private-use icon mappings');
for(const name of ['listed','sold','brochure']){
 const t=JSON.parse(fs.readFileSync(`work/stone-qa/${name}.json`,'utf8'));
 for(const page of t.pages??[t]){const normalized=resolveInstalledFonts(page),augmented={...normalized,fonts:{...normalized.fonts}};for(const name of Object.keys(augmented.fonts))if(freeFontName(name))augmented.fonts[name]=acceptAlternative(name,augmented.fonts[name]);for(const [name,font] of Object.entries(page.fonts) as any){if(!freeFontName(name))continue;assert(augmented.fonts[name].fallbackName);for(const [cp,g] of Object.entries(font.glyphs))assert.deepEqual(augmented.fonts[name].glyphs[cp],g,`${name} original ${cp}`);}}
}
console.log('PASS free font letters/numbers/punctuation, style selection, unit conversion, preserved original glyphs, uploads, and explicit Unicode icons');
