# Village Premium UI — auto-synced GitHub Pages build

This repo is deliberately split into **data/runtime** and **presentation**:

- The original `pirateIB/village` source is pulled fresh at build time.
- Its `main.js` and every `*.questionData.js` file are copied to the published site unchanged.
- This repo only injects `ui/premium.css`, `ui/theme-init.js`, and `ui/enhance.js`.
- A scheduled GitHub Action checks upstream nightly and redeploys automatically.

That means you never need to manually copy new questions when the source updates.

## Deploy on GitHub Pages

1. Create a new GitHub repository and put these files in it.
2. Push to the `main` branch.
3. In **Settings → Pages**, set **Source** to **GitHub Actions**.
4. Run **Actions → Sync upstream and deploy Pages → Run workflow** once, or just push a commit.
5. After that, the workflow checks for upstream updates every night.

If the upstream Git URL ever changes, add a GitHub Actions repository variable named `UPSTREAM_REPO` containing the new clone URL. No code changes are needed.

## What happens on every deployment

The workflow:

1. clones `https://git.pirateib.sh/pirateIB/village.git`;
2. downloads Git LFS objects;
3. copies the upstream `src/` folder to the Pages artifact;
4. injects the premium stylesheet/theme/enhancer;
5. publishes the result to GitHub Pages.

If upstream is temporarily offline, that run fails and GitHub Pages keeps serving the last successful deployment.

## Interactive answers

`ui/enhance.js` adds selectable MCQ choices, **Check answer**, feedback states, theme switching, and responsive layout on top of the existing upstream DOM.

For correctness, it first looks for a machine-readable answer already exposed by the upstream page. If needed, it invokes the existing Markscheme control and then reads the answer from the rendered solution. If an upstream question does not expose a parseable answer key, the UI deliberately says that the markscheme was revealed instead of guessing.

This is intentionally an adapter rather than a rewritten question database, so content changes upstream do not require hand-editing this project.

## Local build

A real local build requires the upstream Git LFS files:

```bash
git clone --depth 1 https://git.pirateib.sh/pirateIB/village.git .upstream
git -C .upstream lfs pull
node scripts/build-site.mjs
```

Then serve `dist/` with any static HTTP server.

## Files you normally edit

- `ui/premium.css` — visual design
- `ui/enhance.js` — UI behavior / answer interaction
- `ui/theme-init.js` — early theme initialization
- `.github/workflows/deploy-pages.yml` — sync/deploy cadence

Do **not** hardcode question content into these files.
