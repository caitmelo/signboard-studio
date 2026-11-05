# Stone Studio v59

Adds optional crop marks outside bleed for paper print downloads. Marks are off by default to match the supplied Sprint sheet. Finished dimensions and artwork scale remain unchanged.

Fixes a false signboard colour warning caused by named CMYK gradient pattern spaces. Recheck print readiness validates stored artwork and clears stale colour notes only when colour, text, media and bleed checks pass. Unconfirmed dimensions and missing bleed remain blocked; the editor links directly to review settings.

Validation: typecheck, build, two-page crop geometry/PDF 1.3, proof/print modes, signboard CMYK gradients and stale-review checks pass. Actual 25% signboard print export passed at confirmed 1220 x 1832 mm finished size. Missing phone icons were not reproduced from the supplied source; gold ring colour remains under investigation pending latest output PDFs.

Assemble with `python releases/v59/prepare_source.py`. The cumulative overlay excludes credentials, private uploaded fonts and customer PDF fixtures.
