"use client";
import {FileCheck2} from "lucide-react";
import {Input} from "@/components/ui/input";
import {Button} from "@/components/ui/button";
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from "@/components/ui/select";
import {Switch} from "@/components/ui/switch";
import {EDGEWRAP_SIZES,applyEdgewrapPreset,edgewrapPresetKey,exportScale,PRINT_PRODUCTS,needsBleed,applyProduct,bleedInsets,isSignboard,printDescription,printGeometry,productProfile,requiredBleed} from "@/lib/print-specs";
import type {PrintProduct,PrintSpec} from "@/lib/template-types";

export function PrintSettings({spec,busy,onChange}:{spec:PrintSpec;busy:boolean;onChange:(spec:PrintSpec)=>void}){
 const required=requiredBleed(spec),profile=productProfile(spec),geometry=printGeometry(spec);
 return <>
  <div className="size-note"><FileCheck2 size={20}/><p>Sprint print rules · all measurements below are at full size.</p></div>
  <label className="control-label" htmlFor="print-product">Print product</label>
  <Select value={spec.productConfirmed===false?'':profile.value} disabled={busy} onValueChange={value=>onChange(applyProduct(spec,value as PrintProduct))}>
   <SelectTrigger id="print-product"><SelectValue placeholder="Choose the print product"/></SelectTrigger><SelectContent>{PRINT_PRODUCTS.map(p=><SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}</SelectContent>
  </Select>
  {profile.value==='edgewrap'&&<>
   <label className="control-label" htmlFor="sprint-size">Sprint Edgewrap product size</label>
   <select id="sprint-size" disabled={busy} value={edgewrapPresetKey(spec)} onChange={e=>onChange(applyEdgewrapPreset(spec,e.target.value))}>
    <option value="">Choose a Sprint product size</option>
    {Object.keys(EDGEWRAP_SIZES).map(key=><option key={key} value={key}>{key} Edgewrap</option>)}
   </select>
   <Button variant="outline" disabled={busy} onClick={()=>onChange({...spec,faceWidth:spec.faceHeight,faceHeight:spec.faceWidth})}>Swap portrait / landscape</Button>
   <p className="help-text">25% artwork: {spec.faceWidth*.25} × {spec.faceHeight*.25} mm. Wrap: {spec.bleed*.25} mm each side. Final PDF: {geometry.width*exportScale(spec)} × {geometry.height*exportScale(spec)} mm. These measurements are already scaled.</p>
   {edgewrapPresetKey(spec)==='6x4'&&<p className="help-text">Sprint’s 6×4 Edgewrap email specifies a 15 mm safe text inset on the 25% artwork (60 mm at full size). Keep text inside that area.</p>}
  </>}
  {required!==undefined&&Object.values(bleedInsets(spec)).some(value=>Math.abs(value-required)>.01)&&<Button variant="outline" disabled={busy} onClick={()=>onChange(applyProduct(spec,profile.value))}>Apply Sprint {required} mm bleed</Button>}
  <p className="help-text">{needsBleed(spec)?'Bleed is required for this category.':'Letters do not require bleed or registration marks.'}{!needsBleed(spec)?'':isSignboard(spec)?' This signboard also requires two red 5 × 5 mm registration squares. They are added automatically.':' This product uses the Sprint rule for print without crop marks.'}{profile.safeText?` Keep text at least ${profile.safeText} mm inside the face.`:''}</p>
  {spec.sizeWarning&&<><div className="notice warning"><p>{spec.sizeWarning}</p></div><label className="toggle-row"><Switch checked={!!spec.sizeConfirmed} disabled={busy} onCheckedChange={value=>onChange({...spec,sizeConfirmed:value})}/><span>I confirm {spec.faceWidth} × {spec.faceHeight} mm is the intended face size</span></label></>}
  <div className="dimension-inputs">{(['faceWidth','faceHeight']as const).map(key=><div key={key}><label className="control-label" htmlFor={key}>{key==='faceWidth'?'Face width':'Face height'}</label><div className="unit-input"><Input id={key} type="number" min={50} max={15000} step="0.1" value={Number(spec[key].toFixed(3))} disabled={busy} onChange={e=>onChange(applyProduct({...spec,[key]:Number(e.target.value),sizeConfirmed:spec.sizeWarning?false:spec.sizeConfirmed},profile.value))}/><span>mm</span></div></div>)}</div>
  {needsBleed(spec)&&<>
  {!spec.bleedInsets&&<><label className="control-label" htmlFor="bleed">Required bleed on every side</label><div className="unit-input"><Input id="bleed" type="number" min={0.1} max={300} step="0.1" value={spec.bleed} disabled={busy||required!==undefined} onChange={e=>onChange({...spec,bleed:Number(e.target.value),bleedConfirmed:false})}/><span>mm</span></div></>}
  {required!==undefined?<p className="help-text">The {required} mm bleed is set from the Sprint specification for this product and size.</p>:<>
   <p className="help-text">This product or size needs its own confirmed bleed measurements. Use the printer’s specification.</p>
   <label className="toggle-row"><Switch checked={!!spec.bleedInsets} disabled={busy} onCheckedChange={value=>onChange({...spec,bleedInsets:value?bleedInsets(spec):undefined,bleedConfirmed:false})}/><span>Different bleed on each side</span></label>
   {spec.bleedInsets&&<div className="dimension-inputs">{(['top','bottom','left','right']as const).map(side=><div key={side}><label className="control-label" htmlFor={`bleed-${side}`}>Bleed {side}</label><div className="unit-input"><Input id={`bleed-${side}`} type="number" min={0.1} max={300} step="0.1" value={spec.bleedInsets![side]} disabled={busy} onChange={e=>onChange({...spec,bleedInsets:{...bleedInsets(spec),[side]:Number(e.target.value)},bleedConfirmed:false})}/><span>mm</span></div></div>)}</div>}
   <label className="toggle-row"><Switch checked={!!spec.bleedConfirmed} disabled={busy} onCheckedChange={value=>onChange({...spec,bleedConfirmed:value})}/><span>These bleed measurements match the printer’s specification</span></label>
  </>}
  <label className="toggle-row"><Switch checked={spec.sourceIncludesBleed} disabled={busy} onCheckedChange={value=>onChange({...spec,sourceIncludesBleed:value})}/><span>The source artwork already extends through this bleed</span></label>
  <p className="help-text">This confirms what is in your source PDF. Artwork without bleed can be edited and saved as a proof; print export needs artwork covering the full bleed.</p>
  </>}
  <p className="help-text">{printDescription(spec)}.{(geometry.slug.left||geometry.slug.right||geometry.slug.bottom)>0?' Extra sheet space holds the registration squares; the specified bleed and face dimensions stay exact.':''}</p>
 </>;
}
