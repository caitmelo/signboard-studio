import {correctSafeText} from './safe-text';
import {contentGroups} from './content-groups';
import {inferTextAlignment} from './text-alignment';
import type { BleedInsets, PrintProduct, PrintSpec, SavedTemplate } from "./template-types";
import {resolveInstalledFonts} from './installed-fonts';

// Sprint Solutions, Sign & Print Specs 2026, pp. 1–4. Values here are FULL SIZE.
// Large-sign/pointer/banner bleed is specified at 25% on the sheet; multiply by 4.
// Small-format print and posters are supplied at 100%, per their page footnotes.
// The user's standing rule requires bleed on every print and two 5 mm squares on
// every signboard. Those squares are registration marks, not standard crop marks.
export const PRINT_PRODUCTS: { value: PrintProduct; label: string; signboard: boolean; safeText: number }[] = [
  { value: "letter", label: "Letter", signboard: false, safeText: 0 },
  { value: "edgewrap", label: "Edgewrap signboard", signboard: true, safeText: 0 },
  { value: "linea", label: "Linea signboard", signboard: true, safeText: 0 },
  { value: "bannerwrap", label: "Bannerwrap / illuminated signboard", signboard: true, safeText: 0 },
  { value: "pointer", label: "Pointer / corflute / A-frame sign", signboard: true, safeText: 0 },
  { value: "other_signboard", label: "Other signboard", signboard: true, safeText: 0 },
  { value: "brochure", label: "Brochure / booklet", signboard: false, safeText: 5 },
  { value: "mailcard", label: "Mailcard / card", signboard: false, safeText: 5 },
  { value: "business_card", label: "Business card", signboard: false, safeText: 5 },
  { value: "poster", label: "Poster / backlit poster", signboard: false, safeText: 0 },
  { value: "vinyl_banner", label: "Digital vinyl banner", signboard: false, safeText: 0 },
  { value: "other_print", label: "Other print product", signboard: false, safeText: 0 },
];

export const EDGEWRAP_SIZES: Record<string, [number, number, number]> = {
  "optima": [1000, 1500, 65], "3x4": [916, 1220, 65], "5x2.5": [750, 1500, 65],
  "6x1.5": [450, 1832, 65], "6x4": [1220, 1832, 65], "7x3.5": [1050, 2100, 65],
  "8x4": [1220, 2440, 65], "8x6": [1832, 2440, 95], "12x6": [1832, 3660, 95],
  "16x6": [1832, 4880, 95], "20x6": [1832, 6096, 95], "8x8": [2440, 2440, 95],
  "12x8": [2440, 3658, 95], "16x8": [2440, 4880, 95], "20x8": [2440, 6096, 95],
};
export const PAPER_SIZES: Record<string, [number, number]> = {
  a0: [841, 1189], a1: [594, 841], a2: [420, 594], a3: [297, 420], a4: [210, 297],
  a5: [148, 210], a6: [105, 148], dl: [99, 210], dlx: [120, 235],
};
const MM = 72 / 25.4;
const uniform = (value: number): BleedInsets => ({ top: value, bottom: value, left: value, right: value });
const sameSize = (width: number, height: number, short: number, long: number) => Math.abs(Math.min(width, height) - short) < 1 && Math.abs(Math.max(width, height) - long) < 1;

