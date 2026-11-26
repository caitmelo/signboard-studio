import type {SavedTemplate,MediaValues,ContentValues} from './template-types';
export type FinalDesign={schemaVersion:1;id:string;name:string;approvedAt:string;status:'approved';delivery:{mode:'download';status:'not_submitted'};pdf:Uint8Array;filename:string;manifest:SavedTemplate;sourceTemplateId?:string};
export type FinalSummary=Pick<FinalDesign,'id'|'name'|'approvedAt'|'status'|'filename'>;
export type SendOffInput={base:Uint8Array;manifest:SavedTemplate;values:Record<string,string>;content:ContentValues;media:MediaValues;oneAgent:boolean;cropMarks:boolean;sourceTemplateId?:string};
/** Single finalisation boundary. A future Beleef adapter can consume the saved
 * FinalDesign (stable id, exact PDF, approved manifest); no outbound integration is active. */
export async function sendOffDesign(input:SendOffInput,services:{validate:(input:SendOffInput)=>void;render:(input:SendOffInput)=>Promise<Uint8Array>;persist:(final:FinalDesign)=>Promise<void>},identity={id:crypto.randomUUID(),approvedAt:new Date().toISOString()}):Promise<FinalDesign>{
 services.validate(input);
 const pdf=await services.render(input);
 if(pdf.length<5||new TextDecoder().decode(pdf.subarray(0,5))!=='%PDF-')throw Error('Print export did not produce a valid PDF. Nothing was saved as final.');
 const manifest={...input.manifest,defaults:{text:input.values,content:input.content,oneAgent:input.oneAgent,media:input.media},review:{status:'approved' as const,reviewedAt:identity.approvedAt,revision:input.manifest.review?.revision??1}};
 const final:FinalDesign={schemaVersion:1,...identity,name:manifest.name,status:'approved',delivery:{mode:'download',status:'not_submitted'},filename:`${manifest.name.replace(/[^\p{L}\p{N}_-]+/gu,'_')}_Approved_Print.pdf`,pdf,manifest,sourceTemplateId:input.sourceTemplateId};
 // Do not claim success or start a download until durable local storage commits.
 await services.persist(final);return final;
}
