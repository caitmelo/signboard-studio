import {user,checkOrigin,storage,failure} from '@/lib/template-storage';
import {fontStorageKey,fontLibraryName,readFontUpload} from '@/lib/font-library';

function nameFrom(request:Request){const name=new URL(request.url).searchParams.get('name')??'';if(!name||name.length>160||!fontLibraryName(name))throw Error('Choose a valid font name.');return name;}
export async function GET(request:Request){
 try{const owner=user(request);checkOrigin(request);const name=nameFrom(request),{bucket}=storage();const font=await bucket.get(await fontStorageKey(owner,name));
 if(!font)return new Response(null,{status:204,headers:{'Cache-Control':'private, no-store'}});
 return new Response(font.body,{headers:{'Content-Type':'application/octet-stream','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return failure(e);}
}
export async function PUT(request:Request){
 try{const owner=user(request);checkOrigin(request);const name=nameFrom(request),bytes=await readFontUpload(request),{bucket}=storage();
 await bucket.put(await fontStorageKey(owner,name),bytes,{httpMetadata:{contentType:'application/octet-stream'}});
 return Response.json({saved:true},{headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return failure(e,400);}
}
