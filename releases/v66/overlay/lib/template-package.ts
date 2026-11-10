export const PACKAGE_FILE_LIMIT=32*1024*1024,PACKAGE_TOTAL_LIMIT=200*1024*1024,PACKAGE_COUNT_LIMIT=400;
export type PackageKind='indd'|'idml'|'pdf'|'font'|'image'|'other';
export type PackageFile={id:string;path:string;size:number;modified:number;kind:PackageKind};
export type PackageRecord={id:string;name:string;ready:boolean;files:PackageFile[]};
export function packageKind(path:string):PackageKind{const ext=path.split('.').pop()?.toLowerCase();return ext==='indd'?'indd':ext==='idml'?'idml':ext==='pdf'?'pdf':['otf','ttf','woff','woff2'].includes(ext??'')?'font':['png','jpg','jpeg','tif','tiff','eps','ai','psd','svg','webp'].includes(ext??'')?'image':'other';}
export function safePackagePath(path:string){const p=path.replace(/\\/g,'/').normalize('NFC');if(!p||p.length>500||p.startsWith('/')||p.split('/').some(x=>!x||x==='.'||x==='..')||/[\x00-\x1f\x7f]/.test(p)||/^[a-z]:/i.test(p))throw Error('A file has an unsafe folder path.');return p;}
export function ignoredPackagePath(path:string){return path.split('/').some(p=>p==='__MACOSX'||p==='.DS_Store'||p.startsWith('._'));}
export function packageStem(path:string){return path.split('/').pop()!.replace(/\.[^.]+$/,'').toLowerCase();}
export function packageState(files:Pick<PackageFile,'kind'>[]){return files.some(f=>f.kind==='pdf')?'PDF available':files.some(f=>f.kind==='idml')?'IDML available':files.some(f=>f.kind==='indd')?'Needs IDML or PDF':'Needs a design file';}
