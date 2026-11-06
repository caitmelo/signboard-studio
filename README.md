# Stone Studio v61

Improves 6 x 4 ft signboard fitting: when a distinct full-sheet background layer is safely recognised, preserve its image, CMYK colours and blend overlays while extending it across the fitted canvas and bleed. Foreground photos, text and icons keep their proportions. Background images remain locked after fitting. Saved templates now offer 100–300% preview zoom without changing print size.

Validation: typecheck, production build, crop-mark checks, and a 6 x 4 signboard regression pass. Actual Python print export has a 1220 x 1832 mm final trim, 65 mm full-size bleed, 25% output and registration squares. Brochure source-to-prepared fixed artwork coordinates differ only by the intended 2 mm bleed; original headshot outlines in the supplied brochure are white. A magnified inspection corrected the v60 report: both gold phone icons are present in the signboard proof. The gold colour median before/after print conversion differed by one 8-bit red level in the checked sample.

Assemble with `python releases/v61/prepare_source.py`. This verifies and builds the v60 source in a temporary directory, then applies the eight readable v61 source files. Customer PDFs, credentials and test downloads are excluded. Existing saved copies remain available; the corrected signboard uses the user-confirmed 6 x 4 ft size.
