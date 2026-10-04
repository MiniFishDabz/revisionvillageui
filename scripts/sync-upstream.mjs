import { mkdir, rm, writeFile, readFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(process.cwd(), '.upstream');
const sourceRoot = path.join(root, 'src');
const manifestPath = path.resolve(process.cwd(), 'scripts/upstream-files.json');
const ua = `village-premium-sync/3.0 (${process.env.GITHUB_REPOSITORY || 'github-pages'})`;
const origins = (process.env.UPSTREAM_SITE_ORIGINS || 'https://village.pirateib.su,https://village.pirateib.sh')
  .split(',')
  .map((s) => s.trim().replace(/\/$/, ''))
  .filter(Boolean);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function looksLikeHtml(buffer) {
  const head = buffer.subarray(0, 300).toString('utf8').toLowerCase();
  return head.includes('<!doctype html') || head.includes('<html');
}

function looksLikeCloudflare(buffer) {
  const head = buffer.subarray(0, 2000).toString('utf8').toLowerCase();
  return head.includes('just a moment') || head.includes('challenges.cloudflare.com') || head.includes('cf-chl-');
}

function looksLikeLfsPointer(buffer) {
  return buffer.subarray(0, 180).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1');
}

async function fetchBuffer(url, { retries = 2, allow404 = false } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': '*/*',
          'Cache-Control': 'no-cache'
        },
        redirect: 'follow'
      });

      if (allow404 && res.status === 404) return null;
      const data = Buffer.from(await res.arrayBuffer());

      if (res.ok) {
        if (looksLikeCloudflare(data)) throw new Error(`Cloudflare challenge returned for ${url}`);
        return data;
      }

      const body = data.subarray(0, 500).toString('utf8').replace(/\s+/g, ' ');
      const message = `HTTP ${res.status} ${res.statusText} for ${url}${body ? ` — ${body}` : ''}`;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new Error(message);
    } catch (error) {
      lastError = error;
      if (attempt < retries && !String(error).includes('HTTP 4')) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      break;
    }
  }
  throw lastError;
}

function discoverAssetNames(text) {
  const found = new Set();
  // Direct references used by the deployed app. This catches newly-added question
  // data files automatically when main.js names them explicitly.
  const patterns = [
    /(?:^|["'`(=:\s/])([A-Za-z0-9._-]+\.questionData\.js)(?=["'`)?,;&\s]|$)/g,
    /(?:^|["'`(=:\s/])([A-Za-z0-9._-]+\.(?:woff2?|ttf|otf|png|svg|webp|jpe?g))(?=["'`)?,;&\s]|$)/g
  ];
  for (const re of patterns) {
    for (const match of text.matchAll(re)) found.add(match[1]);
  }
  return found;
}

async function chooseOrigin() {
  const failures = [];
  for (const origin of origins) {
    try {
      const index = await fetchBuffer(`${origin}/index.html`);
      const main = await fetchBuffer(`${origin}/main.js`);
      if (looksLikeCloudflare(index) || looksLikeCloudflare(main)) throw new Error('Cloudflare challenge');
      if (looksLikeHtml(main)) throw new Error('main.js returned HTML instead of JavaScript');
      if (looksLikeLfsPointer(main)) throw new Error('main.js returned a Git LFS pointer');
      if (main.length < 1000) throw new Error(`main.js is suspiciously small (${main.length} bytes)`);
      return { origin, index, main };
    } catch (error) {
      failures.push(`${origin}: ${error.message}`);
    }
  }
  throw new Error(`None of the public Village site origins were usable:\n${failures.join('\n')}`);
}

async function saveFile(name, data) {
  const target = path.join(sourceRoot, name);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
}

async function main() {
  await rm(root, { recursive: true, force: true });
  await mkdir(sourceRoot, { recursive: true });

  console.log('The git/API host is Cloudflare-challenged from GitHub Actions.');
  console.log('Syncing from the public deployed Village site instead...');

  const { origin, index, main: mainJs } = await chooseOrigin();
  console.log(`Using upstream site origin: ${origin}`);

  await saveFile('index.html', index);
  await saveFile('main.js', mainJs);

  const seeded = JSON.parse(await readFile(manifestPath, 'utf8'));
  const names = new Set(seeded);
  names.delete('index.html');
  names.delete('main.js');

  const discovered = new Set([
    ...discoverAssetNames(index.toString('utf8')),
    ...discoverAssetNames(mainJs.toString('utf8'))
  ]);
  for (const name of discovered) names.add(name);

  console.log(`Seed manifest: ${seeded.length} files; discovered ${discovered.size} asset names in current app.`);
  console.log(`Downloading ${names.size} upstream assets from the deployed site...`);

  const queue = [...names];
  let next = 0;
  let downloaded = 2;
  let bytes = index.length + mainJs.length;
  const missing = [];

  const workers = Array.from({ length: Math.min(8, queue.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= queue.length) return;
      const name = queue[i];
      const url = `${origin}/${name.split('/').map(encodeURIComponent).join('/')}`;
      const data = await fetchBuffer(url, { allow404: true });
      if (!data) {
        missing.push(name);
        continue;
      }
      if (looksLikeCloudflare(data)) throw new Error(`Cloudflare challenge for asset ${name}`);
      if (looksLikeLfsPointer(data)) throw new Error(`Live site returned an LFS pointer for ${name}`);
      if (name.endsWith('.js') && looksLikeHtml(data)) throw new Error(`${name} returned HTML instead of JavaScript`);
      await saveFile(name, data);
      downloaded++;
      bytes += data.length;
      if ((i + 1) % 25 === 0 || i + 1 === queue.length) {
        console.log(`Checked ${Math.min(i + 1, queue.length)}/${queue.length} assets...`);
      }
    }
  });
  await Promise.all(workers);

  if (missing.length) {
    console.warn(`${missing.length} seeded/discovered assets were not present on the live site.`);
    console.warn(`First missing files: ${missing.slice(0, 12).join(', ')}`);
  }

  // Sanity-check that we got real question payloads, not just shell assets.
  const qNames = [...names].filter((n) => n.endsWith('.questionData.js') && !missing.includes(n));
  if (qNames.length === 0) throw new Error('No questionData.js files were downloaded; refusing to deploy.');

  const revision = `${origin}@${new Date().toISOString()}`;
  if (process.env.GITHUB_ENV) {
    await appendFile(process.env.GITHUB_ENV, `UPSTREAM_COMMIT=${revision}\n`);
    await appendFile(process.env.GITHUB_ENV, `UPSTREAM_ORIGIN=${origin}\n`);
  }

  console.log(`Upstream site sync complete: ${downloaded} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB.`);
  console.log(`Question payloads downloaded: ${qNames.length}`);
}

main().catch((error) => {
  console.error('\nUpstream sync failed.');
  console.error(error?.stack || error);
  console.error('\nThe Git/Forgejo endpoint is protected by a Cloudflare browser challenge, so GitHub Actions cannot use git clone or the API directly.');
  console.error('This version deliberately uses the public deployed Village site as the fallback source; it does not attempt to bypass Cloudflare.');
  process.exit(1);
});
