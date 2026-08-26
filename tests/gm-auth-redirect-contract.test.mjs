import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';

const assetsDir = new URL('../public/assets/', import.meta.url);
const files = (await readdir(assetsDir))
  .filter(name => /^gm-.*\.js$/.test(name))
  .sort();

assert.ok(files.length > 0, 'Expected GM JavaScript assets.');

for (const name of files) {
  const source = await readFile(new URL(name, assetsDir), 'utf8');
  assert.doesNotMatch(
    source,
    /\/player\/login\//,
    `${name} must never route an expired GM/Admin session through Player login.`
  );
}

for (const name of [
  'gm-story.js',
  'gm-combat.js',
  'gm-monsters.js',
  'gm-monster-defence.js',
  'gm-bosses.js',
  'gm-d1.js',
  'gm-attack-profiles.js',
  'gm-runtime-map.js',
  'gm-runtime-doors.js',
  'gm-hostile-movement.js',
  'gm-combat-map-context.js'
]) {
  const source = await readFile(new URL(name, assetsDir), 'utf8');
  assert.match(source, /\/gm\/login\//, `${name} must route 401 sessions directly to GM/Admin login.`);
}

console.log(`GM auth redirect contract passed for ${files.length} GM assets.`);
