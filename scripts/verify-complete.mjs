/**
 * One-shot release gate: production build, full Vitest suite, all Playwright e2e specs.
 * Exit code 0 only if every step passes.
 */
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Windows: shell:true so PATH resolves npm.cmd; shell:false often yields null status / spawn errors. */
const spawnOpts = {
  cwd: root,
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, FORCE_COLOR: '1' },
};

function run(title, args) {
  console.log(`\n${'='.repeat(72)}\n  ${title}\n${'='.repeat(72)}\n`);
  const r = spawnSync('npm', args, spawnOpts);
  if (r.error) {
    console.error(`\n[verify-complete] FAILED: ${title}\n`, r.error);
    process.exit(1);
  }
  if (r.signal) {
    console.error(`\n[verify-complete] FAILED: ${title} (signal ${r.signal})\n`);
    process.exit(1);
  }
  if (r.status !== 0) {
    console.error(`\n[verify-complete] FAILED: ${title} (exit ${r.status ?? 1})\n`);
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
