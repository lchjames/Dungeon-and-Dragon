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
  runComponent('Production Long Rest / Combat Interruption E2E', './production-alpha-rest-extended-e2e.mjs');
  runComponent('Production Per-viewer Visibility E2E', './production-alpha-visibility-e2e.mjs');
  runComponent('Production Runtime Map Object Snapshot E2E', './production-alpha-runtime-map-objects-e2e.mjs');
  runComponent('Production Story Event E2E', './production-alpha-story-event-e2e.mjs');
  runComponent('Production Scene Run Start Story E2E', './production-alpha-story-scene-run-start-e2e.mjs');
  runComponent('Production Encounter Activated Story E2E', './production-alpha-story-encounter-activated-e2e.mjs');
  runComponent('Production Combat Started Story E2E', './production-alpha-story-combat-started-e2e.mjs');
  runComponent('Production Combat Ended Story E2E', './production-alpha-story-combat-ended-e2e.mjs');
  runComponent('Production Encounter Resolved Story E2E', './production-alpha-runtime-resolution-e2e.mjs');
  runComponent('Production Flag Changed Story E2E', './production-alpha-story-flag-changed-e2e.mjs');
  runComponent('Production Enter-zone Story Event E2E', './production-alpha-story-zone-e2e.mjs');
  runComponent('Production Runtime Encounter Spawn / Combat E2E', './production-alpha-runtime-encounter-e2e.mjs');
  runComponent('Production Player Zone → Story Spawn → Combat E2E', './production-alpha-story-combat-e2e.mjs');
  runComponent('Production Runtime Boss Spawn / Combat E2E', './production-alpha-runtime-boss-e2e.mjs');
  runComponent('Production Story Boss Spawn Retry E2E', './production-alpha-story-boss-e2e.mjs');
  runComponent('Production Combat / Focus E2E', './production-alpha-combat-e2e.mjs');
  console.log(JSON.stringify({
    ok: true,
    suite: 'production-alpha-live',
    components: [
      'short-rest',
      'long-rest-combat-interruption',
      'per-viewer-visibility',
      'runtime-map-objects',
      'story-event',
      'story-scene-run-start',
      'story-encounter-activated',
      'story-combat-started',
      'story-combat-ended',
      'runtime-encounter-resolution',
      'story-flag-changed',
      'story-enter-zone',
      'runtime-encounter-spawn-combat',
      'story-runtime-spawn-combat',
      'runtime-boss-spawn-combat',
      'story-runtime-spawn-boss-retry',
      'combat-focus'
    ]
  }, null, 2));
} catch (error) {
  console.error(JSON.stringify({
    ok: false,
    suite: 'production-alpha-live',
    error: error?.message || String(error)
  }, null, 2));
  process.exitCode = 1;
}
