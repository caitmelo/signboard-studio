import { checkOrigin, failure, storage, user } from "@/lib/template-storage";

export async function GET(request: Request) {
  try {
    const owner = user(request); const { db, bucket } = storage();
    const result = await db.prepare("SELECT id, name, status, source_name, field_count, face_width_mm, face_height_mm, created_at FROM sign_templates WHERE owner_id = ? AND status IN ('ready','package') ORDER BY created_at DESC LIMIT 200").bind(owner).all();
    const templates=[];for(let i=0;i<result.results.length;i+=10)templates.push(...await Promise.all(result.results.slice(i,i+10).map(async row=>{const meta=await bucket.head(`templates/${row.id}/manifest`);const revision=Number(meta?.customMetadata?.revision);return {...row,revision:revision>0?revision:undefined};})));
    return Response.json({ templates }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return failure(e); }
}
export async function POST(request: Request) {
  try {
    checkOrigin(request); const owner = user(request); const { db } = storage();
    if (Number(request.headers.get("content-length")) > 4096) return Response.json({ error: "Template details are too long." }, { status: 413 });
    const data = await request.json() as { name?: string; sourceName?: string };
    if (typeof data.name !== "string" || !data.name.trim() || data.name.length > 160 || typeof data.sourceName !== "string" || data.sourceName.length > 240) return Response.json({ error: "Enter a template name." }, { status: 400 });
    const id = crypto.randomUUID(); const created = new Date().toISOString();
    await db.prepare("INSERT INTO sign_templates (id, owner_id, name, source_name, status, created_at) VALUES (?, ?, ?, ?, 'draft', ?)").bind(id, owner, data.name.trim(), data.sourceName, created).run();
    return Response.json({ id }, { status: 201 });
  } catch (e) { return failure(e); }
}

// Explicit owner-scoped reset. Never delete another user's template assets.
export async function DELETE(request:Request){
 try{
  checkOrigin(request);const owner=user(request);const{db,bucket}=storage();
  if(Number(request.headers.get('content-length'))>16000)return Response.json({error:'Invalid reset request.'},{status:400});
  const body=await request.json() as {confirm?:string;before?:string;ids?:string[]};
  if(body.confirm!=='delete-all-my-templates'&&body.confirm!=='delete-selected-templates')return Response.json({error:'An explicit template reset is required.'},{status:400});
  if(body.before&&!Number.isFinite(Date.parse(body.before)))return Response.json({error:'Invalid reset cutoff.'},{status:400});
  if(body.confirm==='delete-selected-templates'&&(!Array.isArray(body.ids)||!body.ids.length||body.ids.length>200||body.ids.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(id))))return Response.json({error:'Choose valid templates to delete.'},{status:400});
  const rows=body.confirm==='delete-selected-templates'?await db.prepare(`SELECT id FROM sign_templates WHERE owner_id = ? AND id IN (${body.ids!.map(()=>'?').join(',')})`).bind(owner,...body.ids!).all<{id:string}>():body.before?await db.prepare('SELECT id FROM sign_templates WHERE owner_id = ? AND created_at <= ?').bind(owner,body.before).all<{id:string}>():await db.prepare('SELECT id FROM sign_templates WHERE owner_id = ?').bind(owner).all<{id:string}>();let deleted=0;
  for(const row of rows.results){
   // Re-list the prefix after each deletion batch so no cursor skips remaining keys.
   while(true){const batch=await bucket.list({prefix:`templates/${row.id}/`,limit:500});if(!batch.objects.length)break;await bucket.delete(batch.objects.map(o=>o.key));}
   await db.prepare('DELETE FROM sign_templates WHERE id = ? AND owner_id = ?').bind(row.id,owner).run();deleted++;
  }
  const count=await db.prepare('SELECT COUNT(*) AS count FROM sign_templates WHERE owner_id = ?').bind(owner).first<{count:number}>();
  return Response.json({deleted,remaining:count?.count??0});
 }catch(e){return failure(e);}
}
