# Stone Studio v65

Includes v64 finished-size homepage previews and the editor’s separate print-sheet view. Fixes a fresh-import regression: generated edge bleed was parsed as original artwork, duplicating text and producing false 1–2 dpi image warnings. Generated bleed forms are now excluded from editable-field and source-image analysis, while the original artwork remains checked.

Validation: TypeScript and production build; thumbnail geometry tests; brochure/signboard text-frame tests; generated-bleed regression test; both pages of Listed and Sold source PDFs rendered after watermark removal with no fit or preflight notes. Existing full-size dimensions, bleed and print exports are retained.

Assemble the full source with `python releases/v65/prepare_source.py`. Customer files and credentials are excluded.

Live site: https://stone-edgewrap-studio.caitmelo.chatgpt.site
