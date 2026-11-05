/** Suggest a readable name without changing the source filename or print preset. */
export function templateName(fileName:string){
 const clean=fileName.replace(/\.pdf$/i,'').replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
 const tokens=clean.replace(/[-]+/g,' ');
 const brand=/\btag(?:\s+re)?\b/i.test(tokens)?'TAG RE':/\bstone\b/i.test(tokens)?'Stone':'';
 const kind=/\bmail\s*card\b|\bpost\s*card\b/i.test(tokens)?'mailcard':/\bbrochure\b|\bbooklet\b/i.test(tokens)?'brochure':/\bedgewrap\b|\bsign\s*board\b/i.test(tokens)?'signboard':'';
 if(!kind)return clean;
 const status=/\blisted\b/i.test(tokens)?'Listed':/\bsold\b/i.test(tokens)?'Sold':'';
 // Only simplify identifiable branded files; keep unknown names and their context.
 if(!brand)return clean;
 return `${brand} · ${status?status+' ':''}${kind}`;
}

export function stepError(step:string,error:unknown){
 const detail=error instanceof Error?error.message:'Please try again.';
 return `${step} failed: ${detail}`;
}
