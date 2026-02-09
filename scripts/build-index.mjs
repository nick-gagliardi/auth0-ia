import { buildIndex } from '../packages/indexer/dist/index.js';

const repoUrl = process.env.DOCS_REPO_URL || 'https://github.com/auth0/docs-v2.git';
const ref = process.env.DOCS_REPO_REF || 'main';
const workdir = process.env.WORKDIR || '.work/docs-v2';
const outDir = process.env.OUT_DIR || 'index';

await buildIndex({ repoUrl, ref, workdir, outDir });
console.log(`Index written to ${outDir}`);
