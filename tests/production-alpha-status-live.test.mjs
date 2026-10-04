import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createServer } from 'node:http';
import { createHash, pbkdf2Sync, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import worker from '../src/inventory-weapon-gateway.js';
import { runStatusApplicationVerification } from '../scripts/production-alpha-status-application-live.mjs';

// This fixture serves the actual production gateway chain. It does not mock
// authentication, Character creation, D100, Settlement, Status or permissions.
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('PRAGMA foreign_keys=ON');
function statement(sql, values = []) {
  return {
    bind(...bindings) { return statement(sql, bindings); },
    async first(column) {
      const row = sqlite.prepare(sql).get(...values);
      return column ? row?.[column] ?? null : row || null;
    },
    async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
    async run() {
      const result = sqlite.prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
    }
  };
}
const env = { DB: {
  prepare: statement,
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const result = [];
      for (const item of statements) {
        // D1 batch results contain rows for SELECT/PRAGMA as well as write meta.
        // SQLite's all() executes either kind and leaves changes() available.
        const query = sqlite.prepare(item.sql);
        const rows = query.all(...item.values);
        result.push({ success: true, results: rows, meta: { changes: sqlite.prepare('SELECT changes() AS value').get().value } });
      }
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}, ASSETS: { fetch: async () => new Response('Not an API route', { status: 404 }) } };

// Expose SQL and bindings only to the local test adapter's batch method.
const makeStatement = statement;
env.DB.prepare = (sql, values = []) => ({
  ...makeStatement(sql, values), sql, values,
  bind(...bindings) { return env.DB.prepare(sql, bindings); }
});

let requests = 0, fetches = 0, failOpposedOn = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = (...args) => { fetches++; return realFetch(...args); };
const gmPassword = 'local-status-verification-only';
const server = createServer(async (incoming, outgoing) => {
  requests++;
  try {
    if (incoming.url === '/api/gm/basic-skill-opposed-checks' && incoming.method === 'POST' && failOpposedOn && --failOpposedOn === 0) {
      incoming.resume();
      outgoing.statusCode = 500;
      outgoing.setHeader('Content-Type', 'application/json');
      outgoing.end(JSON.stringify({ ok: false, error: { code: 'INJECTED_FAILURE' } }));
      return;
    }
    const chunks = [];
    for await (const chunk of incoming) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const request = new Request(`http://127.0.0.1:${server.address().port}${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      ...(body.length ? { body } : {})
    });
    const response = await worker.fetch(request, env);
    outgoing.statusCode = response.status;
    for (const [key, value] of response.headers) {
      if (key !== 'set-cookie') outgoing.setHeader(key, value);
    }
    const cookies = response.headers.getSetCookie();
    if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
    outgoing.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    outgoing.statusCode = 500;
    outgoing.setHeader('Content-Type', 'application/json');
    outgoing.end(JSON.stringify({ ok: false, error: { code: 'LOCAL_FIXTURE_ERROR', message: error.message } }));
  }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const baseUrl = `http://127.0.0.1:${server.address().port}`;
try {
  const plan = await runStatusApplicationVerification({ execute: false, baseUrl });
  assert.equal(plan.mode, 'plan-only');
  assert.equal(plan.productionWrites, false);
  assert.equal(fetches, 0, 'Plan-only must not make even an authentication request.');
  await assert.rejects(runStatusApplicationVerification({ execute: true, baseUrl, gmPassword: '' }), /required before any network request/);
  await assert.rejects(runStatusApplicationVerification({ execute: true, baseUrl: 'https://example.com', gmPassword }), /unapproved origin/);
  await assert.rejects(runStatusApplicationVerification({ execute: true, baseUrl, gmPassword }), /unapproved origin/);
  await assert.rejects(runStatusApplicationVerification({ execute: true, baseUrl: `${baseUrl}/?secret=test`, gmPassword, allowLocal: true }), /without credentials, path, query or fragment/);
  await assert.rejects(runStatusApplicationVerification({ execute: true, baseUrl, gmPassword, allowLocal: true, runLabel: 'invalid label' }), /Run label/);
  assert.equal(fetches, 0, 'Invalid configuration must fail before sending credentials.');
  const oldExecute = process.env.DND_ALPHA_EXECUTE, oldStatusExecute = process.env.DND_ALPHA_STATUS_EXECUTE;
  try {
    process.env.DND_ALPHA_EXECUTE = '1';
    delete process.env.DND_ALPHA_STATUS_EXECUTE;
    assert.equal((await runStatusApplicationVerification({ baseUrl })).mode, 'plan-only');
    assert.equal(fetches, 0, 'Generic Alpha execution must not enable Status writes.');
  } finally {
    if (oldExecute === undefined) delete process.env.DND_ALPHA_EXECUTE; else process.env.DND_ALPHA_EXECUTE = oldExecute;
    if (oldStatusExecute === undefined) delete process.env.DND_ALPHA_STATUS_EXECUTE; else process.env.DND_ALPHA_STATUS_EXECUTE = oldStatusExecute;
  }

  // Initialise the normal login schema, then seed an operator-assigned Admin
  // into this in-memory database only. No public provisioning path is used.
  const init = await worker.fetch(new Request(`${baseUrl}/api/admin/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'gm', password: gmPassword })
  }), env);
  assert.equal(init.status, 401);
  const salt = randomBytes(16);
  sqlite.prepare(`INSERT INTO users (
    id,username,display_name,password_hash,password_salt,password_iterations,role,status,created_at,updated_at
  ) VALUES ('local-admin',?,'gm',?,?,100000,'admin','active',?,?)`)
    .run(`a_${createHash('sha256').update('gm').digest('hex').slice(0, 24)}`,
      pbkdf2Sync(gmPassword, salt, 100000, 32, 'sha256').toString('base64'), salt.toString('base64'), Date.now(), Date.now());

  const result = await runStatusApplicationVerification({ execute: true, baseUrl, gmPassword, allowLocal: true });
  assert.equal(result.ok, true, JSON.stringify(result));
  assert.equal(result.mode, 'local-integration');
  assert.equal(result.productionWrites, false);
  assert.equal(result.checks.length, 8);
  assert.equal(result.characterIds.length, 2);
  assert.equal(result.cleanup.removedInstances.length, 2);
  assert.equal(result.cleanup.inactiveProfiles.length, 2);
  assert.equal(result.cleanup.inactiveDefinitions.length, 2);
  assert.equal(result.cleanup.closedSessions.length, 3);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM runtime_status_effects WHERE status='ACTIVE'").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM status_effect_definitions WHERE status='ACTIVE'").get().count, 0);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM non_damage_status_application_log').get().count, 3);
  assert(sqlite.prepare('SELECT COUNT(*) AS count FROM runtime_status_effect_audit').get().count > 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM users WHERE role='player'").get().count, 2);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM characters').get().count, 2);
  assert(requests > 40, 'The test must exercise the actual HTTP flow, not just plan output.');

  failOpposedOn = 2; // Interrupt after the first Runtime Status was committed.
  const interrupted = await runStatusApplicationVerification({ execute: true, baseUrl, gmPassword, allowLocal: true });
  assert.equal(interrupted.ok, false);
  assert.equal(interrupted.error.code, 'INJECTED_FAILURE');
  assert.notEqual(interrupted.runId, result.runId, 'A rerun must not adopt the previous namespace.');
  assert.equal(interrupted.cleanup.removedInstances.length, 1);
  assert.equal(interrupted.cleanup.inactiveProfiles.length, 2);
  assert.equal(interrupted.cleanup.inactiveDefinitions.length, 2);
  assert.equal(interrupted.cleanup.closedSessions.length, 3);
  assert.deepEqual(interrupted.cleanup.errors, []);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM runtime_status_effects WHERE status='ACTIVE'").get().count, 0);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM status_effect_definitions WHERE status='ACTIVE'").get().count, 0);

  sqlite.prepare(`INSERT INTO combats (id,status,created_by_user_id,started_at,updated_at)
    VALUES ('existing-combat','active','local-admin',?,?)`).run(Date.now(), Date.now());
  const refused = await runStatusApplicationVerification({ execute: true, baseUrl, gmPassword, allowLocal: true });
  assert.equal(refused.ok, false);
  assert.match(refused.error.message, /active Combat/);
  assert.equal(refused.characterIds.length, 0);
  assert.equal(refused.cleanup.closedSessions.length, 1);
  assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM characters').get().count, 4);
  assert.equal(sqlite.prepare("SELECT status FROM combats WHERE id='existing-combat'").get().status, 'active');

  const workflow = await readFile(new URL('../.github/workflows/production-alpha-status-live.yml', import.meta.url), 'utf8');
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /^  (push|pull_request|schedule):/m);
  assert.match(workflow, /confirm_production_writes == true/);
  assert.match(workflow, /github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /DND_ALPHA_STATUS_EXECUTE: '1'/);
  assert.match(workflow, /secrets\.DND_ALPHA_GM_PASSWORD/);
  assert.match(workflow, /group: dnd-production-alpha-live/);
  assert.match(workflow, /name: Show tested revision\n\s+run: \|\n\s+git log/);
  assert.doesNotMatch(workflow, /^\s+run: [^\n]*: /m, 'Commands containing colon-space need a YAML block scalar.');
  console.log('Status live-runner safety and real Worker HTTP/SQLite integration passed.');
} finally {
  globalThis.fetch = realFetch;
  await new Promise(resolve => server.close(resolve));
  sqlite.close();
}
