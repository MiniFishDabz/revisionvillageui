import { cp, mkdir, readFile, rm, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const upstreamDir = path.resolve(root, process.env.UPSTREAM_DIR || '.upstream/src');
const outDir = path.resolve(root, process.env.OUT_DIR || 'dist');
const uiDir = path.resolve(root, 'ui');

async function exists(file) {
  try { await access(file); return true; } catch { return false; }
}

const indexPath = path.join(upstreamDir, 'index.html');
const mainPath = path.join(upstreamDir, 'main.js');

if (!(await exists(indexPath)) || !(await exists(mainPath))) {
  throw new Error(`Expected upstream deployable files at ${upstreamDir}. Missing index.html or main.js.`);
}

const mainHead = (await readFile(mainPath, 'utf8')).slice(0, 200);
if (mainHead.includes('git-lfs.github.com/spec/v1')) {
  throw new Error('main.js is still a Git LFS pointer. Run `git lfs pull` in the upstream clone before building.');
}

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await cp(upstreamDir, outDir, { recursive: true });
await mkdir(path.join(outDir, 'premium-ui'), { recursive: true });
await cp(uiDir, path.join(outDir, 'premium-ui'), { recursive: true });

let html = await readFile(path.join(outDir, 'index.html'), 'utf8');

const headInjection = `\n  <!-- Premium UI: presentation only; upstream question data remains untouched -->\n  <meta name="color-scheme" content="dark light">\n  <script src="./premium-ui/theme-init.js"></script>\n  <link rel="stylesheet" href="./premium-ui/premium.css">\n`;
const bodyInjection = `\n  <script src="./premium-ui/enhance.js"></script>\n`;

if (!html.includes('./premium-ui/premium.css')) {
  html = html.replace(/<\/head>/i, `${headInjection}</head>`);
}
if (!html.includes('./premium-ui/enhance.js')) {
  html = html.replace(/<\/body>/i, `${bodyInjection}</body>`);
}

// GitHub project Pages lives under /repo-name/. Make the one known absolute
// asset path in the upstream HTML relative so it works both there and on a custom domain.
html = html.replace(/href=["']\/favicon\.png["']/gi, 'href="./favicon.png"');

await writeFile(path.join(outDir, 'index.html'), html);
await writeFile(path.join(outDir, '.nojekyll'), '');

const commit = process.env.UPSTREAM_COMMIT || 'unknown';
await writeFile(path.join(outDir, 'upstream-version.json'), JSON.stringify({
  source: process.env.UPSTREAM_REPO || 'https://git.pirateib.sh/pirateIB/village.git',
  commit,
  builtAt: new Date().toISOString()
}, null, 2));

console.log(`Built ${outDir}`);
console.log(`Upstream commit: ${commit}`);
