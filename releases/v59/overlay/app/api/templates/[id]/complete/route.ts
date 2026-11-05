import { checkOrigin, failure, ownedTemplate } from "@/lib/template-storage";
import {layoutIssues,evaluateTemplate} from "@/lib/template-engine";
import type { SavedTemplate } from "@/lib/template-types";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    checkOrigin(request); const { id } = await context.params;
    const { template, bucket, db } = await ownedTemplate(request, id);
    if (!template) return new Response("Not found", { status: 404 });
    if (template.status === "ready") return Response.json({ id, saved: true });
    const files = await Promise.all(["source", "base", "manifest", "thumbnail"].map(asset => bucket.head(`templates/${id}/${asset}`)));
    if (files.some(f => !f)) return Response.json({ error: "The upload is incomplete. Please try saving again." }, { status: 409 });
    const asset = await bucket.get(`templates/${id}/manifest`);
    const manifest = await asset!.json<SavedTemplate>();
    const validNumber = (n: unknown) => typeof n === "number" && Number.isFinite(n);
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.fields) || (!manifest.fields.length && !manifest.media?.some(s=>s.role!=="fixed")) || manifest.fields.length > 600 || !manifest.fields.every(f => f && typeof f.text === "string" && f.text.length < 2000 && validNumber(f.x) && validNumber(f.y) && validNumber(f.size) && f.size > 0) || !validNumber(manifest.spec?.faceWidth) || !validNumber(manifest.spec?.faceHeight) || manifest.spec.faceWidth < 50 || manifest.spec.faceWidth > 15000 || manifest.spec.faceHeight < 50 || manifest.spec.faceHeight > 15000) return Response.json({ error: "The template fields or dimensions are incomplete." }, { status: 422 });
    if(manifest.review){
      if(!['approved','proof'].includes(manifest.review.status)||!Number.isInteger(manifest.review.revision)||manifest.review.revision<1||!Number.isFinite(Date.parse(manifest.review.reviewedAt)))return Response.json({error:"The template review record is incomplete."},{status:422});
      const fit=evaluateTemplate(manifest,manifest.defaults?.text??{},manifest.defaults?.oneAgent??false,manifest.defaults?.content??{});
      if(manifest.review.status==='approved'&&(!fit.valid||fit.printIssues.length||manifest.printIssues.length))return Response.json({error:"Resolve the original template's print and layout issues before approval, or save a proof version."},{status:422});
    }
    const geometryIssues=layoutIssues(manifest.spec,manifest.sourceWidth,manifest.sourceHeight);
    if(geometryIssues.length)return Response.json({error:geometryIssues[0]},{status:422});
    await bucket.put(`templates/${id}/manifest`,JSON.stringify(manifest),{httpMetadata:{contentType:'application/json'},customMetadata:{revision:String(manifest.review?.revision??1)}});
    await db.prepare("UPDATE sign_templates SET status = 'ready', field_count = ?, face_width_mm = ?, face_height_mm = ? WHERE id = ? AND status = 'draft'").bind(manifest.fields.length+(manifest.media?.filter(s=>s.role!=="fixed").length??0), Math.round(manifest.spec.faceWidth), Math.round(manifest.spec.faceHeight), id).run();
    return Response.json({ id, saved: true });
  } catch (e) { return failure(e); }
}
