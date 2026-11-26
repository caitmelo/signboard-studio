# Dropbox template regression pass — 25 November 2026

Source files: the ten Dropbox links supplied in the conversation, downloaded separately from the source repository. Customer files are not committed.

Verified locally:
- DL Just Listed: four pages compile and preview without exceptions. Replacing the address with `42 / New Street / Newtown` updates all three source lines. Generated PDF visually inspected.
- A4 Landscape 2 Page source: all six PDF pages compile and preview without exceptions. This source contains six pages despite its filename.
- A5 landscape: first photo replacement previously produced an invalid PDF crop rectangle (`e-7`). Fixed decimal serialization; rasterized output now shows the replacement inside the top frame, with no PDF syntax errors.
- A4 four-page landscape, 6x4 landscape photoboard and 3x4 portrait: first-page photo replacement engine runs complete.
- Stock agent placeholder `<Name>` is now eligible for the existing name/phone pairing, tested by regression.
- The supplied photoboards are Bannerwrap, distinct from Edgewrap stock-board presets.

Not claimed complete:
- Native INDD/IDML layout conversion.
- Full browser interaction, package upload timing and guest-download checks.
- Every page/field variant, imposed-sheet selection, long viewing lines and all agent edits.
- Exact printer approval and final print geometry for these new files.

Tests: TypeScript, check-placeholder-agent, check-pdf-numbers; actual-source engine/Poppler checks described above. Local browser preview infrastructure remains unavailable.

## Flow fixes — 25 November 2026
Read all 8 pages of Stone-Studio-Flow-Fixes.pdf. Implemented a single homepage upload entry; PDF direct-open and package intake; concise size confirmation with collapsed advanced options; review-first controls; explicit approval followed by print download (not printer submission); IndexedDB browser drafts with restore/delete; removed technical downloads from the saved editor.

Photo worker now ships at /workers/image-preparation.js, built explicitly with esbuild. A worker-thread test of the shipped bundle generated a CMYK PDF. Centred contact clip expansion now covers both sides of its anchor while collision checks remain active. Regression checks cover centred replacement, collision rejection and missing-character font prompts. TypeScript and editing checks pass.

Limitations: preview relay unavailable, so browser workflow and actual template visual verification remain unverified. Browser drafts are device/browser-local and require available storage; they do not sync accounts. Package upload continues to save source files online. INDD/IDML conversion remains unimplemented. Printer submission is not configured, so approval offers a download and never claims sent. No Sent classification has been added. Existing colour/pattern and other print blockers remain enforced. This is a partial implementation of the flow brief, not completion of all 14 points.

## Send off — 25 November 2026
User defined Send off as approve + save final + download, with no printer/email submission. Added one shared SendOff action to the import review and saved-template editor. It snapshots the current settings, enforces font/text/media/print checks, generates print mode output, commits an approved immutable record and the exact PDF in IndexedDB, then initiates download. Save/export failures cannot display completion. Clicks are locked while working; the surrounding form is disabled. Finals appear separately in the collection and reopen with page selection and exact PDF redownload. Editable drafts remain separate.

The sendOffDesign service is the single future integration boundary. A final has a stable ID, approved timestamp, approved manifest, exact PDF and explicit download/not_submitted delivery metadata. No Beleef, printer, supplier, pricing, installation or email calls are implemented. Storage is browser-local; UI says this explicitly. No sign-in required. Build-time TypeScript and focused checks cover validation/render/persistence order, unchanged source manifest, exact PDF/approval metadata, invalid-PDF rejection and storage-failure rejection. Local preview still unavailable (preview relay missing); browser end-to-end send/download/reopen remains unverified.

## Saving and missing source fonts — 26 November 2026
Saving is independent of print preflight. Import Save first preserves a browser draft; compiled designs can save online despite fit/font/print problems and without a thumbnail. Online saves remain proof/review state. Saved-template editor now has Save template and owner-scoped bypass-and-save with an optional reason. Server persists current text/content/media and an owner/timestamp/issue audit record. It does not clear print checks or silently approve a final. Uncompiled designs remain browser drafts. Real storage failures are reported.

Type3 fonts with CharProcs are treated as self-contained, not missing. Stale source-font warnings are re-evaluated against visible base text (hidden/unused font resources do not block print). Genuine missing fixed fonts appear in the upload/alternative chooser. Supported, decoded fixed text can be replaced with chosen font outlines; unsafe encoding/rotated/clipped cases retain an explanatory issue and remain saveable. Font replacement creates a new base asset and atomically updates its manifest pointer. Both preview/download and server render load that base. Decisions are recorded for the owning account; this does not add cross-account admin authority.

Checks: TypeScript; focused API test saves missing-font/invalid-layout content without a thumbnail, retains edited values, records bypass reason/actor, and rejects another owner. PDF tests cover Type3 stale-warning removal, genuine missing-font detection/choice, actual fixed-text outlining, and rejection of undecodable glyphs. Browser preview relay remains unavailable; full tests on the user's exact current PDF remain unverified.

