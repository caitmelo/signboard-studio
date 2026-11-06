import type {TextRun} from './template-types';

/** Infer alignment only from geometric evidence; retain the source frame. */
export function inferTextAlignment(fields:TextRun[],pageWidth:number):TextRun[]{
 const centre=(f:TextRun)=>f.x+f.width/2;
 return fields.map(f=>{
  const card=f.role.match(/^(agent[12])_(name|phone|email)$/);
  if(card){
   const name=fields.find(r=>r.role===`${card[1]}_name`),phone=fields.find(r=>r.role===`${card[1]}_phone`);
   // Same-row contact cards use a left name/email and a right phone anchor.
   if(name&&phone&&Math.abs(name.y-phone.y)<Math.min(name.size,phone.size)*.3){
    if(card[2]==='phone')return {...f,align:'left',flowAfter:name.id};
    if(card[2]==='name'||Math.abs(f.x-name.x)<f.size*.5)return {...f,align:'left'};
   }
  }
  // Email may have been classified as agency/custom by an older importer.
  // Compare with the local stacked contact column, not the page centre.
  if(f.text.includes('@')){
   const peer=fields.filter(r=>/agent[12]_(name|phone)/.test(r.role)&&r.y>f.y&&r.y-f.y<f.size*4&&Math.abs(centre(r)-centre(f))<Math.max(1,f.size*.12)).sort((a,b)=>a.y-b.y)[0];
   if(peer&&Math.abs(peer.x-f.x)>.4)return {...f,align:'center'};
  }
  if(f.align)return f;
  const tolerance=Math.max(.4,f.size*.12);
  if(f.outlined&&Math.abs(centre(f)-pageWidth/2)<tolerance)return {...f,align:'center'};
  const pair=f.role.match(/^(agent[12])_(name|phone)$/);
  const peer=pair?fields.find(r=>r.role===`${pair[1]}_${pair[2]==='name'?'phone':'name'}`):undefined;
  // Equal left edges indicate a left-aligned card, even when widths are close.
  if(peer&&Math.abs(f.y-peer.y)>f.size*.5&&Math.abs(centre(f)-centre(peer))<tolerance&&Math.abs(f.x-peer.x)>Math.max(.4,Math.min(f.size,peer.size)*.03))
   return {...f,align:'center'};
  // Standalone centred contact lines, with no competing text in the row.
  if(/@|(?:[a-z0-9-]+\.)+(?:com|au|net|org)\b/i.test(f.text)&&Math.abs(centre(f)-pageWidth/2)<tolerance&&
    !fields.some(r=>r.id!==f.id&&Math.abs(r.y-f.y)<f.size*.6))return {...f,align:'center'};
  if(f.clip&&f.x-f.clip[0]>f.size*.5){
   if(Math.abs(centre(f)-(f.clip[0]+f.clip[2])/2)<tolerance)return {...f,align:'center'};
   if(Math.abs(f.x+f.width-f.clip[2])<.2)return {...f,align:'right'};
  }
  return f;
 });
}
