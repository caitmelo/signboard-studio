# Signboard Studio

Source snapshot matching hosted version 47, source commit `2f259e515bd98da0b28053e29f0d0fac48e3b46c`.

- **signboard-studio-source.zip**: web and Python source, assets, fonts, tests and build scripts. Extract for development. Place the separately supplied Python ZIP at `public/downloads/signboard-studio-python.zip` to serve that download.
- **signboard-studio-python.zip**: packaged Python application and frontend with setup instructions.

Site: https://stone-edgewrap-studio.caitmelo.chatgpt.site/

Run `npm ci` before building the source snapshot. `npm run build` restores the pinned Ghostscript WebAssembly asset from its npm package; the large generated WASM file is excluded from the snapshot. The Python app requires system Ghostscript (installed by its Dockerfile).

## Feedback update

Version 47 adds column-constrained text wrapping, proportional text fitting, DL street-number styling, A5 paragraph repair, contact-field clipping/alignment fixes, auction-time handling and print finishing. Small-format downloads use PDF 1.3 with outlined fonts and flattened transparency; signs retain PDF 1.7.

Includes signboard border and corner-mark cleanup, 8x4 recognition, editable outlined For Sale headings, centered contact fields, tri-fold bullet grouping, current-text warnings and preview scroll preservation. Reimport original PDFs to apply import-time cleanup and grouping.

Edited-field regression checks passed across 14 pages in both rendering engines. Print conversion passed across all 8 documents. Source safe-margin warnings remain on two booklet pages; low-resolution source images and ambiguous sign sizes require review. See [QA-FEEDBACK.md](QA-FEEDBACK.md) for exact coverage and limitations. Package checksums are in [release-manifest.json](release-manifest.json).

This is a source snapshot, not automatic ongoing synchronization. The optional AI draft feature requires a server-side OPENAI_API_KEY; it was not configured on the hosted test site during this update.

## Secure AI-enabled replacement

`webdev-signboard-studio-ai/` contains the existing separate server-backed application. Its Upload your template flow supports browser-side PDF intake and field review; Create your own accepts PDFs, JPGs and PNGs for server-side recognition. Credentials stay server-side. Its live recognition test is opt-in with `RUN_LIVE_AI_TEST=true`. This directory is unchanged by the version 47 snapshot update.
