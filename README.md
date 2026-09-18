# Signboard Studio

Developer handoff of the Studio source at commit `11c3daaf2c76eb650ae215020b43f70da4bd0de2`.

- **signboard-studio-source.zip**: full tracked web application source, Python source, fonts, assets, tests and build scripts. Extract this archive for development. The standalone Python ZIP is supplied separately to avoid duplication; place it at `public/downloads/signboard-studio-python.zip` if serving that download from the web app.
- **signboard-studio-python.zip**: packaged Python application with its frontend and setup instructions. Extract and follow its README for local testing and deployment.

Public test site: https://stone-edgewrap-studio.caitmelo.chatgpt.site

## Status

This is a source snapshot and developer package, not an automatic ongoing sync with the hosted site. The source archive contains the project README and Python integration documentation. No credentials are included.

The optional Start from a file AI draft feature requires a server-side OPENAI_API_KEY. That key is not configured on the current test site, so live AI draft generation remains unavailable there. Build and selected PDF checks passed; a complete browser end-to-end test has not been completed.
