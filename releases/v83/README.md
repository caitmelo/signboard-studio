# Stone Studio v83

Latest live site: https://stone-edgewrap-studio.caitmelo.chatgpt.site

This repository now includes the source changes through live version **83**.
Source commit: `3bfce6eb27389f13a45c2a0017afe79c2c906af0`.

## Get the current source

Run `python releases/v83/prepare_source.py` from a checkout of this repository.
It verifies the overlay hashes, assembles the existing v67 base, and writes
`signboard-studio-source-v83.zip`. Extract that archive, install dependencies,
and use the project's build instructions.

The root source/Python ZIPs and older release folders are historical base artifacts;
they are not the latest application on their own. The latest readable changes are
in `releases/v83/overlay/`.

## Included updates

- Restored Download HTML + CSS on new and saved templates. Downloads a ZIP with
  index.html, styles.css and offline instructions. The design remains embedded page
  images (not editable HTML text). ZIP integrity, stylesheet links, Unicode,
  TypeScript and production build checks passed.

- Identified fonts in Content, selected text-frame font details, licensed replacement uploads,
  saved-template font replacement, and frame selection in the saved-template preview.
- Targeted font/UI/geometry checks and TypeScript/production build passed.
  Browser click-testing was unavailable for v83.

- Approve saves template work, records accepted issues, then offers New template.
  The template creation screen no longer has a second Send off step.
- Browser drafts and approvals, signed-in account sync, clearer issue lists,
  page/frame review links, original/current comparison, and restored frame overlays.
- Standard paper/signboard size suggestions, visible template naming, and separate
  DL mailcard / A4 trifold-to-DL formats.
- Original text fitting, source-font handling, missing-font choices, layout fixes,
  and image-processing worker fixes.

TypeScript and production build passed for the live source. Focused regression checks
are included; see `releases/v83/overlay/FIX-VERIFICATION.md` for scope and remaining
verification limits. Not every customer PDF or full browser workflow has been retested.
Runtime API credentials are not included or changed by this GitHub update.
