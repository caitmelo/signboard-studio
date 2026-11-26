import {pdfNumber} from './pdf-number';
import fontkit from '@pdf-lib/fontkit';
import type {FontSource} from './pdf-content';
import type {FontData,GlyphData} from './template-types';
const number=(n:number)=>{if(!Number.isFinite(n))throw new Error('Invalid font outline.');return pdfNumber(n);};
export function outlineGlyph(glyph:any,advance:number):GlyphData{
 const commands:string[]=[];let x=0,y=0;
 for(const command of glyph.path.commands as {command:string;args:number[]}[]){const a=command.args;
  if(command.command==='moveTo'){commands.push(`${a.map(number).join(' ')} m`);[x,y]=a;}
  else if(command.command==='lineTo'){commands.push(`${a.map(number).join(' ')} l`);[x,y]=a;}
  else if(command.command==='bezierCurveTo'){commands.push(`${a.map(number).join(' ')} c`);x=a[4];y=a[5];}
  else if(command.command==='quadraticCurveTo'){commands.push(`${[x+2/3*(a[0]-x),y+2/3*(a[1]-y),a[2]+2/3*(a[0]-a[2]),a[3]+2/3*(a[1]-a[3]),a[2],a[3]].map(number).join(' ')} c`);x=a[2];y=a[3];}
  else if(command.command==='closePath')commands.push('h');
 }
 const b=glyph.bbox;return{advance,path:commands.join('\n'),bounds:commands.length?[b.minX,b.minY,b.maxX,b.maxY]:null};
}

// PDF Type1C fonts contain raw CFF. A minimal sfnt envelope lets the existing
// pinned font decoder read those exact charstrings without changing the outlines.
export function fontFromCff(source:FontSource):FontData{
 const cffBytes=source.bytes;if(!cffBytes||cffBytes[0]!==1)throw new Error('Not a supported CFF font.');
 const headOffset=(44+cffBytes.length+3)&~3,wrapped=new Uint8Array(headOffset+54),view=new DataView(wrapped.buffer);
 wrapped.set(new TextEncoder().encode('OTTO'));view.setUint16(4,2);view.setUint16(6,32);view.setUint16(8,1);
 wrapped.set(new TextEncoder().encode('CFF '),12);view.setUint32(20,44);view.setUint32(24,cffBytes.length);
 wrapped.set(new TextEncoder().encode('head'),28);view.setUint32(36,headOffset);view.setUint32(40,54);
 wrapped.set(cffBytes,44);view.setUint32(headOffset,0x10000);view.setUint16(headOffset+18,1000);
 const font=fontkit.create(wrapped)as any,cff=font['CFF '];
 if(!cff||cff.isCIDFont)throw new Error('This CFF font needs a full matching font file.');
 const matrix=cff.topDict.FontMatrix as number[];if(matrix[1]||matrix[2]||matrix[4]||matrix[5]||matrix[0]!==matrix[3]||matrix[0]<=0)throw new Error('Unsupported CFF font matrix.');
 const unitsPerEm=1/matrix[0],names=new Map<string,number>();for(let id=1;id<cff.topDict.CharStrings.length;id++)names.set(cff.getGlyphName(id),id);
 const glyphs:FontData['glyphs']={};
 for(const[cp,character]of Object.entries(source.characters??{})){
  const code=Number(cp),name=character.glyphName??String.fromCodePoint(code),id=names.get(name)??names.get(`uni${code.toString(16).toUpperCase().padStart(4,'0')}`)??names.get(`u${code.toString(16).toUpperCase()}`);
  if(id!==undefined)glyphs[cp]=outlineGlyph(font.getGlyph(id,[code]),character.width*unitsPerEm/1000);
  else if(code===32)glyphs[cp]={advance:character.width*unitsPerEm/1000,path:'',bounds:null};
 }
 if(!Object.keys(glyphs).length)throw new Error('The CFF character mapping needs a matching font file.');
 return{name:source.name,unitsPerEm,glyphs,source:'embedded',subset:true};
}
