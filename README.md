# Stone Studio v64

Shows finished-size previews on the homepage and in saved-template editing. Stored print-sheet thumbnails are cropped using the template’s exact trim geometry, not white-pixel guessing. The editor has a separate print-sheet-and-bleed view. Print PDF geometry, bleed, marks, artwork, API configuration and export engines are unchanged.

Validation: TypeScript, production build, thumbnail geometry tests (including asymmetric registration space and 25% scaling), and existing brochure/signboard frame-alignment tests. Listed and Sold source PDFs were rendered on both pages; source safe-margin review notes remain and are not silently approved.

Build the full source archive with `python releases/v64/prepare_source.py`. This assembles verified prior releases plus the readable v64 overlay. Customer PDFs and credentials are excluded.

Live site: https://stone-edgewrap-studio.caitmelo.chatgpt.site
