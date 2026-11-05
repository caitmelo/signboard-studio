// Only font family/style metadata is sent to Google; artwork and user text stay local.
export function fontRequest(name:string){
 const clean=name.replace(/^[A-Z]{6}\+/,'');
 const match=clean.match(/(?:[-, ]?)(ExtraLight|UltraLight|SemiBold|DemiBold|ExtraBold|UltraBold|Regular|Roman|Normal|Medium|Black|Heavy|Light|Thin|Bold|Bd)?(Italic|Oblique)?$/i);
 let family=clean.slice(0,match?.index??clean.length).replace(/[-, ]+$/,'');if(!family)family=clean;
 family=family.replace(/([a-z0-9])([A-Z])/g,'$1 $2').replace(/([A-Z])([A-Z][a-z])/g,'$1 $2');
 const weights:Record<string,number>={thin:100,extralight:200,ultralight:200,light:300,regular:400,roman:400,bd:700,normal:400,medium:500,semibold:600,demibold:600,bold:700,extrabold:800,ultrabold:800,black:900,heavy:900};
 return {family,weight:weights[match?.[1]?.toLowerCase()??'regular']??400,italic:!!match?.[2]};
}
export function embeddedOnlyFont(family:string){return /helvetica|eos[ -]?icons|sign[ -]?painter|house[ -]?script/i.test(family);}
export async function fetchGoogleFont(family:string,weight:number,italic:boolean){
 if(!/^[A-Za-z0-9][A-Za-z0-9 -]{0,99}$/.test(family)||![100,200,300,400,500,600,700,800,900].includes(weight))throw new Error('Invalid font request');
 if(embeddedOnlyFont(family))return null;
 const cssURL=new URL('https://fonts.googleapis.com/css');cssURL.searchParams.set('family',`${family}:${weight}${italic?'italic':''}`);
 const cssResponse=await fetch(cssURL,{headers:{'User-Agent':'SignboardStudio/1.0'},redirect:'manual',signal:AbortSignal.timeout(15000)});
 if(cssResponse.status===400||cssResponse.status===404)return null;if(!cssResponse.ok)throw new Error('Font provider unavailable');
 const css=await cssResponse.text();if(css.length>100000)throw new Error('Font stylesheet too large');
 const urls=[...new Set([...css.matchAll(/url\((https:\/\/fonts\.gstatic\.com\/[^)\s]+)\)/g)].map(m=>m[1]))];if(!urls.length||urls.length>16)return null;
 const files:string[]=[];let total=0;
 for(const url of urls){const u=new URL(url);if(u.hostname!=='fonts.gstatic.com'||u.protocol!=='https:')throw new Error('Invalid font source');const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(15000)});if(!r.ok)throw new Error('Font download unavailable');if(Number(r.headers.get('content-length'))>8*1024*1024)throw new Error('Font file too large');const bytes=new Uint8Array(await r.arrayBuffer());total+=bytes.length;if(total>16*1024*1024)throw new Error('Font family too large');let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));files.push(btoa(binary));}
 return {provider:'Google Fonts',files};
}
