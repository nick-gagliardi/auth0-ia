import fs from 'node:fs/promises';
import path from 'node:path';

async function exists(p) {
  try {
    await fs.stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDir(from, to);
    } else if (e.isFile()) {
      await fs.copyFile(from, to);
    }
  }
}

const repoRoot = process.cwd();
const src = process.env.SRC_DIR || path.join(repoRoot, 'index');
const dest = process.env.DEST_DIR || path.join(repoRoot, 'apps/web/public/index');

if (!(await exists(src))) {
  console.error(`sync-index: source dir not found: ${src}`);
  process.exit(1);
}

await copyDir(src, dest);
console.log(`Synced index files: ${src} -> ${dest}`);
