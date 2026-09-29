# Version 51 — HTML download

Source matches deployed Site version 51, commit `c28790cdac55e1fcaba71770e6e429a96e60d57a`.

## Complete updated source

Clone or download the whole repository, then run:

```sh
python3 releases/v51/prepare_source.py
```

This checks the root v49 source ZIP and all 12 overlay checksums, then creates `signboard-studio-source-v51.zip`. Extract that ZIP for development. The cumulative overlay includes the v50 builder fixes; do not apply v50 separately. Root source/Python ZIPs remain v49 base packages and must not be mistaken for this release. The separate `webdev-signboard-studio-ai/` application is unchanged.

## Changes

- Separate Download HTML button beside PDF downloads in the saved-template generator and Edgewrap editor.
- HTML uses the same final PDF-generation path and current field values; includes all pages.
- Standalone, script-free HTML with embedded PNG page artwork, preserved physical page dimensions, portrait/landscape pages and print pagination.
- Visual export, not editable HTML text. Rendering targets 200 dpi, bounded to 16 million pixels/6000 pixels per page. The original PDF remains the professional print file.
- Existing PDF generation, template editing and print settings are unchanged.

## Validation

Passed TypeScript and production build. Generated HTML using the actual PDF.js export function, rendered it independently with WeasyPrint, compared it with original PDFs and visually inspected all three pages: A4 letter, landscape second page and two-agent Edgewrap. Page counts and dimensions matched; no missing text, cropped content or extra blank pages. Detailed image-comparison results are in `comparison-results.json` (mean channel differences below 1/255).

The live button-click test was unavailable because preview infrastructure was unavailable. Earlier v50 scan-to-editable visual retesting remains pending; this HTML comparison does not establish scan-reconstruction accuracy.

## Development

From the assembled source, use Node 22.13+:

```sh
npm ci
npx tsc --noEmit
npm run build
```

Existing Cloudflare storage/authentication setup remains required. Scan analysis needs a server-side `OPENAI_API_KEY`; no secrets are included. HTML export itself needs no additional API key.

Optional artifact regression: `node --import tsx scripts/check-html-export.mts`, followed by `python scripts/compare-html-pdf.py`. These QA scripts require `@napi-rs/canvas` (local or via `CODEX_PRIMARY_RUNTIME_NODE_MODULES`) and Python WeasyPrint, PyMuPDF, Pillow and NumPy. They do not add production dependencies.

Earlier generator-only integration scope remains documented in the root `GENERATOR-HANDOFF.md`. This cumulative package contains the full Studio; it is not a stripped generator-only build.
