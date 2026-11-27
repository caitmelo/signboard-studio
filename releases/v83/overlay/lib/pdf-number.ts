/** PDF content-stream numbers cannot use JavaScript exponential notation. */
export function pdfNumber(value:number):string{
 if(!Number.isFinite(value)||Math.abs(value)>=1e21)throw Error('Invalid PDF coordinate.');
 const fixed=value.toFixed(7).replace(/\.?0+$/,'');
 return fixed===''||fixed==='-0'?'0':fixed;
}
