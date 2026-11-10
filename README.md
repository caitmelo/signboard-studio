# Stone Studio v67

Recognised fonts without a full available font now require an explicit choice: upload the matching font with a licensed-use confirmation, or approve the suggested closest bundled alternative. Existing original glyphs and positions are retained; the approved alternative supplies missing characters. Private-use icon meanings are never guessed.

The prompt appears during new imports and when reopening saved templates. Saving and downloading wait for unresolved font choices. Choices are persisted per template, including all pages. Font-file uploads, including fonts inside a package, require licence confirmation. Automatic free-font substitution has been removed.

Validation: TypeScript and production build; missing-font detection, alternative style selection, unchanged original glyphs and geometry, per-page choices, private font storage and persistence, server save guards, package licence checks, and existing package/font-library regression checks. Live browser verification was blocked by a browser-tool timeout while selecting the test PDF; it is not claimed as passed.

Assemble full source with `python releases/v67/prepare_source.py`. Customer files and credentials are excluded. Runtime API configuration is unchanged.

Live site: https://stone-edgewrap-studio.caitmelo.chatgpt.site
