# Stone Studio v63

Includes v62 text-frame and automatic-bleed corrections. Fixes inline agent phone placement even when saved text formatting splits a line into styled runs. Preserves hidden groups when repairing legacy brochure frames. Keeps image crop coordinates local when adding bleed so replacement headshots remain inside their circular frames.

Validation: TypeScript and production build; source-fixture tests for unchanged glyph positions, centred email, inline names/phones (including formatting), list frames, trim invariance, idempotent bleed and local image crop coordinates; Python formatted-flow check and print finalization. Live saved-template downloads were checked during this release.

Assemble with `python releases/v63/prepare_source.py`. Customer source PDFs, downloaded outputs and credentials are excluded.
