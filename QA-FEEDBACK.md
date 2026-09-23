# Fixes and retest — 23 September 2026

Hosted version 47; source commit `2f259e515bd98da0b28053e29f0d0fac48e3b46c`.

## Fixed

- Keep rich text inside the original column and proportionally reduce oversized text within a bounded range. Inputs that still cannot fit are rejected.
- Preserve the DL large street number and smaller street/suburb lines; prevent description overflow into the photograph.
- Repair the detached final fragment of the A5 body paragraph in compatible saved templates.
- Correct phone right anchors and email clipping/left anchors; empty optional emails hide correctly.
- Commit auction time on Apply and preserve it when changing the date or reopening the picker.
- Pause preview rendering in inactive editor tabs.
- Release the Python browser worker after rendering and transfer the print PDF buffer without cloning it. Store only page geometry before conversion instead of loading both complete PDFs concurrently; this addresses the large tri-fold memory-copy failure discovered in the live retest.
- Finish small-format exports as PDF 1.3, outline fonts, flatten transparency and convert to process CMYK. Signboard exports remain PDF 1.7 with outlined fonts. No image downsampling is requested; transparency is flattened at 300 dpi.
- Ship the same native print finishing in the Python package. System Ghostscript is required and is installed by its Dockerfile.

## Retest evidence

- Edited-field regression passed for all 8 original PDFs / 14 pages in JavaScript and Python. Checked matching field values and horizontal positions.
- All 8 native print conversions passed version, font, soft-mask and colour-space checks. Checked page count and trim/bleed dimensions.
- Live browser: DL address, description and bed/bath/car edits dynamically update within the dark panel. Download inspected: 2 pages, PDF 1.3, 214 x 103 mm sheet, 210 x 99 mm trim, 2 mm bleed, no font objects or soft masks.
- Live browser: A5 page 3 paragraph and both names/phones/emails edited. Four-page download completed (171,763,527 bytes). Download inspected: PDF 1.3, 214 x 152 mm sheets, 210 x 148 mm trim, 2 mm bleed, no font objects or soft masks. Rendered page 3 inspected visually: no detached fragment, correct emails and phone alignment.
- Live browser: auction date 26 September 2026 and 13:30 retained after applying and reopening; generated label reads 1:30 pm.
- Download-event capture timed out, but the actual completed files subsequently appeared and were independently inspected. This was delayed file delivery, not a failed PDF generation.
- Version 47 live tri-fold retest: edited heading, address and paragraph; download succeeded after the memory fix. Inspected the actual 226,677,614-byte file: 2 pages, PDF 1.3, 301 x 633 mm sheets, 297 x 629 mm trim, 2 mm bleed, zero fonts or soft masks and no detected RGB/spot colour spaces.
- Production build, TypeScript check and Python frontend/package build passed.

## Print approval still required

These are not all certified print-ready source designs. The A5 and tri-fold retain source text inside the required 5 mm safe margin and remain proof-only. The first photo signboard contains a low-resolution original image. The two 6x4 filenames conflict with the artwork's detected 8x6 proportions; confirm the intended size before ordering. Text baked into a floorplan/image stays part of that image and must be replaced with updated artwork; changing the address field does not rewrite those pixels. Replacement assets must meet print resolution requirements. Long QR destinations can produce modules below the minimum size and are flagged.

The hosted automation API rejects small-format `mode: print` with a clear error because heavy prepress runs in the Studio browser or Python application. Use either of those paths for the finished PDF; API proof mode remains available.

The regression is not an exhaustive certification of every possible value, replacement image, printer RIP or device. Earlier browser testing covered each supplied template; this fix retest targets the failures and shared rendering paths. Large original files remain memory-intensive.

---

# Earlier feedback implementation — 22 September 2026

The feedback at the end of the shared **Create Dynamic Templates** conversation has been applied to the hosted Studio source.

## Resolved in this update

- Template 1: remove the white corner registration square even when it is inside a nested Form XObject. Changed form instances are cloned so other artwork uses remain intact. Red registration squares remain.
- Template 2: recognise the complete drawn trim frame when the PDF has no inset TrimBox. Suggest the named 8x4 preset (1220 x 2440 mm), remove the frame lines/white border, and extend the existing solid background into the required bleed. No photo stretching is used.
- Template 2: recover the outlined For / Sale heading through vector comparisons with the matching bundled Nimbus Roman font. Both lines become editable; unmatched outlined artwork and logos remain fixed. This is constrained heading recognition, not general OCR.
- Preserve centred agent-name, phone and contact frames when replacement text changes length. Retain left/right alignment elsewhere. Apply the same centring in JavaScript and Python PDF output, including formatted heading rows.
- Template 3: keep each entire 14-line bullet column in one group; shortening a column no longer leaves an independently positioned final bullet.
- Safe-margin warnings identify the current replacement text rather than the original wording.
- Comparing original/generated artwork retains the preview scroll offset and disables browser scroll anchoring in that pane.
- Preserve the previously published removal of the arbitrary 150 MB saved-asset cap. Browser memory and storage limits still exist.

