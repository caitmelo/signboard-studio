import type {MediaSlot} from './template-types';
export function isBackgroundArtwork(slot:MediaSlot,others:MediaSlot[],width:number,height:number){
 const area=width*height;
 if(slot.width*slot.height<=area*.5)return false;
 return others.some(s=>s.id!==slot.id&&s.role==='image'&&s.width*s.height>area*.025&&s.width*s.height<slot.width*slot.height*.3&&s.x>=slot.x-1&&s.y>=slot.y-1&&s.x+s.width<=slot.x+slot.width+1&&s.y+s.height<=slot.y+slot.height+1);
}
