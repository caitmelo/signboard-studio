import { checkOrigin, failure, ownedTemplate } from "@/lib/template-storage";
const assetTypes: Record<string, { type: string; max: number }> = {
  source: { type: "application/pdf", max: 25 * 1024 * 1024 },
  base: { type: "application/pdf", max: 50 * 1024 * 1024 },
  manifest: { type: "application/json", max: 8 * 1024 * 1024 },
  thumbnail: { type: "image/png", max: 3 * 1024 * 1024 },
};
type Context = { params: Promise<{ id: string; asset: string }> };
export async function GET(request: Request, context: Context) {
  try {
    const { id, asset } = await context.params;
    if (!assetTypes[asset]) return new Response("Not found", { status: 404 });
    const { template, bucket } = await ownedTemplate(request, id);
    if (!template) return new Response("Not found", { status: 404 });
    const file = await bucket.get(`templates/${id}/${asset}`);
    if (!file) return new Response("Not found", { status: 404 });
    return new Response(file.body, { headers: { "Content-Type": assetTypes[asset].type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { return failure(e); }
}
export async function PUT(request: Request, context: Context) {
  try {
    checkOrigin(request); const { id, asset } = await context.params;
    if (!assetTypes[asset]) return new Response("Not found", { status: 404 });
    const length = Number(request.headers.get("content-length"));
    if (!request.body) return Response.json({ error: "No file bytes received." }, { status: 400 });
    if (length > assetTypes[asset].max) return Response.json({ error: "This file is too large to save." }, { status: 413 });
    const { template, bucket } = await ownedTemplate(request, id);
    if (!template) return new Response("Not found", { status: 404 });
    if (template.status !== "draft" && template.status !== "package") return Response.json({ error: "This saved template is locked. Create a new version to change its artwork." }, { status: 409 });
    let body:ReadableStream<Uint8Array>|Uint8Array=request.body;
    if(!length){const reader=request.body.getReader();const chunks:Uint8Array[]=[];let size=0;while(true){const next=await reader.read();if(next.done)break;size+=next.value.byteLength;if(size>assetTypes[asset].max){await reader.cancel();return Response.json({error:"This file is too large to save."},{status:413});}chunks.push(next.value);}if(!size)return Response.json({error:"No file bytes received."},{status:400});const combined=new Uint8Array(size);let offset=0;for(const chunk of chunks){combined.set(chunk,offset);offset+=chunk.byteLength;}body=combined;}
    await bucket.put(`templates/${id}/${asset}`, body, { httpMetadata: { contentType: assetTypes[asset].type } });
    return Response.json({ saved: true });
  } catch (e) { return failure(e); }
}
