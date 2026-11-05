import {user,checkOrigin,failure} from '@/lib/template-storage';
import {fetchGoogleFont} from '@/lib/google-fonts';
const cache=new Map<string,{expires:number;result:Awaited<ReturnType<typeof fetchGoogleFont>>}>();
export async function GET(request:Request){
 try{user(request);checkOrigin(request);const query=new URL(request.url).searchParams,family=query.get('family')??'',weight=Number(query.get('weight')??400),italic=query.get('italic')==='1';const key=JSON.stringify([family,weight,italic]);let entry=cache.get(key);
 if(!entry||entry.expires<Date.now()){entry={expires:Date.now()+86400000,result:await fetchGoogleFont(family,weight,italic)};if(cache.size>=8)cache.delete(cache.keys().next().value!);if(JSON.stringify(entry.result).length<2*1024*1024)cache.set(key,entry);}
 return Response.json(entry.result??{files:[],available:false,reason:'Use the embedded font or upload the full matching font.'},{status:200,headers:{'Cache-Control':'private, no-store'}});
 }catch(e){return failure(e);}
}
