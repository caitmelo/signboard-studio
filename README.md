# Signboard Studio — v55

Live site: https://stone-edgewrap-studio.caitmelo.chatgpt.site

Latest source: `releases/v55`. Run `python releases/v55/prepare_source.py` to assemble the complete source ZIP from the checked-in v49 base and cumulative overlay. Root ZIPs remain the older base releases.

Includes the font-service repair, embedded punctuation recovery, 600-field limit, missing PDF image decoders, process-colour warning correction, stale text-key handling, locked full-page backgrounds, and automatic removal of detected separate proof-watermark overlays during import. Watermarks baked into photos still need clean artwork. Original files are preserved, and removal can be undone in the import preview.

API credentials remain in the site's runtime secrets; no API key is included. Public source uses placeholder sample contact details. Existing AI reconstruction limitations documented in earlier releases still apply.
