"use client";
import {applyPrintFormat,physicalPaper} from '@/lib/print-format';
import {reviewItems} from '@/lib/review-items';
import {previewOverlays} from '@/lib/preview-overlays';
import {approveWithIssues} from '@/lib/design-approval';
import {prepareConfirmedPaper} from '@/lib/commercial-size';
import {keepUploadedSize} from '@/lib/size-resolution';
import {repairFixedFont,sourceFontName} from "@/lib/source-fonts";
import {saveLocalDraft,readLocalDraft,type DesignApproval} from "@/lib/local-drafts";
import {MissingFonts,uploadLicensedFont} from "./missing-fonts";
import {missingFonts,acceptAlternative} from "@/lib/font-choices";
import type {FontData} from "@/lib/template-types";
import {packageEngineAssets,type PackageFont} from "@/lib/package-fonts";
import {addMissingSourceBleed} from '@/lib/missing-bleed';
import {templateName,stepError} from '@/lib/template-names';
import {reconstructUnreliablePages,applyVisualGroups} from '@/lib/visual-fallback';
import {extendPaperBleed,renderBleedEdges,requiresPaperBleed} from '@/lib/paper-bleed';
import {documentColour} from '@/lib/document-colour';
import {prepareSignboard} from '@/lib/signboard-preparation';
import {fillMediaPreviews} from '@/lib/media-previews';
import {recoverPreview,type PreviewJob} from '@/lib/preview-job';
import {contactMedia} from '@/lib/content-groups';
import {renderLivePreview} from '@/lib/live-preview';

import {optimisePdf,uploadTemplateAsset,saveRequest} from '@/lib/pdf-upload';
import {compileDocument,namespacePage} from '@/lib/document-template';
import {WatermarkCleanup} from '@/components/watermark-cleanup';
import {DocumentSetupForm} from '@/components/document-setup';
import {detectDocument,type DocumentSetup} from '@/lib/document-setup';
import {useEffect,useMemo,useRef,useState} from 'react';
import {AlertCircle,ArrowLeft,Check,FileCheck2,FileUp,Layers2,Loader2,Plus,Save} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {PhotoCorrections,AnalysisNotes} from '@/components/template-corrections';
import {Checkbox} from '@/components/ui/checkbox';
import {Input} from '@/components/ui/input';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import {Tabs,TabsContent,TabsList,TabsTrigger} from '@/components/ui/tabs';
import {PdfPreview} from '@/components/pdf-preview';
import {PrintSettings} from '@/components/print-settings';
import {isSignboard,normalizeSavedTemplate} from '@/lib/print-specs';
import {MediaControls,MediaSetup} from '@/components/media-fields';
import {ContentEditor,GroupSettings} from '@/components/content-editor';
import {contentGroups} from '@/lib/content-groups';
import {TextFieldEditor,roleNames} from '@/components/text-field-editor';
import {analyseDesign,compileDesign,evaluateTemplate,layoutIssues,loadEngineAssets} from '@/lib/template-engine';
import {defaultMediaValues,savedMediaValues,evaluateMedia} from '@/lib/template-media';
import type {Analysis,MediaSlot,MediaValues,Role,SavedTemplate,ContentValues,ContentGroup} from '@/lib/template-types';

type Compiled={base:Uint8Array;manifest:SavedTemplate};
async function json(response:Response){const data=await response.json()as any;if(!response.ok)throw new Error(data.error||'The request could not be completed.');return data;}

