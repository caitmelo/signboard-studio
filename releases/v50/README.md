# Version 50 — template builder fixes

Hosted source commit: `776f12a1229fcffe9c1eb7dcab4d2f88bd7b247f`.

This release covers **Create your own → Start from a file** (the scan-to-editable builder). The earlier generator-only handoff remains separate in `GENERATOR-HANDOFF.md`.

## Get the complete updated source

Download/clone the whole repository, then run from the repository root:

```sh
python3 releases/v50/prepare_source.py
```

This checks the existing v49 source ZIP and all six changed files, then creates `signboard-studio-source-v50.zip`. Extract that generated ZIP for development. All unchanged assets, fonts, dependencies and generator code come from the existing base ZIP; the complete changed files are in `overlay/`. No manual patch application is needed.

Do not use the root `signboard-studio-source.zip` alone for this update: it remains the v49 base. The root Python ZIP is also v49 and has not been rebuilt for these builder changes. This release targets the hosted web builder, not the separate `webdev-signboard-studio-ai/` application.

## Changes

- Fits reconstructed text using the same font metrics and wrapping as PDF export.
- Carries detected line spacing into the editable scene.
- Removes duplicate overlapping inline text, including an address emitted twice.
- Sends explicit source-image dimensions to recognition.
- Uses GPT-5.4 with original-detail image analysis by default; `OPENAI_VISION_MODEL` can override the model.
- Improves instructions for logo/photo crops, footer columns, line breaks and inline styles; uses contain mode to avoid a second crop.
- Keeps A4 office letters at 210 × 297 mm, 100% output and zero bleed when Letter is selected.

## Setup and verification

Use Node 22.13+ and the checked-in lockfile. From the extracted source:

```sh
npm ci
npx tsc --noEmit
node --import tsx scripts/check-scan-reconstruction.mts
npm run build
```

The existing Cloudflare storage/authentication bindings remain required. Set `OPENAI_API_KEY` as a server-side secret, never in frontend code. The key needs access to the selected vision model. No credentials or user-uploaded PDFs are included here.

Passed: TypeScript checking, production build, measured text fitting, duplicate-address regression, editable PDF roundtrip, and exact A4/zero-bleed checks. Version 50 was successfully deployed.

**Still pending:** fresh browser reconstruction and visual comparison of the auction flyer scan and Just Listed letter. Preview infrastructure was unavailable after the fixes. This package does not claim those designs have passed visual QA, nor that prompt changes guarantee exact OCR/cropping on all scans. Re-upload the originals to create new drafts; old saved drafts are not migrated.

Before accepting: compare all text, logo/photo crops and footer alignment against the originals, edit each field, then inspect downloaded PDFs at actual size. Scan crops retain the source scan's resolution and quality.
