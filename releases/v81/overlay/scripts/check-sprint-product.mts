import assert from 'node:assert/strict';
import {suggestPrintSpec,applyEdgewrapPreset,printGeometry,exportScale} from '../lib/print-specs';
const mm=72/25.4;
for(const [w,h] of [[337.5,490.5],[490.5,337.5]]) {
 const {spec}=suggestPrintSpec('upload.pdf',w*mm,h*mm);
 assert.equal(spec.product,'edgewrap'); assert.equal(spec.productConfirmed,false);
 assert.equal(spec.sourceIncludesBleed,true);
 const chosen=applyEdgewrapPreset(spec,'6x4'),g=printGeometry(chosen);
 assert.equal(g.width*exportScale(chosen),w); assert.equal(g.height*.25,h);
 assert.equal(chosen.bleed*.25,16.25);
}
const plain=suggestPrintSpec('6x4 edgewrap.pdf',305*mm,458*mm).spec;
assert.equal(plain.sourceIncludesBleed,false);
assert.equal(plain.faceWidth,1220);assert.equal(plain.faceHeight,1832);
const unknown=suggestPrintSpec('signboard.pdf',327.5*mm,481.2*mm).spec;
assert.equal(unknown.productConfirmed,false);
const selected=applyEdgewrapPreset(unknown,'6x4');
assert.equal(printGeometry(selected).width*.25,337.5);
assert.equal(printGeometry(selected).height*.25,490.5);
assert.equal(selected.sourceIncludesBleed,false);
const banner=suggestPrintSpec('6x4 bannerwrap.pdf',516*mm,363*mm).spec;
assert.equal(banner.product,'bannerwrap');assert.equal(banner.bleed,116);
console.log('Sprint product presets passed');
