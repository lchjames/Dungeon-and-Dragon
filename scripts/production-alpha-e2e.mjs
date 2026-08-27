import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

function runComponent(label, relativePath) {
  const scriptPath = fileURLToPath(new URL(relativePath, import.meta.url));
  console.log(`\n=== ${label} ===`);
  const result = spawnSync(process.execPath, [scriptPath], {
    env: process.env,
    stdio: 'inherit'
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}.`);
  }
}

try {
  runComponent('Production Short Rest E2E', './production-alpha-rest-e2e.mjs');
  runComponent('Production Combat / Focus E2E', './production-alpha-combat-e2e.mjs');
  console.log(JSON.stringify({
    ok: true,
    suite: 'production-alpha-live',
    components: ['short-rest', 'combat-focus']
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    suite: 'production-alpha-live',
    error: error?.message || String(error)
  }, null, 2));
  process.exitCode = 1;
}
