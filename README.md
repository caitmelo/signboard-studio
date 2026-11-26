# Stone Studio v81

Latest live site: https://stone-edgewrap-studio.caitmelo.chatgpt.site

This repository now includes the source changes through live version **81**.
Source commit: `ff94fcb0d4d5b50fd99f02e950dbad21f2930ef7`.

## Get the current source

Run `python releases/v81/prepare_source.py` from a checkout of this repository.
It verifies the overlay hashes, assembles the existing v67 base, and writes
`signboard-studio-source-v81.zip`. Extract that archive, install dependencies,
and use the project's build instructions.

The root source/Python ZIPs and older release folders are historical base artifacts;
they are not the latest application on their own. The latest readable changes are
in `releases/v81/overlay/`.

## Included updates

- Approve saves template work, records accepted issues, then offers New template.
  The template creation screen no longer has a second Send off step.
- Browser drafts and approvals, signed-in account sync, clearer issue lists,
  page/frame review links, original/current comparison, and restored frame overlays.
- Standard paper/signboard size suggestions, visible template naming, and separate
  DL mailcard / A4 trifold-to-DL formats.
- Original text fitting, source-font handling, missing-font choices, layout fixes,
  and image-processing worker fixes.

TypeScript and production build passed for the live source. Focused regression checks
are included; see `releases/v81/overlay/FIX-VERIFICATION.md` for scope and remaining
verification limits. Not every customer PDF or full browser workflow has been retested.
Runtime API credentials are not included or changed by this GitHub update.