export function productProfile(spec: PrintSpec) {
  // Old manifests were exclusively authored with the Edgewrap renderer.
  return PRINT_PRODUCTS.find(p => p.value === (spec.product ?? "edgewrap")) ?? PRINT_PRODUCTS[PRINT_PRODUCTS.length - 1];
}
export function exportScale(spec:PrintSpec){return isSignboard(spec)?0.25:1;}
export function exportPercent(spec:PrintSpec){return exportScale(spec)*100;}
export function needsBleed(spec: PrintSpec) { return spec.product !== "letter"; }
export function isSignboard(spec: PrintSpec) { return productProfile(spec).signboard; }
export function bleedInsets(spec: PrintSpec): BleedInsets {
  if (!needsBleed(spec)) return uniform(0);
  const b = spec.bleedInsets;
  return b ? { top: b.top, bottom: b.bottom, left: b.left, right: b.right } : uniform(spec.bleed);
}
export function requiredBleed(spec: PrintSpec): number | undefined {
  const product = productProfile(spec).value;
  if (product === "letter") return 0;
  if (product === "edgewrap") return Object.values(EDGEWRAP_SIZES).find(([s, l]) => sameSize(spec.faceWidth, spec.faceHeight, s, l))?.[2];
  if (product === "linea") return 65;
  if (product === "bannerwrap") return 116;
  if (["pointer", "brochure", "mailcard", "business_card", "poster", "vinyl_banner"].includes(product)) return 2;
}
export function applyProduct(spec: PrintSpec, product: PrintProduct): PrintSpec {
  const next = { ...spec, product, productConfirmed: true };
  if (product === "letter") return {...next,bleed:0,bleedInsets:undefined,bleedConfirmed:true,sourceIncludesBleed:false,marks:false};
  const required = requiredBleed(next);
  return { ...next, marks: isSignboard(next), bleed: required ?? spec.bleed,
    bleedInsets: required === undefined ? spec.bleedInsets : undefined,
    bleedConfirmed: required !== undefined || (spec.product === product && !!spec.bleedConfirmed) };
}
export function sourceFrame(spec: PrintSpec) {
  const b = bleedInsets(spec);
  return { width: spec.faceWidth + (spec.sourceIncludesBleed ? b.left + b.right : 0), height: spec.faceHeight + (spec.sourceIncludesBleed ? b.top + b.bottom : 0) };
}
export function printGeometry(spec: PrintSpec) {
  const bleed = bleedInsets(spec), marks = isSignboard(spec);
  // A 2 mm bleed remains 2 mm. Extra media space accommodates 5 mm squares
  // outside the two bottom trim corners without clipping them or inflating bleed.
  const slug = { left: marks ? Math.max(0, 5 - bleed.left) : 0, right: marks ? Math.max(0, 5 - bleed.right) : 0,
    bottom: marks ? Math.max(0, 5 - bleed.bottom) : 0, top: 0 };
  const bleedWidth = spec.faceWidth + bleed.left + bleed.right, bleedHeight = spec.faceHeight + bleed.top + bleed.bottom;
  return { bleed, slug, marks, bleedWidth, bleedHeight, width: bleedWidth + slug.left + slug.right, height: bleedHeight + slug.bottom,
    trimX: slug.left + bleed.left, trimY: slug.bottom + bleed.bottom,
    offsetX: slug.left + (spec.sourceIncludesBleed ? 0 : bleed.left), offsetY: slug.bottom + (spec.sourceIncludesBleed ? 0 : bleed.bottom) };
}
export function bleedDescription(spec: PrintSpec) {
  if (!needsBleed(spec)) return "No bleed · letter";
  const b = bleedInsets(spec);
  return new Set(Object.values(b)).size === 1 ? `${b.top} mm bleed on every side` : `Bleed: top ${b.top}, bottom ${b.bottom}, left ${b.left}, right ${b.right} mm`;
}
export function printDescription(spec: PrintSpec) {
  const g = printGeometry(spec), round = (v: number) => Number(v.toFixed(2));
  return `${round(g.width)} × ${round(g.height)} mm sheet · ${bleedDescription(spec)}${g.marks ? " · Two 5 mm registration squares" : ""}`;
}

export function printRuleIssues(spec: PrintSpec): string[] {
  const issues: string[] = [], profile = productProfile(spec), expected = requiredBleed(spec), b = bleedInsets(spec);
  if ((spec.product && !PRINT_PRODUCTS.some(p => p.value === spec.product)) || spec.productConfirmed === false) issues.push("Choose the print product in Print size so the correct Sprint bleed rule is applied.");
  if (Object.values(b).some(v => !Number.isFinite(v) || (needsBleed(spec) ? v <= 0 : v < 0) || v > 300)) issues.push("Every print design requires positive bleed on all four sides.");
  if (expected !== undefined && Object.values(b).some(v => Math.abs(v - expected) > .01)) issues.push(`${profile.label} requires ${expected} mm bleed on every side at full size under the Sprint specs. Reopen Print size to apply the product preset.`);
  if (expected === undefined && !spec.bleedConfirmed) issues.push("Confirm the printer’s bleed measurements in Print size for this product and face size. A standard Edgewrap bleed cannot be assumed.");
  if (needsBleed(spec) && !spec.sourceIncludesBleed) issues.push("The source artwork has no confirmed bleed. Every print design needs artwork extending through its required bleed; an empty margin is not print-ready. Supply the design with bleed before print export.");
  if (spec.sizeWarning && !spec.sizeConfirmed) issues.push(spec.sizeWarning);
  return issues;
}

