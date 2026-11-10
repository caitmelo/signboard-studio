import {readPackageZip} from './package-zip';
export type IdmlReport={fonts:string[];links:string[];pages:number;frames:number;documents:Map<string,Document>};
export async function inspectIdml(data:Uint8Array):Promise<IdmlReport>{
 const entries=await readPackageZip(data,24*1024*1024),documents=new Map<string,Document>(),fonts=new Set<string>(),links=new Set<string>();let pages=0,frames=0;
 for(const e of entries.filter(e=>/\.xml$/i.test(e.path))){const text=new TextDecoder().decode(e.bytes);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw Error('This IDML contains unsupported XML declarations.');const doc=new DOMParser().parseFromString(text,'application/xml');if(doc.getElementsByTagName('parsererror').length)throw Error('The IDML contains invalid XML.');documents.set(e.path,doc);
  for(const el of Array.from(doc.getElementsByTagName('*'))){if(el.localName==='Font'){const name=el.getAttribute('PostScriptName')||el.getAttribute('FullName');if(name)fonts.add(name);}if(el.localName==='Link'){const uri=el.getAttribute('LinkResourceURI');if(uri)links.add(decodeURIComponent(uri).replace(/\\/g,'/').split('/').pop()!);}if(el.localName==='Page'&&!/MasterSpreads/.test(e.path))pages++;if(el.localName==='TextFrame'&&!/MasterSpreads/.test(e.path))frames++;}
 }
 if(![...documents.keys()].some(p=>/(^|\/)designmap.xml$/i.test(p)))throw Error('This file is not an InDesign IDML document.');
 return {fonts:[...fonts],links:[...links],pages,frames,documents};
}
