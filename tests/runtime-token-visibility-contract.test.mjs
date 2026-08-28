import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const gateway = await readFile(new URL('../src/runtime-visibility-gateway.js', import.meta.url), 'utf8');
const ui = await readFile(new URL('../public/assets/gm-runtime-map.js', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');

assert.match(wrangler, /^\s*"main"\s*:\s*"\.\/src\/runtime-visibility-gateway\.js"\s*,?\s*$/m);
assert.match(gateway, /runtime_entity_visibility_overrides/);
assert.match(gateway, /PRIMARY KEY \(position_id, viewer_user_id\)/);
assert.match(gateway, /SELF_VISIBILITY_ALWAYS_VISIBLE/);
assert.match(gateway, /runtimeTokenVisible\(/);
assert.match(gateway, /viewer_override/);
assert.match(gateway, /rebuildPlayerTokens/);
assert.ok(
  gateway.includes("pathname.match(/^\\/api\\/player\\/world\\/characters\\/([^/]+)(?:\\/.*)?$/)"),
  'Visibility gateway must intercept the Player world-character route family.'
);
assert.ok(
  gateway.includes("\\/visibility\\/([^/]+)$"),
  'Visibility gateway must expose the per-viewer visibility override route.'
);

assert.match(ui, /<h4>Token Visibility<\/h4>/);
assert.match(ui, /id="runtime-token-global"/);
assert.match(ui, /id="runtime-token-viewer"/);
assert.match(ui, /id="runtime-token-viewer-mode"/);
assert.match(ui, /value="inherit">inherit global/);
assert.match(ui, /saveGlobalVisibility/);
assert.match(ui, /saveViewerVisibility/);
assert.match(ui, /Own Character token is always visible to its owner/);
assert.match(ui, /visibility\/\$\{encodeURIComponent\(viewerUserId\)\}/);

console.log('Runtime token visibility integration contract passed.');
