# Stone Studio v57

Fixes the 3mm PDF origin shift on import and preserves editable text as sharp vector outlines through PDF 1.3 conversion. Adds saved dates, copy IDs, revisions for new saves, per-copy deletion, a visible 100% completion state, and locked signboard background artwork.

Sprint settings remain product-specific: signboard registration marks; no crop marks on paper products; 2mm paper bleed and PDF 1.3 with outlined fonts. Original PDFs must be imported again to fix previously saved shifted artwork. Full matching fonts are required for characters absent from embedded subsets.

Assemble the complete source with `python releases/v57/prepare_source.py`. See manifest.json for source and file hashes. Runtime secrets and customer PDF fixtures are excluded.
