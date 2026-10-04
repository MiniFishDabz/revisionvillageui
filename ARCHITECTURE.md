# Architecture

## Goal

Keep the question source authoritative while allowing a completely separate front-end skin.

```text
pirateIB/village.git
        │
        │ nightly / manual / on push
        ▼
GitHub Actions runner
        │
        ├── git clone + git lfs pull
        ├── copy upstream/src/ → dist/
        ├── inject premium-ui assets into index.html
        └── upload dist/ to GitHub Pages
                    │
                    ▼
           Static GitHub Pages site
```

The deployed files still contain the exact upstream `main.js` and `*.questionData.js` files from that build. The premium layer does not maintain a second question database.

## Why build-time sync instead of browser-time fetch

Fetching the source from `git.pirateib.sh` in visitors' browsers would depend on that server's CORS policy and uptime on every page load. Build-time sync avoids CORS entirely and keeps the published site fast and self-contained.

## Failure behavior

A scheduled run that cannot reach upstream fails before deploying. GitHub Pages therefore continues to serve the last known-good build.

## Upstream compatibility

The UI relies mainly on the existing stable classes seen in the source (`.question`, `.questionLeft`, `.questionRight`, `.calculator`, `.markscheme`, `#navBar`, `#mainContent`). A `MutationObserver` reapplies enhancements after hash-route navigation.

If upstream eventually changes those DOM class names, the data still syncs correctly; only the adapter selectors in `ui/enhance.js` / `ui/premium.css` may need adjustment.
