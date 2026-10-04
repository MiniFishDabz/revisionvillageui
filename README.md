# Village Premium UI

This is a static, GitHub-Pages-ready snapshot of Village with a separate UI enhancement layer.

## What stays untouched

- `main.js`
- every `*.questionData.js` file
- bundled fonts/assets used by the original runtime

The redesign lives only in:

- `index.html` (page shell)
- `ui/premium.css`
- `ui/theme-init.js`
- `ui/enhance.js`

## GitHub Pages

1. Put the **contents of this folder** in the root of your GitHub repository.
2. Go to **Settings → Pages**.
3. Set **Source** to **Deploy from a branch**.
4. Select **main** and **/(root)**, then Save.
5. Do not add a GitHub Actions workflow; this version is fully static.

Because the question files are stored in the repository itself, the site does not contact the PirateIB Git server to load question data.

## Updating the question snapshot later

If you obtain a newer fully-resolved Village checkout later, replace the original runtime/data files while keeping the `ui/` folder and the UI includes in `index.html`. The UI does not maintain a separate question database.
