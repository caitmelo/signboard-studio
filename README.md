# Stone Studio v66

Adds the preferred Template package upload alongside PDF upload. Users can upload folders, ZIPs or individual files, keep partial packages together, return to add files, inspect IDML font/link references and use supplied fonts with the existing PDF editor.

INDD/IDML files can be stored and checked, but native layout conversion is not implemented. A PDF exported from the design is still required to edit a template. Linked artwork is retained and checked; it is not automatically used to rebuild an InDesign layout.

Validation: TypeScript, production build, ZIP/CRC/path/size tests, supplied-font punctuation, owner/origin isolation, incomplete-package persistence/resume/replacement/finalization/cleanup. Live browser checks cover INDD-only upload, refresh persistence, adding a ZIP and PDF, and missing-font/link guidance.

Assemble full source with `python releases/v66/prepare_source.py`. Customer files and credentials are excluded. Existing print geometry, output engines and runtime API settings are retained.

Live site: https://stone-edgewrap-studio.caitmelo.chatgpt.site
