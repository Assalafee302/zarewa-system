/**
 * One-shot release gate: production build, full Vitest suite, all Playwright e2e specs.
 * Exit code 0 only if every step passes.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

function run(title, args) {
  console.log(`\n${'='.repeat(72)}\n  ${title}\n${'='.repeat(72)}\n`);
  const r = spawnSync(npm, args, {
    cwd: root,
    stdio: 'inherit',
    shell: false,
    env: { ...process.env, FORCE_COLOR: '1' },
  });
  if (r.status !== 0) {
    console.error(`\n[verify-complete] FAILED: ${title} (exit ${r.status ?? 'unknown'})\n`);
    process.exit(r.status ?? 1);
  }
}

run('Production build', ['run', 'build']);
run('Full test suite (Vitest)', ['run', 'test']);
run('End-to-end (Playwright, all e2e/)', ['run', 'test:e2e']);

console.log(`
${'*'.repeat(72)}
  ZAREWA VERIFY COMPLETE — all gates passed (build + vitest + playwright)
${'*'.repeat(72)}
`);
