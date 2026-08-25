import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const workflow = await readFile(new URL('../.github/workflows/mvp-checks.yml', import.meta.url), 'utf8');
const wrangler = await readFile(new URL('../wrangler.jsonc', import.meta.url), 'utf8');
const releaseDoc = await readFile(new URL('../docs/PRODUCTION_RELEASE_ALPHA.md', import.meta.url), 'utf8');

// Production deployment must stay gated behind the existing MVP checks.
assert.match(workflow, /deploy-production:/);
assert.match(workflow, /needs:\s*node-checks/);
assert.match(workflow, /github\.event_name == 'push'/);
assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);

// Secrets are referenced by name only; their values must never live in source.
assert.match(workflow, /secrets\.CLOUDFLARE_API_TOKEN/);
assert.match(workflow, /secrets\.CLOUDFLARE_ACCOUNT_ID/);

// Keep Wrangler pinned to the supported major rather than relying on an unbounded latest install.
assert.match(workflow, /npx --yes wrangler@4 deploy/);
assert.match(workflow, /group:\s*cloudflare-production/);
assert.match(workflow, /cancel-in-progress:\s*false/);

// Production contract must remain pointed at the intended Worker / D1 / custom domain.
assert.match(wrangler, /"name"\s*:\s*"dnd"/);
assert.match(wrangler, /"main"\s*:\s*"\.\/src\/boss-defeat\.js"/);
assert.match(wrangler, /"binding"\s*:\s*"DB"/);
assert.match(wrangler, /"database_name"\s*:\s*"dnd-db"/);
assert.match(wrangler, /"database_id"\s*:\s*"7a9abf7b-5f87-4295-89b1-8187e991b782"/);
assert.match(wrangler, /"pattern"\s*:\s*"dungeon-and-dragon\.lchjames\.com"/);

// Operations docs must preserve the non-idempotent schema safety boundary.
assert.match(releaseDoc, /Do \*\*not\*\* blindly execute every file under `schema\/`/);
assert.match(releaseDoc, /Pull requests and feature-branch pushes must never deploy production/);