export function TemplateBuilder({initialFile,onFiles,onSaved,onNameChange,visible=true,packageId,packageFonts,packageNotes,initialName}:{visible?:boolean;initialFile?:File;packageId?:string;initialName?:string;packageFonts?:PackageFont[];packageNotes?:string[];onFiles?:(files:File[])=>void;onSaved?:(id:string)=>void;onNameChange?:(name:string)=>void}={}){
 const[approval,setApproval]=useState<DesignApproval|undefined>(),[acceptIssues,setAcceptIssues]=useState(false);const restoredApproval=useRef(false),approvalLock=useRef(false);
 const[view,setView]=useState<'review'|'edit'|'approved'>('review');
 const[buildProgress,setBuildProgress]=useState(0),[draftMessage,setDraftMessage]=useState('');
 const localId=useRef(''),restoring=useRef(false),draftQueue=useRef<Promise<void>>(Promise.resolve());
 const editorRoot=useRef<HTMLDivElement>(null);
 const[file,setFile]=useState<File|null>(null),[source,setSource]=useState<Uint8Array|null>(null),[analysis,setAnalysis]=useState<Analysis|null>(null),[name,setName]=useState('');
 const[saveProgress,setSaveProgress]=useState<{percent:number;step:string}|null>(null);
 const[analyses,setAnalyses]=useState<Analysis[]>([]);
 const[watermarkClean,setWatermarkClean]=useState<{data:Uint8Array;count:number}|null>(null),[watermarkBusy,setWatermarkBusy]=useState(false);
 const[documentSetup,setDocumentSetup]=useState<DocumentSetup|null>(null);
 const[compareOriginal,setCompareOriginal]=useState(false),[showFrames,setShowFrames]=useState(true),[reviewLocation,setReviewLocation]=useState<{page:number;ids:string[]}|null>(null);
 const[originalUpload,setOriginalUpload]=useState<Uint8Array|null>(null),[visualPages,setVisualPages]=useState<number[]>([]);
 const[parentVersion,setParentVersion]=useState<{id:string;revision:number}|null>(null);
 const[content,setContent]=useState<ContentValues>({});
 const[values,setValues]=useState<Record<string,string>>({}),[oneAgent,setOneAgent]=useState(false),[mediaValues,setMediaValues]=useState<MediaValues>({});
 const[compiled,setCompiled]=useState<Compiled|null>(null),[pdf,setPdf]=useState<Uint8Array|null>(null),[thumbnail,setThumbnail]=useState<Blob|null>(null),[draftId,setDraftId]=useState<string|null>(packageId??null);
 const[busy,setBusy]=useState(''),[compiling,setCompiling]=useState(false),[rendering,setRendering]=useState(false),[mediaBusy,setMediaBusy]=useState(false);
 const[error,setError]=useState(''),[compileError,setCompileError]=useState(''),[renderError,setRenderError]=useState('');
 const[dragging,setDragging]=useState(false),[selected,setSelected]=useState(''),[tab,setTab]=useState('text'),[selectingQr,setSelectingQr]=useState(false);
 const input=useRef<HTMLInputElement>(null),compileRevision=useRef(0),renderRevision=useRef(0),compileQueue=useRef<Promise<void>>(Promise.resolve());
 const editId=(id:string)=>analyses.length>1&&!/^p\d+_/.test(id)?`p${(analysis?.pageIndex??0)+1}_${id}`:id;
 const previousPreview=useRef<{base:Uint8Array;job:PreviewJob}|null>(null);
 const fields=useMemo(()=>analysis?.runs.filter(r=>r.role!=='fixed')??[],[analysis]);
 const fontNeeds=useMemo(()=>missingFonts(compiled?(compiled.manifest.pages??[compiled.manifest]):analysis?(analyses.length>1?analyses.map(a=>a.pageIndex===analysis.pageIndex?analysis:a):[analysis]):[],values),[analysis,analyses,values,compiled]);
 function resolveFont(name:string,font:FontData){const update=(a:Analysis)=>({...a,fonts:{...a.fonts,[name]:font.choice?.kind==='alternative'?acceptAlternative(name,a.fonts[name],font.choice.replacement):font}});setAnalysis(a=>a?update(a):a);setAnalyses(pages=>pages.map(update));}
 const setupIssues=useMemo(()=>analysis?[...analysis.errors,...layoutIssues(analysis.spec,analysis.width,analysis.height),...fields.filter(f=>!analysis.fonts[f.fontName]).map(f=>`Upload ${f.fontName} for “${f.text}”.`)]:[],[analysis,fields]);
 const fit=useMemo(()=>{if(!compiled)return null;const text=evaluateTemplate(compiled.manifest,values,oneAgent,content),media=evaluateMedia(compiled.manifest,mediaValues);return{...text,valid:text.valid&&media.valid,errors:[...text.errors,...media.errors],printIssues:[...new Set([...compiled.manifest.printIssues,...text.printIssues,...media.printIssues])]};},[compiled,values,oneAgent,mediaValues,content]);

 function resolveSize(mode:'original'|'fit'){
  const update=(a:Analysis)=>({...a,spec:mode==='original'?keepUploadedSize(a.spec,a.width,a.height):{...a.spec,fitToProduct:true,sizeConfirmed:true,sizeWarning:undefined}});
  setAnalysis(a=>a?update(a):a);setAnalyses(pages=>pages.map(a=>update(analysis?.pageIndex===a.pageIndex?analysis:a)));setError('');setView('review');setCompareOriginal(false);
 }
 function acceptAnalysis(result:Analysis){setView('review');setCompareOriginal(false);setContent({});setAnalysis(result);setValues(Object.fromEntries(result.runs.map(r=>[r.id,r.text])));setMediaValues(defaultMediaValues(result));setSelected(result.runs[0]?.id??'');setOneAgent(false);setDraftId(packageId??null);setCompiled(null);setPdf(null);setThumbnail(null);setTab('text');setSelectingQr(false);}
 useEffect(()=>{
  if(initialFile||new URLSearchParams(window.location.search).has('draft'))return;const from=new URLSearchParams(window.location.search).get('from');if(!from||!/^[a-f0-9-]{36}$/.test(from))return;
  let active=true;setBusy('Opening template setup…');
  (async()=>{try{const[sourceResponse,manifestResponse]=await Promise.all([fetch(`/api/templates/${from}/assets/source`),fetch(`/api/templates/${from}/assets/manifest`)]);if(!sourceResponse.ok||!manifestResponse.ok)throw new Error('This template could not be opened.');const data=new Uint8Array(await sourceResponse.arrayBuffer()),saved=await manifestResponse.json()as SavedTemplate;const result=await analyseDesign(data,saved.sourceName,saved.sourcePageIndex??0,await packageEngineAssets(packageFonts,await loadEngineAssets()));
   setParentVersion({id:from,revision:saved.review?.revision??1});
   const settings=new Map((saved.fieldSettings??saved.fields).map(field=>[field.id,field]));result.runs=result.runs.map(run=>{const previous=settings.get(run.id);return previous&&run.supported?{...run,role:previous.role,label:previous.label}:run;});result.spec=normalizeSavedTemplate(saved).spec;
   if(saved.groups&&!saved.pages)result.groups=saved.groups;
   if(saved.media&&!saved.pages)result.media=saved.media;
   for(const[name,font]of Object.entries(saved.fonts))if(!result.fonts[name]||(!font.subset&&result.fonts[name].subset))result.fonts[name]=font;
   if(saved.pages?.length){const all:Analysis[]=[];for(const [i,p] of saved.pages.entries()){const a=await analyseDesign(data,saved.sourceName,p.sourcePageIndex??i,await packageEngineAssets(packageFonts,await loadEngineAssets()));a.spec=p.spec;const prefix=`p${i+1}_`;const settings=new Map((p.fieldSettings??p.fields).map(f=>[f.id.replace(prefix,''),f]));a.runs=a.runs.map(r=>({...r,...(settings.has(r.id)?{role:settings.get(r.id)!.role,label:settings.get(r.id)!.label}:{})}));const un=(v:string)=>v.startsWith(prefix)?v.slice(prefix.length):v;a.groups=p.groups?.map(g=>({...g,id:un(g.id),key:un(g.key),fieldIds:g.fieldIds.map(un),bindings:Object.fromEntries(Object.entries(g.bindings??{}).map(([k,v])=>[k,un(v)]))}));a.media=p.media?.map(m=>({...m,id:un(m.id),key:un(m.key),fragments:m.fragments?.map(f=>({...f,id:un(f.id),key:un(f.key)}))}));for(const[name,font]of Object.entries(p.fonts))if(!a.fonts[name]||(!font.subset&&a.fonts[name].subset))a.fonts[name]=font;all.push(a);}setAnalyses(all);Object.assign(result,all[0]);}
   if(active){setOriginalUpload(data.slice());setFile(new File([data.slice().buffer],saved.sourceName,{type:'application/pdf'}));setSource(data);setName(`${saved.name} (copy)`);acceptAnalysis(result);if(saved.pages){setValues(Object.fromEntries(saved.fields.map(f=>[f.id,f.text])));setMediaValues(defaultMediaValues(saved));}if(saved.defaults){setMediaValues(defaultMediaValues(saved));setValues(v=>({...v,...saved.defaults!.text}));setContent(saved.defaults.content);setOneAgent(saved.defaults.oneAgent);}}
  }catch(e){if(active)setError(e instanceof Error?e.message:'The template could not be opened.');}finally{if(active)setBusy('');}})();
  return()=>{active=false;};
 },[]);
 useEffect(()=>{if(initialFile)void readFile(initialFile);},[initialFile]);
 useEffect(()=>{if(name)onNameChange?.(name);},[name]);
 useEffect(()=>{const id=new URLSearchParams(window.location.search).get('draft');if(!id)return;restoring.current=true;setBusy('Opening draft…');readLocalDraft(id).then(d=>{if(!d)throw Error('This draft is not available in this browser.');localId.current=d.id;const s=d.state;setFile(s.file);setSource(s.source);setName(d.name);setDocumentSetup(s.documentSetup);setAnalysis(s.analysis);setAnalyses(s.analyses??[]);setValues(s.values??{});setContent(s.content??{});setOneAgent(s.oneAgent??false);setMediaValues(s.mediaValues??{});setOriginalUpload(s.originalUpload??null);if(!s.originalUpload&&s.file)void s.file.arrayBuffer().then((b:ArrayBuffer)=>setOriginalUpload(new Uint8Array(b)));setVisualPages(s.visualPages??[]);restoredApproval.current=true;setApproval(d.approval);setView(d.approval?'approved':'review');setDraftMessage(d.approval?'Approved design restored.':'Draft restored.');}).catch(e=>setError(e.message)).finally(()=>{restoring.current=false;setBusy('');});},[]);
 async function saveDraft(manual=false,approved=approval){if(!file||restoring.current)return;if(!localId.current)localId.current=crypto.randomUUID();const snapshot={id:localId.current,name:name||file.name,updatedAt:new Date().toISOString(),approval:approved,state:{file,source,documentSetup,analysis,analyses,values,content,oneAgent,mediaValues,originalUpload,visualPages}};draftQueue.current=draftQueue.current.catch(()=>{}).then(async()=>{try{await saveLocalDraft(snapshot);setDraftMessage(approved?'Approved and saved on this browser.':'Draft saved on this browser.');}catch{setDraftMessage('Draft could not be saved. Browser storage may be full. Keep this tab open.');throw Error('Browser draft storage is full or unavailable.');}});if(manual)setDraftMessage('Saving draft…');await draftQueue.current;}
 useEffect(()=>{if(restoredApproval.current){restoredApproval.current=false;return;}setApproval(undefined);setAcceptIssues(false);setView('review');},[file,source,analysis,analyses,values,content,oneAgent,mediaValues,name]);
 useEffect(()=>{if(!file||busy||restoring.current)return;const timer=setTimeout(()=>void saveDraft().catch(()=>{}),2000);return()=>clearTimeout(timer);},[file,source,documentSetup,analysis,analyses,values,content,oneAgent,mediaValues,name,busy,approval]);
 function pickFiles(files:File[]){if(onFiles)onFiles(files);else if(files[0])void readFile(files[0]);}
 async function readFile(next:File){
  if(busy)return;if(!next.name.toLowerCase().endsWith('.pdf')){setError('Choose a PDF design.');return;}
  setWatermarkClean(null);setOriginalUpload(null);setVisualPages([]);setParentVersion(null);setDocumentSetup(null);setBusy('Checking document size…');setError('');setAnalysis(null);setAnalyses([]);setCompiled(null);setPdf(null);setFile(next);setName(initialName||templateName(next.name));
  try{setBusy(next.size>20*1024*1024?'Optimising PDF without reducing image quality…':'Checking document size…');const uploaded=new Uint8Array(await next.arrayBuffer());setOriginalUpload(uploaded);const data=await optimisePdf(uploaded,next.name);setSource(data);setDocumentSetup(await detectDocument(data,next.name));}catch(e){setError(stepError('PDF import',e));}finally{setBusy('');}
 }
 async function setupPage(index:number){if(!source||!file)return;setBusy('Checking document size…');setError('');try{setDocumentSetup(await detectDocument(source,file.name,index));setAnalysis(null);}catch(e){setError(stepError('Page setup',e));}finally{setBusy('');}}
 async function openDesign(confirmedSetup?:DocumentSetup){
  const setupDocument=confirmedSetup??documentSetup;
  if(!source||!file||!setupDocument||watermarkBusy)return;setBuildProgress(5);setBusy('Building your design…');setError('');let stage='Loading fonts and colour settings';
  try{
   let prepared=watermarkClean?.data??source;const indexes=setupDocument.includeAll===false?[setupDocument.pageIndex]:Array.from({length:setupDocument.pageCount},(_,i)=>i);
   const setups=new Map<number,DocumentSetup>(),generated=new Set<number>(),assets=await packageEngineAssets(packageFonts,await loadEngineAssets());
   for(const i of indexes){
    setBuildProgress(5+Math.round(25*indexes.indexOf(i)/indexes.length));stage=`Preparing page ${i+1} size and bleed`;const setup=i===setupDocument.pageIndex?structuredClone(setupDocument):await detectDocument(prepared,file.name,i);
    if(setupDocument.spec.format&&physicalPaper(setup.spec)===physicalPaper(setupDocument.spec))setup.spec=applyPrintFormat(setup.spec,setupDocument.spec.format);
    {const normal=await prepareConfirmedPaper(prepared,i,setup.spec,setup.commercial?.trim);prepared=normal.data;setup.spec=normal.spec;}
    prepared=await prepareSignboard(prepared,i,setup.spec);
    {setBusy(`Extending page ${i+1} artwork into the bleed…`);const bleed=await addMissingSourceBleed(prepared,i,setup.spec);prepared=bleed.data;setup.spec=bleed.spec;if(bleed.generated)generated.add(i);}
    setups.set(i,setup);
   }
   stage='Reading artwork';const fallback=await reconstructUnreliablePages(prepared,file.name,indexes,setups,setBusy);
   if(fallback.scenes.size){setVisualPages([...fallback.scenes.keys()]);}prepared=fallback.data;
   setSource(prepared);const pages:Analysis[]=[];
   for(const i of indexes){setBuildProgress(35+Math.round(45*indexes.indexOf(i)/indexes.length));stage=`Detecting fields on page ${i+1}`;setBusy(`Analysing page ${i+1} of ${setupDocument.pageCount}…`);const result=await analyseDesign(prepared,file.name,i,assets),setup=setups.get(i)!;
    result.media=await fillMediaPreviews(prepared,result.media??[],i);result.spec={...setup.spec,sourceIncludesBleed:setup.spec.resizeMode==='fit'&&['edgewrap','linea','bannerwrap','pointer','other_signboard'].includes(setup.spec.product??'')?true:setup.spec.sourceIncludesBleed,productConfirmed:true,sizeConfirmed:!setup.spec.sizeWarning};
    if(fallback.scenes.has(i))applyVisualGroups(result,fallback.scenes.get(i)!);
    if(watermarkClean)result.warnings.push('Reviewed proof watermark overlays were removed during import.');
    if(generated.has(i))result.warnings.push('Bleed generated by extending the outer edge pixels. The original trim artwork is unchanged.');pages.push(result);
   }
   setBuildProgress(85);setAnalyses(pages);acceptAnalysis(pages[0]);
   if(pages.length>1){setValues(Object.fromEntries(pages.flatMap((a,i)=>a.runs.map(r=>[`p${i+1}_${r.id}`,r.text]))));setMediaValues(Object.assign({},...pages.map((a,i)=>Object.fromEntries(Object.entries(defaultMediaValues(a)).map(([k,v])=>[`p${i+1}_${k}`,v.kind==='original'?{...v,slotId:`p${i+1}_${v.slotId}`}:v])))));}
   setDocumentSetup(null);
  }catch(e){setError(stepError(stage,e));}finally{setBusy('');}
 }

 async function changePage(value:string){if(analysis)setAnalyses(list=>list.map(a=>a.pageIndex===analysis.pageIndex?analysis:a));setAnalysis(analyses[Number(value)]);setSelected('');}
 function changeRole(id:string,role:Role){setAnalysis(a=>a?{...a,runs:a.runs.map(r=>r.id===id?{...r,role,label:role==='custom'||role==='fixed'?r.text:roleNames[role]}:r)}:a);setError('');}
 async function uploadFont(id:string,file:File,licensed:boolean,replace=false){
  const field=analysis?.runs.find(r=>r.id===id.replace(/^p\d+_/,''));if(!field)return;
  setBusy('Reading and saving the font…');setError('');try{resolveFont(field.fontName,await uploadLicensedFont(field.fontName,file,licensed,replace));}catch(e){setError(stepError('Font upload',e));}finally{setBusy('');}
 }
 function addQrRegion(box:{x:number;y:number;width:number;height:number}){setAnalysis(a=>{if(!a)return a;const keys=new Set(a.media?.map(s=>s.key));let number=1;while(keys.has(`qr_${number}`))number++;const slot:MediaSlot={...box,region:true,id:`qr_region_${crypto.randomUUID()}`,key:`qr_${number}`,label:`QR code ${number}`,role:'qr',stream:'page',opIndex:-1,resourceName:'',matrix:[box.width,0,0,box.height,box.x,box.y],viewport:[0,0,1,1],pixelWidth:0,pixelHeight:0,supported:true,sourceDpi:0,qrStyle:{foreground:[0,0,0,1],background:[0,0,0,0],quietZone:4,shape:'square',correction:'M'}};return{...a,media:[...(a.media??[]),slot]};});setSelectingQr(false);}

 // Definitions compile automatically. Values use the prepared base without recompiling.
 useEffect(()=>{
  const current=++compileRevision.current;setCompiled(null);setPdf(null);setThumbnail(null);setCompileError('');setCompiling(false);
  if(!analysis||!source||setupIssues.length)return;
  setCompiling(true);const timer=setTimeout(()=>{compileQueue.current=compileQueue.current.catch(()=>{}).then(async()=>{if(current!==compileRevision.current)return;try{const pages=analyses.length>1?analyses.map(a=>a.pageIndex===analysis.pageIndex?analysis:a):[analysis];const result=await compileDocument(source,pages,name.trim()||analysis.fileName,await packageEngineAssets(packageFonts,await loadEngineAssets()));for(const [fontName,font] of Object.entries(analysis.fonts))if(font.choice&&result.manifest.printIssues.some(v=>sourceFontName(v)===fontName)){const repaired=await repairFixedFont(result.base,result.manifest,fontName,font,await loadEngineAssets());result.base=repaired.base;result.manifest=repaired.manifest;}if(packageNotes?.length){result.manifest.warnings=[...result.manifest.warnings,...packageNotes];result.manifest.printIssues=[...result.manifest.printIssues,...packageNotes];}if(current===compileRevision.current){setCompiled(result);setCompiling(false);}}catch(e){if(current===compileRevision.current){setCompileError(stepError('Preparing editable fields',e));setCompiling(false);}}});},200);
  return()=>{clearTimeout(timer);compileRevision.current++;};
 },[analysis,analyses,source,name,setupIssues]);
 useEffect(()=>{
  const current=++renderRevision.current;setRenderError('');setRendering(false);
  if(!visible||!compiled)return;
  setRendering(true);const timer=setTimeout(async()=>{try{const job=recoverPreview(compiled.manifest,{values,oneAgent,media:mediaValues,content},previousPreview.current?.base===compiled.base?previousPreview.current.job:undefined);const result=await renderLivePreview(compiled.base,compiled.manifest,job.values,job.oneAgent,await packageEngineAssets(packageFonts,await loadEngineAssets()),job.media,job.content,analysis?.pageIndex??0);if(current===renderRevision.current){previousPreview.current={base:compiled.base,job};setPdf(result);setRendering(false);setBuildProgress(100);}}catch(e){if(current===renderRevision.current){setRenderError(stepError('Proof preview',e));setRendering(false);}}},200);
  return()=>{clearTimeout(timer);renderRevision.current++;};
 },[compiled,values,oneAgent,mediaValues,fit,content,analysis?.pageIndex,visible]);

 useEffect(()=>setCompareOriginal(false),[values,content,mediaValues,oneAgent]);
 async function downloadDraft(mode:'proof'|'print'){
  if(!compiled||!fit?.valid||mediaBusy||compiling)return;
  setBusy('Generating PDF…');setError('');
  try{const {renderPythonTemplate}=await import('@/lib/python-engine');
   const output=await renderPythonTemplate(compiled.base,compiled.manifest,values,oneAgent,await loadEngineAssets(),mediaValues,content,mode,!isSignboard(compiled.manifest.spec));
   const url=URL.createObjectURL(new Blob([output.slice().buffer],{type:'application/pdf'}));
   const link=document.createElement('a');link.href=url;link.download=`${name.replace(/[^a-z0-9_-]+/gi,'_')}_${mode}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
  }catch(e){setError(stepError('PDF download',e));}finally{setBusy('');}
 }
 async function syncApprovedTemplate(record:DesignApproval){
  if(!compiled||!source)return;
  // Preserve account saving when signed in; browser approval never requires login.
  const access=await fetch('/api/templates',{signal:AbortSignal.timeout(15000)});if(access.status===401||access.status===403)return;
  if(!access.ok)throw Error('Account storage is unavailable.');
  let id=draftId;if(!id){const row=await json(await saveRequest('/api/templates',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:compiled.manifest.name,sourceName:compiled.manifest.sourceName})}));id=row.id;setDraftId(id);}
  const manifest={...compiled.manifest,designApproval:record,defaults:{text:values,content,oneAgent,media:savedMediaValues(mediaValues)},review:{status:'proof',reviewedAt:record.approvedAt,revision:(parentVersion?.revision??0)+1,parentId:parentVersion?.id}};
  const assets:[string,Blob][]=[['source',new Blob([source.slice().buffer],{type:'application/pdf'})],['base',new Blob([compiled.base.slice().buffer],{type:'application/pdf'})],['manifest',new Blob([JSON.stringify(manifest)],{type:'application/json'})]];
  if(thumbnail)assets.push(['thumbnail',thumbnail]);
  for(const [key,data] of assets)await uploadTemplateAsset(id!,key,data,()=>{});
  await json(await saveRequest(`/api/templates/${id}/complete`,{method:'POST'}));
  setDraftMessage('Approved and saved on this browser and to your account.');
 }
 const rawEditorTemplate=useMemo(()=>analysis?{schemaVersion:1,name,sourceName:analysis.fileName,sourceWidth:analysis.width,sourceHeight:analysis.height,fields,fonts:analysis.fonts,spec:analysis.spec,media:analysis.media,groups:contentGroups({fields,groups:analysis.groups}),warnings:[],printIssues:[],createdAt:''}as SavedTemplate:null,[analysis,fields,name]);
 const editorTemplate=useMemo(()=>rawEditorTemplate&&analyses.length>1?namespacePage(rawEditorTemplate,analysis!.pageIndex):rawEditorTemplate,[rawEditorTemplate,analyses.length,analysis?.pageIndex]);
 function changeGroups(groups:ContentGroup[]){setContent(c=>Object.fromEntries(Object.entries(c).filter(([key])=>{if(analyses.length>1&&!key.startsWith(`p${analysis!.pageIndex+1}_`))return true;const old=editorTemplate?.groups?.find(g=>g.key===key),next=groups.find(g=>g.key===key);return old&&next&&old.kind===next.kind&&JSON.stringify(old.fieldIds)===JSON.stringify(next.fieldIds);})));setAnalysis(a=>a?{...a,groups}:a);}
 const problems=[...new Set([...setupIssues,...(fit?.errors??[]),compileError,renderError].filter(Boolean))];
 const outstanding=[...new Set([...problems,...(fit?.printIssues??[]),...fontNeeds.map(f=>`Page ${f.pages.join(', ')}: ${f.name} needs a font choice. Upload the font or approve ${f.replacement}.`)])];
 const issueKey=JSON.stringify(outstanding);
 useEffect(()=>{setAcceptIssues(false);},[issueKey]);
 async function approveDesign(){
  if(approvalLock.current||busy||!file||(outstanding.length&&!acceptIssues))return;
  approvalLock.current=true;setBusy('Approving and saving…');setError('');
  try{const record=await approveWithIssues(outstanding,acceptIssues,r=>saveDraft(true,r));setApproval(record);setView('approved');try{await syncApprovedTemplate(record);}catch{setDraftMessage('Approved and saved on this browser. Account sync failed; your local copy is safe.');}}catch(e){setError(stepError('Approval save',e));}finally{approvalLock.current=false;setBusy('');}
 }
 const sourcePreview=compareOriginal||selectingQr||!pdf;
 const showingOriginal=!!originalUpload&&compareOriginal;
 const reviewPages=analyses.length>1?analyses.map(a=>a.pageIndex===analysis?.pageIndex?analysis:a):analysis?[analysis]:[];
 const groupedIssues=reviewItems(outstanding,reviewPages);
 const appliedChanges=[...new Set((compiled?.manifest.warnings??[]).filter(v=>/generated|converted|removed|extended|fitted|verified/i.test(v)))];
 const pageTemplate=compiled?.manifest.pages?.[analysis?.pageIndex??0]??compiled?.manifest;
 const overlays=pageTemplate?previewOverlays(pageTemplate,values,oneAgent,content):null;
 async function inspectIssue(location:{page:number;ids:string[]}){if(analysis?.pageIndex!==location.page)await changePage(String(location.page));setReviewLocation(location);setSelected(location.ids[0]??'');setShowFrames(true);setCompareOriginal(false);setTimeout(()=>editorRoot.current?.querySelector('.import-preview-stage')?.scrollIntoView({block:'nearest'}),0);}
 return <div ref={editorRoot} className="studio"><header className="masthead"><a className="brand" href="/"><Layers2 size={23}/><span>Signboard <strong>Studio</strong></span></a><a className="back-link" href="/"><ArrowLeft size={16}/>Templates</a></header><main className="builder-main">
  <div className="builder-heading"><div><span className="eyebrow">NEW TEMPLATE</span><h1>{analysis?(view==='edit'?'Make changes':view==='approved'?'Template approved':'Review your design'):documentSetup?'Confirm your document':'Upload your design'}</h1><p>{approval?'Your template is saved. You can start the next upload.':analysis?'Edit content and media below, then review every page before approving.':'Upload a design, confirm its size, then review.'}</p></div><div className="flow-steps"><span className={analysis||documentSetup?'done':'active'}>1 Upload</span><span className={documentSetup?'active':analysis?'done':''}>2 Document size</span><span className={analysis?'active':''}>3 Review</span></div></div>
  {draftMessage&&<p role="status">{draftMessage}</p>}
  {(busy||compiling||rendering||buildProgress===100)&&file&&<div className="notice" role="status"><div><p>{busy||compiling?'Building your design…':rendering?'Preparing preview…':'100% · Preview ready'}</p><progress max={100} value={buildProgress} aria-label="Design build progress"/><p>{busy|| (compiling?'Preparing editable fields…':rendering?'Rendering preview…':'Review the pages below.')}</p></div></div>}
  <input ref={input} className="sr-only" type="file" multiple accept=".pdf,.indd,.idml,.zip" onChange={e=>{pickFiles(Array.from(e.target.files??[]));e.target.value='';}}/>
  {documentSetup?<><label className="control-label" htmlFor="setup-name">Template name</label><Input id="setup-name" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. A4 Trifold DL"/><p className="help-text">Name this template however you like. The print size is set separately below.</p><DocumentSetupForm value={documentSetup} onChange={setDocumentSetup} onContinue={openDesign} onCancel={()=>{setDocumentSetup(null);setError('');input.current?.click();}} onPage={setupPage} busy={!!busy||watermarkBusy} fileName={file?.name??''}>{source&&<WatermarkCleanup source={source} disabled={!!busy} onChange={setWatermarkClean} onBusyChange={setWatermarkBusy}/>}</DocumentSetupForm>{error&&<div className="notice error" role="alert">{error}</div>}</>:!analysis?<div className={`drop-zone ${dragging?'dragging':''}`} onDragOver={e=>{e.preventDefault();setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);pickFiles(Array.from(e.dataTransfer.files));}}><div className="drop-icon">{busy?<Loader2 className="spin" size={35}/>:<FileUp size={35}/>}</div><h2>{busy||'Drop your PDF designs here'}</h2><p>Include the size in the filename, such as “6x4 Edgewrap.pdf”.</p><Button size="lg" disabled={!!busy} onClick={()=>input.current?.click()}><Plus size={18}/>Choose PDFs</Button><span className="drop-note">PDF · Automatic lossless optimisation · All artwork pages</span>{error&&<div className="notice error" role="alert"><AlertCircle size={18}/>{error}</div>}</div>:
  <div className="import-workspace"><aside className="import-controls"><fieldset disabled={!!busy} style={{display:"contents"}}>

   <MissingFonts needs={fontNeeds} onResolve={resolveFont} disabled={!!busy}/>
   <div className="source-file"><FileUp size={19}/><div><strong>{file?.name}</strong><span>{analysis.pageCount} {analysis.pageCount===1?'page':'pages'}</span></div><Button variant="ghost" size="sm" disabled={!!busy} onClick={()=>input.current?.click()}>Change</Button></div>
   {visualPages.length>0&&<div className="notice warning"><p>Path B · Visual reconstruction used on pages {visualPages.map(i=>i+1).join(', ')}. Compare the wording, fonts and image crops with the original before saving.</p></div>}
   <label className="control-label" htmlFor="template-name">Template name</label><Input id="template-name" value={name} disabled={!!busy} onChange={e=>setName(e.target.value)} maxLength={160}/>
   {analyses.length>1&&<div className="page-select"><label className="control-label">Artwork page</label><Select value={String(analysis.pageIndex)} disabled={!!busy} onValueChange={changePage}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{Array.from({length:analysis.pageCount},(_,i)=><SelectItem key={i} value={String(i)}>Page {i+1}</SelectItem>)}</SelectContent></Select></div>}
   <div><Tabs value={tab} onValueChange={v=>{setTab(v);if(v==='correct')setCompareOriginal(true);}} className="setup-tabs"><TabsList className="w-full"><TabsTrigger value="text">Content <span className="count-badge">{editorTemplate?.groups?.length??0}</span></TabsTrigger><TabsTrigger value="media">Media <span className="count-badge">{analysis.media?.filter(s=>s.role!=='fixed').length??0}</span></TabsTrigger><TabsTrigger value="print">Print size</TabsTrigger><TabsTrigger value="correct">Correct</TabsTrigger></TabsList>
    <TabsContent value="text">{editorTemplate&&<ContentEditor issues={fit?.errors??[]} renderMedia={g=>contactMedia(editorTemplate,g).length?<MediaControls allSlots={compiled?.manifest.media} slots={contactMedia(editorTemplate,g)} values={mediaValues} onChange={setMediaValues} onBusyChange={setMediaBusy}/>:null} template={editorTemplate} values={values} content={content} oneAgent={oneAgent} busy={!!busy} onValue={(id,value)=>setValues(v=>({...v,[editId(id)]:value}))} onContent={setContent} onOneAgent={setOneAgent} onFont={uploadFont} selected={selected} onSelect={setSelected}/>}
     <GroupSettings runs={analysis.runs} groups={rawEditorTemplate?.groups??[]} busy={!!busy} onChange={changeGroups}/>
     <details className="advanced-text-settings"><summary>Advanced text & font settings</summary><TextFieldEditor runs={analysis.runs} fonts={analysis.fonts} values={Object.fromEntries(analysis.runs.map(r=>[r.id,values[editId(r.id)]??r.text]))} oneAgent={oneAgent} busy={!!busy} onValue={(id,value)=>{setValues(v=>({...v,[editId(id)]:value}));setContent(c=>Object.fromEntries(Object.entries(c).filter(([key])=>!editorTemplate?.groups?.find(g=>g.key===key)?.fieldIds.includes(id))));}} onRole={changeRole} onLabel={(id,label)=>setAnalysis(a=>a?{...a,runs:a.runs.map(run=>run.id===id?{...run,label}:run)}:a)} onFont={uploadFont} selected={selected} onSelect={setSelected}/></details>
     {!analysis.runs.length&&<div className="notice"><p>No live text was found. Lettering inside a flattened image needs a source PDF with live text.</p></div>}
    </TabsContent>
    <TabsContent value="media"><details className="media-definition"><summary>Image and QR field settings</summary><MediaSetup slots={analysis.media??[]} onChange={media=>setAnalysis(a=>a?{...a,media}:a)} onAddQr={()=>setSelectingQr(true)}/></details>{analysis.media?.some(s=>s.role!=='fixed')&&<MediaControls allSlots={compiled?.manifest.media} slots={editorTemplate?.media??[]} values={mediaValues} onChange={setMediaValues} onBusyChange={setMediaBusy}/>}</TabsContent>
    <TabsContent value="correct"><AnalysisNotes analysis={analysis}/><h3>Text types and mappings</h3><p className="help-text">Live text can be editable or fixed. Raster lettering cannot become live text by changing its type.</p><TextFieldEditor runs={analysis.runs} fonts={analysis.fonts} values={Object.fromEntries(analysis.runs.map(r=>[r.id,values[editId(r.id)]??r.text]))} oneAgent={oneAgent} busy={!!busy} onValue={(id,value)=>setValues(v=>({...v,[editId(id)]:value}))} onRole={changeRole} onLabel={(id,label)=>setAnalysis(a=>a?{...a,runs:a.runs.map(r=>r.id===id?{...r,label}:r)}:a)} onFont={uploadFont} selected={selected} onSelect={setSelected}/><GroupSettings runs={analysis.runs} groups={rawEditorTemplate?.groups??[]} busy={!!busy} onChange={changeGroups}/><h3>Photo, logo, icon and QR types</h3><MediaSetup slots={analysis.media??[]} onChange={media=>{setAnalysis(a=>a?{...a,media}:a);setMediaValues({});}} onAddQr={()=>setSelectingQr(true)}/><PhotoCorrections slots={analysis.media??[]} onChange={media=>{setAnalysis(a=>a?{...a,media}:a);setMediaValues({});}}/></TabsContent>
    <TabsContent value="print"><PrintSettings spec={analysis.spec} busy={!!busy} onChange={spec=>setAnalysis(a=>a?{...a,spec}:a)}/></TabsContent>
   </Tabs></div>
   {analysis&&layoutIssues(analysis.spec,analysis.width,analysis.height).some(v=>v.includes('different proportions'))&&<div className="notice warning"><h3>Choose how to size this design</h3><p>Your artwork and selected product have different proportions. Your edits are kept with either choice.</p><Button disabled={!!busy} onClick={()=>resolveSize('original')}>Keep uploaded size</Button><p className="help-text">Keep the PDF’s physical size (using the signboard’s 25% scale when applicable) and existing bleed setting. Applies to every page.</p><Button variant="outline" disabled={!!busy} onClick={()=>resolveSize('fit')}>Fit to selected product</Button><p className="help-text">Centre the entire design without stretching or cropping. Different proportions can leave margins; review the regenerated preview before approving.</p></div>}
   {error&&<div className="notice error" role="alert"><p>{error}</p></div>}
   <section aria-label="Approval review" className="approval-review"><h2>Review and approve</h2>{appliedChanges.length>0&&<div className="notice success"><strong>Automatically prepared</strong><ul>{appliedChanges.map(note=><li key={note}>{note}</li>)}</ul><p>Use Compare original to check these changes.</p></div>}
   {outstanding.length?<div className="notice warning"><strong>{groupedIssues.length} review item{groupedIssues.length===1?'':'s'}</strong><ul>{groupedIssues.map(item=><li key={item.message}><p>{item.message}</p>{item.locations.map(l=><Button key={l.page} variant="outline" size="sm" onClick={()=>inspectIssue(l)}>Page {l.page+1}{l.ids.length?' · Show affected frames':' · Review page artwork'}</Button>)}</li>)}</ul><p>You can approve and save with these issues recorded. A PDF that cannot render still needs repair before it can be downloaded.</p>{!approval&&<label className="correction-choice"><Checkbox checked={acceptIssues} onCheckedChange={v=>setAcceptIssues(v===true)}/><span>I accept the listed issues and want to approve this design.</span></label>}</div>:<p role="status">{compiling||rendering?'Checking the design…':'No unresolved issues found.'}</p>}
   {approval?<div role="status"><strong>Approved and saved on this browser.</strong>{approval.acceptedIssues.length>0&&<p>{approval.acceptedIssues.length} accepted issue{approval.acceptedIssues.length===1?' was':'s were'} recorded with this approval.</p>}<p>Find it in your design collection. Further edits require approval again.</p><Button disabled={!!busy} onClick={()=>window.location.assign('/templates/new')}>New template</Button></div>:<><Button disabled={!file||!!busy||compiling||rendering||mediaBusy||(outstanding.length>0&&!acceptIssues)} onClick={approveDesign}>{busy==='Approving and saving…'?'Approving and saving…':'Approve'}</Button><p className="help-text">Approve saves your design and any accepted issues on this browser. No sign-in needed.</p></>}
   </section>
   <Button variant="outline" disabled={!!busy||compiling||mediaBusy||!fit?.valid} onClick={()=>downloadDraft('proof')}>Download proof PDF</Button>
   <Button variant="outline" disabled={!!busy||compiling||mediaBusy||!fit?.valid||!!fit?.printIssues.length} onClick={()=>downloadDraft('print')}>Download print PDF</Button>
   <p className="help-text">Downloads and browser drafts do not need sign-in.</p>
  </fieldset></aside><section className="import-preview"><div className="import-preview-toolbar"><div><span className="eyebrow">{showingOriginal?'ORIGINAL / CURRENT COMPARISON':pdf?'GENERATED PDF':'SOURCE ARTWORK'}</span><p>{compiling||rendering?'Updating the PDF preview…':showingOriginal?'Original uploaded artwork':sourcePreview?'Source design · editable fields outlined':'Preview from the actual generated PDF'}</p></div><Button variant="outline" size="sm" disabled={!originalUpload} onClick={()=>setCompareOriginal(v=>!v)}>{compareOriginal?'Close comparison':'Compare original'}</Button><Button variant="outline" size="sm" aria-pressed={showFrames} onClick={()=>setShowFrames(v=>!v)}>{showFrames?'Hide frames':'Show frames'}</Button><span className="source-page-tag">Page {analysis.pageIndex+1}</span></div>
   {selectingQr&&<div className="notice"><p>Drag around the QR code, including its clear border.</p><Button variant="ghost" size="sm" onClick={()=>setSelectingQr(false)}>Cancel</Button></div>}
   {showingOriginal&&<div className="comparison-original"><h3>Original uploaded PDF · Page {analysis.pageIndex+1}</h3><PdfPreview data={originalUpload} pageIndex={analysis.pageIndex} label="Original uploaded PDF"/></div>}<div className="import-preview-stage"><h3>{showingOriginal?'Current design — compare with original above':'Current design'}</h3><PdfPreview data={!pdf?(analysis.preview??source):pdf} pageIndex={!pdf?analysis.pageIndex:0} runs={showFrames&&!selectingQr?(pdf?overlays?.runs:analysis.runs):[]} media={showFrames&&!selectingQr?(pdf?overlays?.media:analysis.media?.filter(s=>s.role!=='fixed')):[]} highlightedIds={reviewLocation?.page===analysis.pageIndex?reviewLocation.ids:[]} highlightPage={reviewLocation?.page===analysis.pageIndex&&!reviewLocation.ids.length} selected={selected} onSelect={id=>{setSelected(id);if(analysis.media?.some(s=>s.id===id)){setTab('correct');setCompareOriginal(true);setTimeout(()=>editorRoot.current?.querySelector(`[id="setup-${id}"]`)?.scrollIntoView({block:'nearest'}),0);return;}setTab('text');setTimeout(()=>editorRoot.current?.querySelector(`[id="content-${editorTemplate?.groups?.find(g=>g.fieldIds.includes(id))?.id}"]`)?.scrollIntoView({block:'nearest'}),0);}} selectionMode={selectingQr} onRegionSelected={addQrRegion} onThumbnail={sourcePreview?undefined:setThumbnail}/></div>
   <div className="import-preview-footer"><FileCheck2 size={19}/><p>{editorTemplate?.groups?.length??0} content groups · {analysis.media?.filter(s=>s.role!=='fixed').length??0} media fields</p></div>{analysis.warnings.length>0&&<details className="import-warnings"><summary>Review notes ({analysis.warnings.length})</summary>{analysis.warnings.map((warning,i)=><p key={i}>{warning}</p>)}</details>}
  </section></div>}
 </main></div>;
}