function inferProduct(fileName: string): { product: PrintProduct; confirmed: boolean } {
  const n = fileName.toLowerCase().replace(/[_-]+/g," ");
  if (/\bletters?\b|letterhead/.test(n)) return { product: "letter", confirmed: true };
  if (/bannerwrap|illuminated/.test(n)) return { product: "bannerwrap", confirmed: true };
  if (/linea/.test(n)) return { product: "linea", confirmed: true };
  if (/pointer|corflute|a[ -]?frame|lawnspike|signholder|endurosign/.test(n)) return { product: "pointer", confirmed: true };
  if (/quatro|quarto|trifecta|pull[ -]?up|sticker/.test(n)) return { product: "other_print", confirmed: false };
  if (/business[ _-]?card/.test(n)) return { product: "business_card", confirmed: true };
  if (/brochure|booklet/.test(n)) return { product: "brochure", confirmed: true };
  if (/mail[ _-]?card|post[ _-]?card|\bcard\b|\bdlx?\b/.test(n)) return { product: "mailcard", confirmed: true };
  if (/\ba[0-6]\b.*double\s*sided/.test(n)) return {product:"brochure",confirmed:true};
  if (/poster|backlit/.test(n)) return { product: "poster", confirmed: true };
  if (/vinyl[ _-]?banner/.test(n)) return { product: "vinyl_banner", confirmed: true };
  if (/edgewrap/.test(n)) return { product: "edgewrap", confirmed: true };
  if (/sign[ _-]?board/.test(n)) return { product: "edgewrap", confirmed: true };
  const size = n.match(/(?:^|[^\d])(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?!\d)/);
  if (size && (EDGEWRAP_SIZES[`${+size[1]}x${+size[2]}`] || EDGEWRAP_SIZES[`${+size[2]}x${+size[1]}`])) return { product: "edgewrap", confirmed: true };
  return { product: "other_print", confirmed: false };
}

export function normalizeSavedTemplate(template: SavedTemplate): SavedTemplate {
  if(template.pages)template={...template,pages:template.pages.map(normalizeSavedTemplate)};
  if(template.pages?.some(p=>p.safeTextCorrected))template={...template,safeTextCorrected:true};
  if(template.defaults?.text){const keys=new Set(template.fields.flatMap(f=>[f.id,...(f.role.startsWith('agent')?[f.role]:[])]));template={...template,defaults:{...template.defaults,text:Object.fromEntries(Object.entries(template.defaults.text).filter(([key])=>keys.has(key)))}};}
  if(isSignboard(template.spec)&&template.media){const area=template.sourceWidth*template.sourceHeight;template={...template,media:template.media.map(s=>{const backing=s.width*s.height>area*.9&&template.media!.some(other=>other.id!==s.id&&other.role==='image'&&other.width*other.height>area*.04);return s.locked||backing?{...s,locked:true,role:'fixed' as const,assetKind:'artwork' as const,issue:'Background artwork is locked to prevent accidental replacement.'}:s;})};}
  if(template.pages)template={...template,media:template.pages.flatMap(p=>p.media??[])};
  template=resolveInstalledFonts(template);
  if(!template.pages)template={...template,groups:contentGroups(template)};
  template={...template,fields:inferTextAlignment(template.fields,template.sourceWidth).map(f=>!f.align&&f.clip&&f.x-f.clip[0]>f.size*.5&&Math.abs(f.x+f.width-f.clip[2])<.2?{...f,align:"right" as const}:f)};
  if(template.review?.status==="proof")template={...template,printIssues:[...new Set([...template.printIssues,"This template version is saved for proofs. Correct its outstanding issues and approve a new version before print export."])]};
  if (template.spec.product) {
    if(template.pages)return template;
    const scale=sourceFrame(template.spec).width*MM/template.sourceWidth,b=bleedInsets(template.spec),left=template.spec.sourceIncludesBleed?b.left*MM/scale:0,bottom=template.spec.sourceIncludesBleed?b.bottom*MM/scale:0;
    return correctSafeText(template,productProfile(template.spec).safeText*MM/scale,[left,bottom,left+template.spec.faceWidth*MM/scale,bottom+template.spec.faceHeight*MM/scale]);
  }
  const inferred = inferProduct(template.sourceName);
  // Keep saved coordinates/bleed intact. New rules flag incompatible old presets
  // rather than silently changing the scale of previously approved artwork.
  return { ...template, spec: { ...template.spec, product: inferred.product, productConfirmed: inferred.confirmed } };
}

