import {bleedInsets,exportScale,sourceFrame} from './print-specs';
import type {PrintSpec} from './template-types';
const MM=72/25.4;
export function keepUploadedSize(spec:PrintSpec,width:number,height:number):PrintSpec{
 const b=bleedInsets(spec),factor=exportScale(spec);
 return {...spec,fitToProduct:false,resizeMode:undefined,sizeName:'custom',sizeWarning:undefined,sizeConfirmed:true,faceWidth:width/MM/factor-(spec.sourceIncludesBleed?b.left+b.right:0),faceHeight:height/MM/factor-(spec.sourceIncludesBleed?b.top+b.bottom:0)};
}
export function sourcePlacement(spec:PrintSpec,width:number,height:number){
 const f=sourceFrame(spec),scale=spec.fitToProduct?Math.min(f.width*MM/width,f.height*MM/height):f.width*MM/width;
 return {scale,x:spec.fitToProduct?(f.width*MM-width*scale)/2:0,y:spec.fitToProduct?(f.height*MM-height*scale)/2:0};
}
