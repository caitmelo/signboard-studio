import {failure,ownedTemplate} from '@/lib/template-storage';
import {printGeometry} from '@/lib/print-specs';
import type {SavedTemplate} from '@/lib/template-types';

export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 try{
  const {id}=await context.params,{template,bucket}=await ownedTemplate(request,id);
  if(!template)return new Response('Not found',{status:404});
  const file=await bucket.get(`templates/${id}/manifest`);
  if(!file)return new Response('Not found',{status:404});
  const saved=await file.json<SavedTemplate>(),spec=(saved.pages?.[0]??saved).spec,g=printGeometry(spec);
  return Response.json({sheetWidth:g.width,sheetHeight:g.height,x:g.trimX,y:g.trimY,width:spec.faceWidth,height:spec.faceHeight},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return failure(e);}
}
