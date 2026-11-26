import {repairFixedFont,sourceFontName,refreshSourceFontIssues} from '@/lib/source-fonts';
import {checkOrigin,failure,ownedTemplate} from '@/lib/template-storage';
import {fontStorageKey} from '@/lib/font-library';
import {fontFromFile} from '@/lib/template-engine';
import {acceptAlternative,applyTemplateFont,missingFonts} from '@/lib/font-choices';
import type {SavedTemplate,FontData} from '@/lib/template-types';
export async function POST(request:Request,context:{params:Promise<{id:string}>}){
 try{
  checkOrigin(request);const{id}=await context.params,{template,bucket,owner}=await ownedTemplate(request,id);
  if(!template)return new Response('Not found',{status:404});
  if(template.status!=='ready')return Response.json({error:'Save this template first.'},{status:409});
  if(Number(request.headers.get('Content-Length'))>2000)return new Response('Too large',{status:413});
  const body=await request.json() as {name?:string;kind?:string;replacement?:string};
  if(typeof body.name!=='string'||body.name.length>160||!['upload','alternative'].includes(body.kind??''))return Response.json({error:'Choose a font and an option.'},{status:400});
  const stored=await bucket.get(`templates/${id}/manifest`);if(!stored)return new Response('Not found',{status:404});
  let manifest=await stored.json<SavedTemplate>();const name=body.name;const baseFile=await bucket.get(`templates/${id}/${manifest.baseAssetId?`font-bases/${manifest.baseAssetId}`:'base'}`);if(!baseFile)throw Error('Template artwork is unavailable.');const base=new Uint8Array(await new Response(baseFile.body).arrayBuffer());const responses=await Promise.all(['/template/rgb-to-cmyk-33.bin','/template/colour/CGATS001Compat-v2-micro.icc'].map(path=>fetch(new URL(path,request.url))));if(responses.some(r=>!r.ok))throw Error('Print assets are temporarily unavailable.');const assets={table:new Uint8Array(await responses[0].arrayBuffer()),icc:new Uint8Array(await responses[1].arrayBuffer())};manifest=await refreshSourceFontIssues(base,manifest,assets);
  if(![manifest,...manifest.pages??[]].some(p=>p.fields.some(f=>f.fontName===name)||p.printIssues.some(v=>sourceFontName(v)===name)))return Response.json({error:'This font is not used in the template.'},{status:400});
  let uploaded:FontData|undefined;
  if(body.kind==='upload'){
   const asset=await bucket.get(await fontStorageKey(owner,name));
   if(!asset||asset.customMetadata?.licenseConfirmed!=='true')return Response.json({error:'Upload the matching font and confirm licensed use first.'},{status:422});
   uploaded={...fontFromFile(new Uint8Array(await new Response(asset.body).arrayBuffer()),name),choice:{kind:'upload',licenseConfirmed:true,confirmedAt:asset.customMetadata.confirmedAt}};
  }
  const need=missingFonts(manifest.pages??[manifest]).find(f=>f.name===name);
  if(body.kind==='alternative'&&(!need||body.replacement!==need.replacement))return Response.json({error:'Refresh the template and choose the suggested alternative.'},{status:409});
  let next=applyTemplateFont(manifest,name,current=>uploaded??acceptAlternative(name,current,body.replacement));
  if([manifest,...manifest.pages??[]].some(p=>p.printIssues.some(v=>sourceFontName(v)===name))){const repaired=await repairFixedFont(base,next,name,uploaded??acceptAlternative(name,undefined,body.replacement),assets);next=repaired.manifest;next.baseAssetId=crypto.randomUUID();await bucket.put(`templates/${id}/font-bases/${next.baseAssetId}`,repaired.base,{httpMetadata:{contentType:'application/pdf'}});}
  next.saveExceptions=[...(next.saveExceptions??[]).slice(-49),{by:owner,at:new Date().toISOString(),reason:`Font ${name}: ${body.kind==='upload'?'licensed upload':`approved alternative ${body.replacement}`}`,issues:manifest.printIssues.filter(v=>sourceFontName(v)===name)}];
  const saved=await bucket.put(`templates/${id}/manifest`,JSON.stringify(next),{httpMetadata:{contentType:'application/json'},customMetadata:{...stored.customMetadata},...(stored.etag?{onlyIf:{etagMatches:stored.etag}}:{})});
  if(saved===null)return Response.json({error:'The template changed while applying the font. Refresh and try again.'},{status:409});
  return Response.json({saved:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return failure(e,422);}
}
