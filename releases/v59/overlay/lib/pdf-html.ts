/** Standalone, script-free visual HTML export of the exact downloadable PDF. */
export type HtmlPage={widthPt:number;heightPt:number;image:string};
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const dimension=(value:number)=>{if(!Number.isFinite(value)||value<=0)throw Error('The PDF contains an invalid page size.');return Number(value.toFixed(5));};
export function htmlFromPdfPages(pages:HtmlPage[],title:string){
 if(!pages.length)throw Error('The PDF has no pages to export.');
 const sizes=pages.map(p=>({w:dimension(p.widthPt),h:dimension(p.heightPt)}));
 for(const p of pages)if(!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(p.image))throw Error('A PDF page could not be rendered.');
 return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light"><title>${escape(title)}</title>
<style>
*{box-sizing:border-box}html,body{margin:0;padding:0}body{background:#e9edf0}main{display:block}.pdf-page{position:relative;margin:16px auto;background:#fff;overflow:hidden;break-inside:avoid;page-break-inside:avoid}.pdf-page img{display:block;width:100%;height:100%;max-width:none}
${sizes.map((s,i)=>`@page pdf${i+1}{size:${s.w}pt ${s.h}pt;margin:0}.page-${i+1}{page:pdf${i+1};width:${s.w}pt;height:${s.h}pt}`).join('\n')}
@media screen{.pdf-page{max-width:100%;height:auto}.pdf-page img{height:auto}}
@media print{html,body{background:#fff}.pdf-page{margin:0;break-after:page;page-break-after:always;print-color-adjust:exact;-webkit-print-color-adjust:exact}.pdf-page:last-child{break-after:auto;page-break-after:auto}}
</style></head><body><main aria-label="${escape(title)}">
${pages.map((p,i)=>`<section class="pdf-page page-${i+1}" aria-label="Page ${i+1} of ${pages.length}"><img alt="${escape(title)} — page ${i+1} of ${pages.length}" src="${p.image}"></section>`).join('\n')}
</main></body></html>`;
}

export async function pdfToHtml(data:Uint8Array,title:string,onProgress?:(page:number,total:number)=>void){
 const url='/pdfjs/pdf.mjs';
 const pdfjs=await import(/* @vite-ignore */ url);
 pdfjs.GlobalWorkerOptions.workerSrc='/pdfjs/pdf.worker.mjs';
 const loading=pdfjs.getDocument({data:data.slice(),useWasm:true,useWorkerFetch:true,wasmUrl:'/pdfjs/wasm/',iccUrl:'/template/colour/',standardFontDataUrl:'/pdfjs/standard_fonts/',isEvalSupported:false});
 try{return await renderPdfDocumentHtml(await loading.promise,title,()=>document.createElement('canvas'),onProgress);}finally{await loading.destroy();}
}

/** Kept separate so the downloaded document is regression-tested with PDF.js. */
export async function renderPdfDocumentHtml(pdf:any,title:string,createCanvas:()=>HTMLCanvasElement,onProgress?:(page:number,total:number)=>void){
 const pages:HtmlPage[]=[];
 for(let index=1;index<=pdf.numPages;index++){
  onProgress?.(index,pdf.numPages);
  const page=await pdf.getPage(index),natural=page.getViewport({scale:1});
  // 200 dpi for office output, bounded per page for large-format documents.
  const scale=Math.min(200/72,6000/Math.max(natural.width,natural.height),Math.sqrt(16000000/(natural.width*natural.height)));
  const viewport=page.getViewport({scale}),canvas=createCanvas();
  canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
  try{await page.render({canvas,canvasContext:canvas.getContext('2d'),viewport,background:'#ffffff'}).promise;
   pages.push({widthPt:natural.width,heightPt:natural.height,image:canvas.toDataURL('image/png')});
  }finally{canvas.width=0;canvas.height=0;page.cleanup();}
 }
 return htmlFromPdfPages(pages,title);
}
