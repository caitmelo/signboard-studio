import roman from './nimbus-roman-glyphs.json';
import type {FontData, SavedTemplate} from './template-types';

const key=(name:string)=>name.replace(/^[A-Z]{6}\+/, '').replace(/[^a-z0-9]/gi,'').toLowerCase();
const installed=new Map(Object.entries(roman).map(([name,font])=>[key(name),font as FontData]));

// Saved PDFs may contain only a subset. Resolve the supplied full font for both
// the editor and automated jobs, without changing layout or user font uploads.
export function resolveInstalledFonts(template:SavedTemplate):SavedTemplate {
 const fonts={...template.fonts};let changed=false;
 for(const field of template.fields){
  const current=fonts[field.fontName],full=installed.get(key(field.fontName));
  if(full&&(!current||current.subset)){
   fonts[field.fontName]={...full,name:field.fontName};changed=true;
  }
 }
 return changed?{...template,fonts}:template;
}
