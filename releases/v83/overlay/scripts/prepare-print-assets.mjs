import {mkdir,copyFile} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
await mkdir(new URL('public/print/',root),{recursive:true});
for(const name of ['gs.js','gs.wasm','LICENSE'])await copyFile(new URL('node_modules/@jspawn/ghostscript-wasm/'+name,root),new URL('public/print/'+name,root));

// Ship a browser URL explicitly: server bundlers may preserve import.meta.url as file://.
const {build}=await import('esbuild');
await build({entryPoints:[new URL('lib/image-preparation.worker.ts',root).pathname],outfile:new URL('public/workers/image-preparation.js',root).pathname,bundle:true,external:['module'],platform:'browser',format:'esm',target:'es2022'});