UI layout: warning cards now stack text/link/button vertically. Package text-input width styling excludes checkboxes/radios/files; licence checkbox has a fixed 1rem width with a flexible text span. This addresses both supplied narrow-text screenshots.

## v74 — original content and edit-before-approval
- Original text keeps its positions, size and clipping without failing preview because its glyph bounding box crosses a clip. Existing fixed-text intersections do not reject unchanged source content.
- Edited individual fields automatically scale within the frame while retaining baseline and left/centre/right anchor. Remaining fitting concerns are review notes rather than proof failures.
- Content, Media, Print size and Correct controls are visible before saving or approving; approval is below the controls.
- check-original-frame.mts verifies original clipped text renders, original metrics retained, longer edits fit at all three alignments, and controls are not hidden behind approval. Typecheck passed. Exact user brochure PDF not available in this turn; its screenshot is not an export fixture.

## v75 — resolve size mismatch before approval
- Added immediate Keep uploaded size / Fit to selected product controls beside the mismatch, applying per-page resolution without resetting content or media edits.
- Original size reads source dimensions with the product export scale and current bleed flag. Fit uses uniform centred scaling; explicitly discloses possible margins, with no cropping or stretching.
- Geometry validation accepts deliberate fit but still rejects invalid dimensions. PDF base and editable text use identical scale/offset; exported trim and bleed boxes retain selected dimensions.
- check-size-resolution.mts passed source-size, 25% edgewrap, invalid dimensions and actual rendered PDF TrimBox checks. Typecheck and production build required. Exact user PDF not attached, so its full approval flow has not been reproduced.

## v76 — commercial finished-size confirmation
- Standard names and orientation lead the setup screen; millimetres remain advanced. Signboard names explicitly use feet and retain Sprint preset measurements.
- Detection prioritises explicit trim dimensions, then exact physical sizes, then plausible equal bleed/printer borders. Signboards are matched at full or quarter scale; no ratio-only size guesses.
- After confirmation, paper sheets are normalised to the finished frame plus existing required bleed. Missing bleed continues through the existing generation pipeline. Artwork stays vector. Ambiguous custom artwork remains custom; an A5-named A4 imposed sheet remains A4 with an explanation rather than silently losing panels.
- Tests: A5 bare/2 mm bleed/10 mm margins, A4 landscape, asymmetric explicit trim, A5-on-A4 sheet, quarter-scale 6x4/8x4 signboards and custom fallback passed. Exact customer PDFs not available this turn.

## v77 — one Approve action with explicit issue review
- Removed separate template Save and manual draft buttons from import editor. Autosave remains; Approve now persists the design and approval record before showing success.
- Exact deduplicated font/layout/print/preview issues appear immediately above Approve. Clean designs say No unresolved issues found. Users can explicitly accept outstanding issues and approve/save; print generation remains honest about unrenderable files.
- Approval records and accepted issues survive browser storage/reopen and appear as Approved design in the collection. Editing clears approval and checkbox acknowledgement. Signed-in users also retain account-template sync; failures report local-only success.
- Tests verify acknowledged issue persistence, clean approval without acknowledgement, rejection before persistence without consent, and storage failure propagation. Typecheck passed. Full browser flow and customer PDF not tested this turn.

## v78 — faithful template review and original comparison
- Editable template name is visible during document confirmation (e.g. A4 Trifold DL); it is distinct from the physical paper-size preset.
- Preserve untouched uploaded PDF bytes and recover them from stored File for older browser drafts. Compare original now opens a labelled original/current comparison rather than swapping two prepared versions. No original bytes are overwritten by visual reconstruction.
- Frames are on by default on generated output, using the same source scale, export scale, translation and user unit as the renderer. Show/hide control restored. Issue links navigate to affected pages and highlight matched fields/media; unlocated colour concerns highlight the page, never an invented frame.
- Identical issues are grouped across pages. Automatically prepared notes report recorded bleed/watermark/colour operations; process-only DeviceN definitions are preserved without false unknown-colour warnings. Unknown spot colours still require review rather than being silently changed.
- check-review-navigation.mts verifies deduplication/page targets, field matching, overlay coordinates, process-black warning removal, unknown BrandGold warning retention and original/name wiring. Typecheck passed. Browser interaction and the exact customer PDF remain unverified; screenshots cannot validate the source colour definitions.

## v80 — DL mailcard versus A4 trifold
- Persist distinct print-format metadata for flat DL mailcards, flat A4 pages, and A4 trifold-to-DL. Detection uses finished physical sheet size plus filename hints, never two-page count alone.
- Visible What are you printing selector explains front/back flat cards versus outside/inside unfolded sheets. Generic A4 remains flat unless the user chooses folding. Existing trifold panel widths are preserved, not re-imposed or guessed.
- Apply confirmed format across matching document pages and preserve both full A4 sides through margin/bleed normalisation. Format survives template/draft saving in PrintSpec.
- check-dl-formats.mts passed 2-page DL/A4 fixtures at 0, 2 and 10 mm borders, misleading filenames, generic A4 and manual selection. Typecheck passed. Exact customer PDF/browser flow not tested this turn.
