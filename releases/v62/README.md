# Stone Studio v62

Repairs brochure text frames, keeps inline phone numbers beside agent names, centres stacked email lines, and retains number/icon spacing. Bullet-list frames and address/headline fields are recovered when opening older templates. Unchanged rich text preserves source glyph positions.

Missing bleed is generated outside the original trim by extending artwork edges. Finished-face dimensions and content positions are retained; repeated opening does not add bleed twice. Applies to imports and saved templates.

Validated with source-fixture alignment and bleed tests, crop-mark and 6x4 signboard regressions, TypeScript checks, Python export/print finalization and the production build. Source fixtures, customer PDFs, credentials and downloads are excluded.

Assemble with `python releases/v62/prepare_source.py`.
