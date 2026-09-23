# Signboard Studio

Source snapshot matching hosted version 44, source commit `85771ca791274e757df3145baada14c97f65cb73`.

- **signboard-studio-source.zip**: web and Python source, assets, fonts, tests and build scripts. Extract for development. Place the separately supplied Python ZIP at `public/downloads/signboard-studio-python.zip` to serve that download.
- **signboard-studio-python.zip**: packaged Python application and frontend with setup instructions.

Site: https://stone-edgewrap-studio.caitmelo.chatgpt.site/

## Feedback update

Includes signboard border and corner-mark cleanup, 8x4 recognition, editable outlined For Sale headings, centered contact fields, tri-fold bullet grouping, current-text warnings and preview scroll preservation. Reimport original PDFs to apply import-time cleanup and grouping.

PDF regression checks passed across 14 pages. Browser interaction verification was blocked by preview infrastructure; source safe-margin warnings remain on two booklet pages. See [QA-FEEDBACK.md](QA-FEEDBACK.md) for exact coverage and limitations. Package checksums are in [release-manifest.json](release-manifest.json).

This is a source snapshot, not automatic ongoing synchronization. The optional AI draft feature requires a server-side OPENAI_API_KEY; it was not configured on the hosted test site during this update.

## Secure AI-enabled replacement

`webdev-signboard-studio-ai/` contains the existing separate server-backed application. Its Upload your template flow supports browser-side PDF intake and field review; Create your own accepts PDFs, JPGs and PNGs for server-side recognition. Credentials stay server-side. Its live recognition test is opt-in with `RUN_LIVE_AI_TEST=true`. This directory is unchanged by the version 44 snapshot update.