export function suggestPrintSpec(fileName: string, width: number, height: number, trim?: { x: number; y: number; width: number; height: number }): { spec: PrintSpec; size: string | null; warning?: string } {
  const inferred = inferProduct(fileName), product = inferred.product;
  const match = fileName.match(/(?:^|[^\d])(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)(?!\d)/i);
  const key = match ? `${+match[1]}x${+match[2]}` : /optima/i.test(fileName) ? "optima" : null;
  const preset = key ? EDGEWRAP_SIZES[key] ?? (match ? EDGEWRAP_SIZES[`${+match[2]}x${+match[1]}`] : undefined) : undefined;
  const initial: PrintSpec = { faceWidth: width / MM, faceHeight: height / MM, bleed: 2, marks: false, sourceIncludesBleed: false, product, productConfirmed: inferred.confirmed };
  const finish = (spec: PrintSpec, warning?: string) => ({ spec: { ...spec, marks: isSignboard(spec), bleedConfirmed: requiredBleed(spec) !== undefined }, size: key, warning });
  const centredTrim = trim && trim.x > 0 && trim.y > 0 && Math.abs((width - trim.width) / 2 - trim.x) < .2 && Math.abs((height - trim.height) / 2 - trim.y) < .2;
  if (centredTrim && ["edgewrap", "linea", "bannerwrap"].includes(product)) {
    const candidates = Object.entries(product === "linea" ? { "6x2": [600, 1830, 65] } : EDGEWRAP_SIZES).map(([label, [short, long, defaultBleed]]) => {
      const faceWidth = trim.width >= trim.height ? long : short, faceHeight = trim.width >= trim.height ? short : long, bleed = product === "bannerwrap" ? 116 : defaultBleed;
      const scale = faceWidth * MM / trim.width;
      return { label, faceWidth, faceHeight, bleed, error: Math.abs(faceHeight * MM / trim.height / scale - 1) + Math.abs(trim.x * scale / MM / bleed - 1) + Math.abs(trim.y * scale / MM / bleed - 1) };
    }).sort((a, b) => a.error - b.error);
    const best = candidates[0];
    if (best?.error < .01) {
      const agrees = product === "linea" ? key === "6x2" : preset && sameSize(best.faceWidth, best.faceHeight, preset[0], preset[1]);
      const sizeWarning = key && !agrees ? `The filename says ${key.replace("x", " × ")}, but the PDF face and bleed match ${best.label.replace("x", " × ")} (${best.faceWidth} × ${best.faceHeight} mm). Editing keeps the PDF proportions. Confirm the intended size before print export.` : undefined;
      return finish({ ...initial, faceWidth: best.faceWidth, faceHeight: best.faceHeight, bleed: best.bleed, sourceIncludesBleed: true, sizeWarning, sizeConfirmed: !sizeWarning });
    }
  }
  let dimensions: [number, number] | undefined;
  if (isSignboard(initial) && preset) dimensions = [preset[0], preset[1]];
  if (product === "linea" && key === "6x2") dimensions = [600, 1830];
  if (product === "bannerwrap" && key === "6x2") dimensions = [610, 1832];
  if (product === "bannerwrap" && key === "6x3") dimensions = [916, 1832];
  const paper = fileName.match(/(?:^|[^a-z0-9])(a[0-6]|dlx?)(?=[^a-z0-9]|$)/i)?.[1].toLowerCase();
  if (!isSignboard(initial) && paper) dimensions = PAPER_SIZES[paper];
  if (product === "business_card") dimensions = [55, 90];
  let warning: string | undefined;
  if (!dimensions && match) {
    const a = +match[1], b = +match[2];
    const feet = isSignboard(initial) && a < 50 && b < 50;
    if (feet || (a >= 50 && b >= 50)) { dimensions = [Math.min(a, b) * (feet ? 304.8 : 1), Math.max(a, b) * (feet ? 304.8 : 1)]; if (feet) warning = "The filename size was converted from feet. Confirm the exact face dimensions and bleed against the printer’s specification."; }
  }
  const spec = { ...initial };
  if (dimensions) { spec.faceWidth = width <= height ? dimensions[0] : dimensions[1]; spec.faceHeight = width <= height ? dimensions[1] : dimensions[0]; }
  else if (centredTrim) { spec.faceWidth = trim.width / MM; spec.faceHeight = trim.height / MM; }
  if (product === "letter") return finish({...spec,bleed:0,sourceIncludesBleed:false});
  spec.bleed = requiredBleed(spec) ?? (product === "edgewrap" ? 65 : 2);
  const b = spec.bleed;
  const ratio = width / height, faceRatio = spec.faceWidth / spec.faceHeight, bleedRatio = (spec.faceWidth + 2 * b) / (spec.faceHeight + 2 * b);
  // A square page's ratio cannot establish that it contains bleed. Require a
  // TrimBox or exact full-size dimensions in that case.
  const trimScale = centredTrim ? spec.faceWidth * MM / trim!.width : 0;
  const trimMatches = centredTrim && Math.abs(trim!.x * trimScale / MM - b) < .05 && Math.abs(trim!.y * trimScale / MM - b) < .05;
  const exactBleedPage = Math.abs(width / MM - spec.faceWidth - 2 * b) < .05 && Math.abs(height / MM - spec.faceHeight - 2 * b) < .05;
  spec.sourceIncludesBleed = !!trimMatches || exactBleedPage || (!!dimensions && Math.abs(faceRatio - bleedRatio) > .00001 && Math.abs(ratio / bleedRatio - 1) < .003 && Math.abs(ratio - bleedRatio) < Math.abs(ratio - faceRatio));
  if (warning) { spec.sizeWarning = warning; spec.sizeConfirmed = false; }
  return finish(spec);
}
