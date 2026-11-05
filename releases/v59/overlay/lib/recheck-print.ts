import {inspectPdf} from './pdf-content';
import {colourConverter} from './template-colour';
import {evaluateTemplate,type EngineAssets} from './template-engine';
import {evaluateMedia} from './template-media';
import type {SavedTemplate,MediaValues,ContentValues} from './template-types';
const colourNote='A fixed vector colour or pattern needs printer colour review. Its original appearance is preserved.';
const proofNote='This template version is saved for proofs. Correct its outstanding issues and approve a new version before print export.';
/** Recheck the stored artwork, never waive unresolved colour or bleed errors. */
export async function recheckPrint(base:Uint8Array,template:SavedTemplate,assets:EngineAssets,values:Record<string,string>,oneAgent:boolean,media:MediaValues,content:ContentValues){
 async function page(t:SavedTemplate,index:number):Promise<SavedTemplate>{
  const checked=await inspectPdf(base,index,colourConverter(assets.table),assets.icc);
  return {...t,review:undefined,printIssues:[...new Set([...t.printIssues.filter(v=>v!==colourNote&&v!==proofNote),...checked.printIssues])]};
 }
 const pages=template.pages?await Promise.all(template.pages.map(page)):undefined;
 const candidate=pages?{...template,review:undefined,pages,printIssues:[...template.printIssues.filter(v=>![colourNote,proofNote].includes(v.replace(/^Page \d+: /,''))),...pages.flatMap(p=>p.printIssues)]}:await page(template,0);
 const text=evaluateTemplate(candidate,values,oneAgent,content),images=evaluateMedia(candidate,media);
 const issues=[...candidate.printIssues,...text.errors,...text.printIssues,...images.errors,...images.printIssues];
 if(issues.length)throw Error([...new Set(issues)].join(' '));
 return candidate;
}
