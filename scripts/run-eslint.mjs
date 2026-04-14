import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const eslintJs = path.join(root, 'node_modules', 'eslint', 'bin', 'eslint.js');

if (!existsSync(eslintJs)) {
  console.error('ESLint is not installed (missing node_modules/eslint). Run: npm install');
  process.exit(1);
}

const args = process.argv.slice(2);
const r = spawnSync(process.execPath, [eslintJs, ...(args.length ? args : ['.'])], {
  stdio: 'inherit',
  cwd: root,
  env: process.env,
});
process.exit(r.status === null ? 1 : r.status);
