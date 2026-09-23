# PDF Template Generator — Developer Handoff

## Scope agreed with the owner

Deliver the existing-PDF template generator only:
- Import an existing PDF design and review the detected editable fields.
- Confirm product dimensions, bleed and output scale.
- Save/reopen a reusable template.
- Edit text, property address, agent contacts, images and QR destinations.
- Preview the generated PDF, validate the job and download the print PDF.
- Integrate the rendering engine into the developer's backend as needed.

Exclude the blank-canvas **Create your own** design builder, its drawing/scene-editing UI and optional AI reference-to-design drafting from the delivered product. Do not remove the PDF import editor merely because its source component is named `template-builder`: it is part of the generator workflow.

## Authoritative version and packages

Use hosted version **49**, source commit `bbadbc4324d03e0cd282c6fe1d914463bc709764`.
The repository snapshot containing these fixes was committed at `a58df9b5ef2d83d83ef037527e9977b6f8e72452`.

- [signboard-studio-source.zip](signboard-studio-source.zip): web/Python source, assets, fonts and build scripts.
- [signboard-studio-python.zip](signboard-studio-python.zip): packaged Python application and frontend, with its own setup instructions.
- [release-manifest.json](release-manifest.json): exact package sizes and SHA-256 hashes.
- [QA-FEEDBACK.md](QA-FEEDBACK.md): test evidence and limitations, newest section first.

**Packaging boundary:** these are the tested full Studio archives. This handoff defines the generator-only integration; the archives have not been stripped into a separately built generator-only release. Exclude builder routes/navigation when integrating, then build and test that reduced application. Do not represent that reduced integration as already tested.

The separate `webdev-signboard-studio-ai/` directory is not the authoritative v49 generator snapshot. Start from the ZIPs above rather than mixing it into this integration.

## Entry points in the extracted source

- `/templates/new`: existing PDF intake, document setup and editable-field review — retain.
- `/templates/:id`: saved-template editing, preview and export — retain.
- `/templates/create`: blank-canvas design builder — exclude from the delivered UI.
- The template library currently exposes both workflows. Remove its **Create your own** entry from the generator-only integration.
- `components/content-editor.tsx`: generated content controls.
- `lib/template-engine.ts`: PDF analysis/compilation and rendering.
- `lib/content-groups.ts`, `lib/rich-text.ts`, `lib/text-alignment.ts`: grouped text, paragraph layout and contact anchors.
- `lib/template-media.ts`, `components/media-fields.tsx`: replacement images and QR content.
- `lib/print-specs.ts`, `lib/safe-text.ts`: print rules and safe margins.
- `public/python/engine.py` and `python/signboard_studio/engine.py`: matching browser/native Python engines.
- `scripts/qa-letter-footer.mts`: targeted letter/footer regression.

Preserve shared fonts, colour profiles, assets and rendering dependencies when excluding builder UI. Use the source dependency graph rather than deleting everything named “builder.”

## Setup and deployment

For the web source, extract the archive and run `npm ci`, then `npm run build`. Preserve the lockfile. The build restores the pinned Ghostscript WebAssembly asset; that large generated file is intentionally excluded from the source ZIP.

If serving the packaged Python download from the web application, place the separate Python ZIP at `public/downloads/signboard-studio-python.zip`.

For the Python application, follow the README and Docker setup inside its ZIP. Native print finishing requires **system Ghostscript**, which its Dockerfile installs. Rebuild the Python frontend after changing shared TypeScript UI code; update both Python engine copies together.

The existing web storage routes are specific to the hosted app. The developer must provision or adapt storage and authentication for their deployment. Source code does not transfer the owner's live template records or uploaded assets automatically. Existing templates can be exported through **Export template for Python** and imported into the Python application.

The optional AI draft feature is excluded from this scope. Do not require an OpenAI API key merely to use the existing-PDF generator.

## Fixes that must remain in the integration

- Letter paragraphs reflow left-aligned; the inline address remains independently editable.
- Removing the required address placeholder produces a visible error and blocks download.
- Same-row agent cards keep names/emails left-anchored and phone numbers right-anchored.
- JavaScript and Python paths implement these fixes.
- Product-specific trim, bleed, scale, safe-margin checks and proof/print gating remain enabled.
- Small-format print output is PDF 1.3; fonts are outlined and transparency flattened. Signboards use PDF 1.7 and their configured output scale.

## Acceptance checks for the developer's deployment

1. Import/save/reopen each supplied PDF and confirm its original content before editing.
2. Change the letter address and first paragraph; confirm the second paragraph and contacts remain. Remove the address placeholder and confirm export is blocked, then restore it.
3. Change both A4 agents' names, phones and emails, including differing lengths. Confirm email/name left alignment and name/phone baselines in preview and download.
4. Download every page and inspect actual PDF trim/bleed, scale, font handling and image quality.
5. Exercise image/QR replacement and persistence on the developer's storage/authentication implementation.
6. Confirm builder/AI-draft entry points are absent from the delivered generator UI.

The v49 live browser tests covered the letter and A4 edits and actual downloads; broader earlier tests covered eight supplied PDFs / fourteen pages. This does not certify all possible documents or a new deployment. Some regression scripts require the supplied local PDF fixtures, which are not production app assets and must be supplied separately.

## Known boundaries

- Replacement JPEG/PNG/WebP images above 24 megapixels are reduced to 24 MP in the current frontend; the owner plans to adjust image handling in the backend.
- Low-resolution source photos remain proof-only until replaced.
- Text baked into a floorplan or image is not changed by editing a separate address field.
- API print finishing is not interchangeable with the browser/native Python print path; preserve the existing explicit failure behavior rather than returning an unfinished proof as print-ready.
- Large PDFs can consume substantial browser memory. The source snapshot is not an automatic synchronization service.

The live site remains the full Studio; this handoff does not change its public workflows.
