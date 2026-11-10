import {addStyleFonts} from './rich-text';
import {evaluateTemplate,loadEngineAssets} from './template-engine';
import {defaultMediaValues,evaluateMedia} from './template-media';
import type {SavedTemplate,ContentValues,MediaValues} from './template-types';
export type PreviewJob={values:Record<string,string>;content:ContentValues;media:MediaValues;oneAgent:boolean};
// Preview-only recovery. Final validation continues to use every requested edit.
export function recoverPreview(t:SavedTemplate,requested:PreviewJob,previous?:PreviewJob):PreviewJob{
 const valid=(job:PreviewJob)=>evaluateTemplate(t,job.values,job.oneAgent,job.content).valid&&evaluateMedia(t,job.media).valid;
 if(valid(requested))return requested;
 let result=previous&&valid(previous)?previous:{values:Object.fromEntries(t.fields.map(f=>[f.id,f.text])),content:{},media:defaultMediaValues(t),oneAgent:false};
 const accept=(next:PreviewJob)=>{if(valid(next))result=next;};
 accept({...result,oneAgent:requested.oneAgent});
 for(const key of new Set([...Object.keys(result.content),...Object.keys(requested.content)])){const content={...result.content};if(key in requested.content)content[key]=requested.content[key];else delete content[key];accept({...result,content});}
 for(const [key,value] of Object.entries(requested.values))if(result.values[key]!==value)accept({...result,values:{...result.values,[key]:value}});
 for(const [key,value] of Object.entries(requested.media))if(result.media[key]!==value)accept({...result,media:{...result.media,[key]:value}});
 return result;
}

export async function refreshMatchingFonts(template:SavedTemplate):Promise<SavedTemplate>{
 const assets=await loadEngineAssets();
 const pages=template.pages?await Promise.all(template.pages.map(refreshMatchingFonts)):undefined;
 const fonts={...template.fonts};await Promise.all(Object.entries(fonts).map(async([name,font])=>{if(!font.choice&&(font.subset||font.fallbackName)){const full=await assets.loadFont?.(name);if(full)fonts[name]=full;}}));
 return {...template,fonts:await addStyleFonts(fonts,assets.loadFont),...(pages?{pages}: {})};
}
