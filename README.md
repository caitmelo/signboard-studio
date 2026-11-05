# Stone Studio v58

Adds readable branded template names, step-specific import/save/font errors, separate proof and print PDF buttons, and private owner-scoped storage for matching fonts uploaded in field setup. Full font files must be supplied once; the project does not bundle the missing commercial fonts.

Retains v57 PDF-origin alignment, vector text outlines, fixed signboard background, dates/copy IDs, delete controls and visible 100% save progress. Sprint paper output remains PDF 1.3 at 100%, with 2mm bleed and no crop marks; signboard registration marks are retained. Reimport original PDFs to fix older shifted copies.

Assemble source with `python releases/v58/prepare_source.py`. The cumulative overlay is verified against manifest.json. Runtime secrets, uploaded font files and customer PDF fixtures are excluded.

Validation: typecheck, build, four supplied-template regressions, exact vector-text preservation, origin checks, private font storage/reuse and proof/print mode checks passed. Interactive browser QA was unavailable because the managed preview relay was unavailable.
