# Stone Studio v60

Adds bundled free font fallbacks: Arimo for missing Helvetica characters, Yellowtail for SignPainter/HouseScript, and Noto Sans Symbols 2 for explicit Unicode telephone/envelope symbols. Existing embedded glyphs and their spacing remain unchanged. Proprietary private-use icon codes are not guessed.

Live browser verification: Listed and Sold mailcards and the brochure generated and downloaded PDF 1.3 print files after editing text with new characters and punctuation. Sold crop marks were enabled and verified in the downloaded PDF. Finished trim sizes remained 210 x 99 mm and 210 x 297 mm; edited text uses vector outlines. The saved signboard generated a 25% proof, but print remains blocked by unconfirmed bleed. Its missing phone icons are now reproduced; that issue and the reported gold ring colour difference remain unresolved. Exact original-to-output alignment was not reverified in this run.

Assemble with `python releases/v60/prepare_source.py`. This validates the existing v59 release plus the checksummed v60 update and produces `signboard-studio-source-v60.zip`. The base64 parts contain only 18 inspected source, free font, glyph and licence files; no customer PDFs, private uploaded fonts or credentials. Previous release files remain available.
