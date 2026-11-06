export type ThumbnailFrame = {sheetWidth:number;sheetHeight:number;x:number;y:number;width:number;height:number};

/** Crop only a known print-sheet thumbnail. Never guess from white pixels:
 * white artwork and internal margins belong to the customer's design. */
export function thumbnailCrop(width:number,height:number,frame:ThumbnailFrame){
 const {sheetWidth, sheetHeight,x,y,width:w,height:h}=frame;
 if(![width,height,sheetWidth,sheetHeight,w,h].every(v=>Number.isFinite(v)&&v>0)||
   ![x,y].every(v=>Number.isFinite(v)&&v>=0)||x+w>sheetWidth+.01||y+h>sheetHeight+.01)return null;
 // Allow thumbnail pixel rounding, but not a different page or a face-only image.
 if(Math.abs(width/height-sheetWidth/sheetHeight)>2/height)return null;
 return {x:x/sheetWidth*width,y:(sheetHeight-y-h)/sheetHeight*height,width:w/sheetWidth*width,height:h/sheetHeight*height};
}
