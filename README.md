# Signboard Studio — v52

Latest source: `releases/v52`. Run `python releases/v52/prepare_source.py` from this repository to assemble the complete updated source ZIP from the v49 base and cumulative overlay. Root ZIPs and the separate Python implementation are older releases.

Path B automatically reconstructs pages dominated by unnamed Type 3 fonts, including Bundeena pages 1 and 3. Normal PDF import remains unchanged. Image-only pages stay intact. The current import session offers comparison with the original. Recognition requires the existing OPENAI_API_KEY site secret. Reconstructed fonts/crops and wording require review; preview crops should be replaced with original high-resolution images for professional printing. This is a conservative detector, not a universal detector of every malformed PDF.

TypeScript, production build, routing on the supplied PDFs, clean-route byte identity, and unavailable-recognition handling passed. Full live AI reconstruction and visual accuracy comparison remain unverified.

Test site: https://stone-edgewrap-studio.caitmelo.chatgpt.site/
