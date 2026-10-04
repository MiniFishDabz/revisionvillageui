import { mkdir, rm, writeFile, appendFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const base = (process.env.UPSTREAM_BASE || 'https://git.pirateib.sh').replace(/\/$/, '');
const owner = process.env.UPSTREAM_OWNER || 'pirateIB';
const repo = process.env.UPSTREAM_NAME || 'village';
const ref = process.env.UPSTREAM_REF || 'master';
const root = path.resolve(process.cwd(), '.upstream');
const sourceRoot = path.join(root, 'src');
const apiRoot = `${base}/api/v1/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
const ua = `village-premium-sync/2.0 (${process.env.GITHUB_REPOSITORY || 'github-pages'})`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function request(url, { binary = false, retries = 3 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': ua,
          'Accept': binary ? 'application/octet-stream' : 'application/json'
        },
        redirect: 'follow'
      });

      if (res.ok) return binary ? Buffer.from(await res.arrayBuffer()) : await res.json();

      const body = (await res.text()).slice(0, 500).replace(/\s+/g, ' ');
      const message = `HTTP ${res.status} ${res.statusText} for ${url}${body ? ` — ${body}` : ''}`;
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw new Error(message);
    } catch (error) {
      lastError = error;
      if (attempt < retries && !(String(error).includes('HTTP 4'))) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

function encodeRepoPath(filePath) {
  return filePath.split('/').map(encodeURIComponent).join('/');
}

function looksLikeLfsPointer(buffer) {
  const head = buffer.subarray(0, 180).toString('utf8');
  return head.startsWith('version https://git-lfs.github.com/spec/v1');
}

async function listDirectory(repoPath) {
  const url = `${apiRoot}/contents/${encodeRepoPath(repoPath)}?ref=${encodeURIComponent(ref)}`;
  const data = await request(url);
  if (!Array.isArray(data)) throw new Error(`Expected a directory listing for ${repoPath}.`);

  const files = [];
  for (const item of data) {
    if (item.type === 'dir') files.push(...await listDirectory(item.path));
    else if (item.type === 'file') files.push(item.path);
  }
  return files;
}

async function downloadFile(repoPath) {
  // Gitea's /media endpoint returns the real LFS object for LFS-tracked files,
  // unlike archive/raw endpoints which may return only the tiny pointer file.
  const url = `${apiRoot}/media/${encodeRepoPath(repoPath)}?ref=${encodeURIComponent(ref)}`;
  const data = await request(url, { binary: true });
  if (looksLikeLfsPointer(data)) {
    throw new Error(`Gitea returned an LFS pointer instead of file contents for ${repoPath}.`);
  }

  const relative = repoPath.replace(/^src\/?/, '');
  const target = path.join(sourceRoot, relative);
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(target, data);
  return data.length;
}

async function main() {
  await rm(root, { recursive: true, force: true });
  await mkdir(sourceRoot, { recursive: true });

  console.log(`Reading ${owner}/${repo}@${ref} through the public Gitea API...`);
  const files = await listDirectory('src');
  console.log(`Found ${files.length} files in src/. Downloading LFS contents...`);

  let next = 0;
  let bytes = 0;
  const workers = Array.from({ length: Math.min(8, files.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= files.length) return;
      const file = files[i];
      const size = await downloadFile(file);
      bytes += size;
      if ((i + 1) % 20 === 0 || i + 1 === files.length) {
        console.log(`Downloaded ${Math.min(i + 1, files.length)}/${files.length} files...`);
      }
    }
  });
  await Promise.all(workers);

  // Commit metadata is nice-to-have; syncing itself does not depend on it.
  let commit = ref;
  try {
    const branch = await request(`${apiRoot}/branches/${encodeURIComponent(ref)}`);
    commit = branch?.commit?.id || branch?.commit?.sha || ref;
  } catch (error) {
    console.warn(`Could not read branch metadata: ${error.message}`);
  }

  if (process.env.GITHUB_ENV) {
    await appendFile(process.env.GITHUB_ENV, `UPSTREAM_COMMIT=${commit}\n`);
  }

  console.log(`Upstream sync complete: ${files.length} files, ${(bytes / 1024 / 1024).toFixed(1)} MiB.`);
  console.log(`Upstream revision: ${commit}`);
}

main().catch((error) => {
  console.error('\nUpstream sync failed.');
  console.error(error?.stack || error);
  console.error('\nThe PirateIB web UI can be public while Git smart-HTTP cloning is disabled.');
  console.error('This updater intentionally uses Gitea\'s public API + /media endpoint instead of git clone.');
  process.exit(1);
});
