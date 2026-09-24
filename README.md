# Signboard Studio

## Latest: version 50 builder fixes

Use [the version 50 developer handoff](releases/v50/README.md). It includes all six changed source files and `python3 releases/v50/prepare_source.py`, which assembles a complete updated source ZIP from the checked-in v49 base. Automated checks passed; fresh visual testing of both scan reconstructions is still pending.

The root ZIPs below remain the v49 base packages. Do not use those alone when handing off the v50 builder fixes.

## Developer handoff: template generator only

Start with [GENERATOR-HANDOFF.md](GENERATOR-HANDOFF.md). The requested delivery is the existing-PDF import/edit/print generator; the blank-canvas **Create your own** builder is excluded from the integration scope. The ZIPs remain the tested full Studio packages, so the developer must exclude builder UI/routes when integrating. This is not a separately built generator-only release.

Source snapshot matching hosted version 49, source commit `bbadbc4324d03e0cd282c6fe1d914463bc709764`.

- **signboard-studio-source.zip**: web and Python source, assets, fonts, tests and build scripts. Extract for development. Place the separately supplied Python ZIP at `public/downloads/signboard-studio-python.zip` to serve that download.
- **signboard-studio-python.zip**: packaged Python application and frontend with setup instructions.

Site: https://stone-edgewrap-studio.caitmelo.chatgpt.site/

Run `npm ci` before building the source snapshot. `npm run build` restores the pinned Ghostscript WebAssembly asset from its npm package; the large generated WASM file is excluded from the snapshot. The Python app requires system Ghostscript (installed by its Dockerfile).

## Feedback update

Version 49 also adds minimum-distance safe-margin correction, a validated corrected-version save action, and proportion-preserving 6x4 signboard preparation.

The preceding update adds column-constrained text wrapping, proportional text fitting, DL street-number styling, A5 paragraph repair, contact-field clipping/alignment fixes, auction-time handling and print finishing. Small-format downloads use PDF 1.3 with outlined fonts and flattened transparency; signs retain PDF 1.7.

Includes signboard border and corner-mark cleanup, 8x4 recognition, editable outlined For Sale headings, centered contact fields, tri-fold bullet grouping, current-text warnings and preview scroll preservation. Reimport original PDFs to apply import-time cleanup and grouping.

Edited-field regression checks passed across 14 pages in both rendering engines. Print conversion passed across all 8 documents. Version 49 corrects the booklet safe margins and supplies explicit 6x4 signboard layouts. The first signboard still requires a high-resolution original photograph. See [QA-FEEDBACK.md](QA-FEEDBACK.md) for exact coverage and limitations. Package checksums are in [release-manifest.json](release-manifest.json).

This is a source snapshot, not automatic ongoing synchronization. The optional AI draft feature requires a server-side OPENAI_API_KEY. It is now connected on the hosted site; developers must configure their own secret. No key is included in this repository.

## Secure AI-enabled replacement

`webdev-signboard-studio-ai/` contains the existing separate server-backed application. Its Upload your template flow supports browser-side PDF intake and field review; Create your own accepts PDFs, JPGs and PNGs for server-side recognition. Credentials stay server-side. Its live recognition test is opt-in with `RUN_LIVE_AI_TEST=true`. This directory is unchanged by the version 49 snapshot update.

Version 49 fixes same-row agent card anchors during edits and prevents letter address placeholders from being silently removed.