## Verification

- TypeScript check passed.
- Real-reference regression covers both signboards and tri-fold sheet 2: editable headings, centre anchors, continuous bullet groups, successful proof generation and exact trim dimensions.
- Independent PyMuPDF inspection: 8x4 output MediaBox is 337.5 x 642.5 mm, TrimBox is 305 x 610 mm, with 16.25 mm bleed per side. Two red marks measure 1.25 x 1.25 mm at 25% (5 x 5 mm full size).
- Template 1 is physically 8x6 despite its 6x4 filename. The size-conflict choice is retained. Using detected dimensions gives a 657.5 x 505.5 mm sheet and 610 x 458 mm trim at 25%. Its white corner square is absent after cleanup.
- Edited 8x4 and photo-signboard exports have zero rendered pixel difference between the JavaScript and Python engines at the checked resolution.
- Batch: 8 supplied print-template PDFs / 14 pages, all generated representative edited outputs without text-fit errors; all 14 trim dimensions match their selected settings. This is not an every-field, every-media browser certification.
- Independently rendered and visually inspected the edited signboard and shortened tri-fold columns.
- Existing print-delivery regression passed for 25% signboards, 100% paper products, size conflicts and signboard-only cleanup.

## Still requires review

- Tri-fold sheet 2 and A5 booklet page 3 retain source safe-margin warnings (14 and 7 respectively in the representative batch). These were not suppressed or silently repositioned.
- Browser preview infrastructure was unavailable in this session. Save/reopen, upload/download interaction and scroll retention were not reverified through the browser. The scroll fix is implemented but not browser-certified.
- The scanned auction flyer and its digital comparison are not included in this 8-document PDF-import regression. General scan-to-editable reconstruction remains a separate workflow.
- No files were uploaded to Google Drive in this update.
- New import/grouping/cleanup rules apply when reimporting the source PDFs. Existing saved templates remain intact; centre alignment also normalises compatible saved fields on load.

## Earlier browser notes (historical)

The notes below record the earlier session, before this update. They are retained for traceability and are not current pass/fail results.

# Deferred browser QA issues

- Template 1 (6x4 Photo Signboard): white registration square remains in exported PDF. Confirmed in Drive preview; remove production marks without erasing artwork. Deferred at user request.
- Template 2 (8 x 4): document setup suggests custom 1160 x 2365 mm instead of the named 1220 x 2440 mm. Selected correct preset manually for continued testing.
- Template 2: generated preview retains outer white border and trim marks. Red registration squares are visible. Print cleanup remains pending.

## Template 2 checks completed
- All five detected text fields changed and visibly updated.
- One-agent toggle hides second agent without moving first; two-agent state restored.
- Hide Agency group removes contact text; restored before save.
- Saved as QA 02 — 8x4 Signboard (c717fcd0-52b2-4aeb-bb3c-506f23cdf477).
- Correct preset selected: 1220 x 2440 mm face, 65 mm full-size bleed, 25 percent output. Binary output dimensions not yet independently verified.

## Template 2 exported-file visual check
- Inspected QA_02_8x4_Signboard_Print_25pct (1).pdf in Drive. Both edited agent names, both phones and qa@example.com are correct, without overlap.
- White outer border and black trim marks confirmed in actual export; red registration squares remain.
- Large For Sale heading is visible but was not exposed among editable fields. Add outlined-text recognition/editing coverage.
- Exact MediaBox/TrimBox/BleedBox measurements remain unverified; Drive visual preview alone does not prove millimetre dimensions.

- Template 2 correction: names and agency email fail original centred alignment; prior no-overlap result was insufficient. Recalculate each replacement using original frame alignment, without moving frames.

## Template 3 in progress
- Both sheets loaded; UI uses 297 x 629 mm face, 2 mm bleed, 100 percent export.
- Page 1 exposes five content groups and three image slots plus QR. No bed/bath/car group appears; check source icons.
- Page 2 emits fourteen safe-margin warnings before its text is changed; investigate against source coordinates before classifying.
- Page 1 heading/address/details/auction/viewing edited. Image 1 replacement is the upper living-room panel, not the lower cover panel.
- Template 3 sheet 2: each original continuous bullet column was split into a main group and detached final bullet (Details 3/4). Shortening main group leaves a large gap before detached final bullet. Confirmed using Compare original.
- Template 3: Compare original resets preview scroll to top, impeding same-position comparison.
- Template 3: all nine detected sheet-2 text inputs changed; generated preview visibly updates. Agency email centre alignment needs precise verification against original frame; do not mark pass.
- Template 3 SAVE FAILED: The asset exceeds 150 MB. Both-sheet edits remain unsaved in browser. This blocks saved/reopened and exported-PDF checks. No fixes applied per user instruction to finish testing first.
- Template 3 remaining coverage: remaining images/headshots/floorplan replacements, ordering/crop/rotation, exact print boxes, QR decoding, full-size visual comparison. These are NOT marked passed.
