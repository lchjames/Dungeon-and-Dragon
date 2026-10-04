import assert from 'node:assert/strict';
import { createHash, randomBytes, randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const DEFAULT_BASE = 'https://dnd.apswsttss.workers.dev';
const PRODUCTION_HOSTS = new Set(['dnd.apswsttss.workers.dev', 'dungeon-and-dragon.lchjames.com']);
const EXPECTED_STATUS_KEYS = ['durationType', 'name', 'remainingRounds', 'stackCount', 'status'];

function trustedBase(value, allowLocal) {
  const url = new URL(value);
  assert(!url.username && !url.password && !url.search && !url.hash && url.pathname === '/', 'Base URL must be an origin without credentials, path, query or fragment.');
  const production = url.protocol === 'https:' && PRODUCTION_HOSTS.has(url.hostname) && !url.port;
  const local = allowLocal && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && ['http:', 'https:'].includes(url.protocol);
  assert(production || local, 'Refusing to send credentials to an unapproved origin.');
  return url.origin;
}

class Session {
  constructor(base, label) {
    this.base = base;
    this.label = label;
    this.cookies = new Map();
  }
  async request(path, { method = 'GET', body, expectedStatus } = {}) {
    assert(path.startsWith('/api/') && !path.includes('://'), 'Only fixed API paths are allowed.');
    const headers = { Accept: 'application/json', Origin: this.base };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([key, value]) => `${key}=${value}`).join('; ');
    // Never retry a production POST automatically: a lost response may follow
    // a committed write. Retrying the application is an explicit test below.
    const response = await fetch(`${this.base}${path}`, {
      method, headers, redirect: 'manual', signal: AbortSignal.timeout(30000),
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    for (const cookie of response.headers.getSetCookie()) {
      const first = cookie.split(';', 1)[0];
      const index = first.indexOf('=');
      if (index < 1) continue;
      const key = first.slice(0, index), value = first.slice(index + 1);
      if (value) this.cookies.set(key, value);
      else this.cookies.delete(key);
    }
    let payload;
    try { payload = await response.json(); } catch { payload = null; }
    const accepted = expectedStatus === undefined ? response.ok : response.status === expectedStatus;
    if (!accepted || !payload) {
      const error = new Error(`${this.label}: ${method} ${path} returned ${response.status} (${payload?.error?.code || 'INVALID_RESPONSE'}).`);
      error.code = payload?.error?.code || 'HTTP_ERROR';
      error.status = response.status;
      throw error;
    }
    if (response.ok) assert.equal(payload.ok, true, 'API response must confirm success.');
    return payload;
  }
}

function allocations(skills, pool) {
  assert.equal(skills?.length, 23, 'Exactly 23 Creation Skills are required.');
  assert.equal(pool, 200, 'The canonical Creation Skill pool must be 200.');
  let remaining = pool;
  const result = Object.fromEntries(skills.map(skill => {
    const points = Math.min(30, remaining);
    remaining -= points;
    return [skill.key, points];
  }));
  assert.equal(remaining, 0);
  return result;
}

async function createPlayerCharacter(session, runId, suffix) {
  const name = `${runId}-${suffix}`;
  const key = String(randomInt(1000, 10000));
  const digest = createHash('sha256').update(name.trim().normalize('NFKC').toLocaleLowerCase()).digest('hex');
  await session.request('/api/auth/register', {
    method: 'POST', body: { username: `u_${digest.slice(0, 24)}`, displayName: name, password: `dnd-key:${key}` }
  });
  const me = await session.request('/api/auth/me');
  assert.equal(me.user?.role, 'player');
  const rolled = await session.request('/api/player/character-creation/roll', { method: 'POST', body: {} });
  assert(rolled.draft?.id, 'Creation roll must return a Draft.');
  const created = await session.request('/api/player/characters', {
    method: 'POST', body: { name, summary: `${runId}: 狀態套用驗證角色`, draftId: rolled.draft.id }
  });
  assert(created.character?.id, 'Character creation must return an identity.');
  const path = `/api/player/characters/${encodeURIComponent(created.character.id)}`;
  const detail = await session.request(path);
  await session.request(`${path}/creation-skills`, {
    method: 'PATCH', body: { allocations: allocations(detail.character?.skills, Number(detail.character?.progression?.creationSkillPointsTotal)) }
  });
  await session.request(`${path}/finalize-creation`, { method: 'POST', body: {} });
  const final = (await session.request(path)).character;
  assert.equal(final.status, 'active');
  assert(Array.isArray(final.resources) && final.resources.some(item => item.key === 'HP') && final.resources.some(item => item.key === 'MP'));
  return final;
}

export async function runStatusApplicationVerification(options = {}) {
  const execute = options.execute ?? process.env.DND_ALPHA_STATUS_EXECUTE === '1';
  const requestedBase = options.baseUrl ?? process.env.DND_ALPHA_BASE_URL ?? DEFAULT_BASE;
  if (!execute) return {
    ok: true, mode: 'plan-only', productionWrites: false,
    component: 'status-application-live', baseUrl: requestedBase,
    activation: 'DND_ALPHA_STATUS_EXECUTE=1 plus DND_ALPHA_GM_PASSWORD; generic DND_ALPHA_EXECUTE does not activate this runner',
    checks: ['normal application', 'primary duration doubling', 'idempotent retry', 'stacking block',
      'blocked and unresolved Settlement rejection', 'stale Profile rejection', 'Player ownership and GET-only projection',
      'unchanged resources and Skills', 'scoped fixture retirement'],
    note: 'No authenticated live D1 coverage is claimed until this opt-in runner succeeds against production.'
  };

  const password = options.gmPassword ?? process.env.DND_ALPHA_GM_PASSWORD ?? '';
  assert(password, 'DND_ALPHA_GM_PASSWORD is required before any network request.');
  const base = trustedBase(requestedBase, options.allowLocal ?? process.env.DND_ALPHA_STATUS_ALLOW_LOCAL === '1');
  const username = options.gmUsername ?? process.env.DND_ALPHA_GM_USERNAME ?? 'gm';
  // A random suffix is always added, even to operator-supplied labels, so a
  // repeated dispatch never adopts or cleans an earlier run's fixtures.
  const label = options.runLabel ?? process.env.DND_ALPHA_STATUS_RUN_LABEL ?? 'status';
  assert(/^[A-Za-z0-9_-]{1,10}$/.test(label), 'Run label must contain 1–10 letters, digits, underscores or hyphens.');
  const runId = `alpha-${label}-${randomBytes(6).toString('hex')}`;
  const gm = new Session(base, 'GM'), sourcePlayer = new Session(base, 'Source Player'), targetPlayer = new Session(base, 'Target Player');
  const anonymous = new Session(base, 'Anonymous');
  const definitions = new Map(), profiles = new Map(), checked = [];
  let source, target, failure;
  const cleanup = { removedInstances: [], inactiveProfiles: [], inactiveDefinitions: [], closedSessions: [], errors: [] };
  const noteCheck = name => checked.push(name);
  const reason = description => `${runId}: ${description}`;
  const gmStatuses = character => gm.request(`/api/gm/characters/${encodeURIComponent(character.id)}/status-effects?includeHistory=true&auditLimit=200`);
  const applicationRows = async () => (await gm.request('/api/gm/non-damage-status-applications?limit=200')).applications;

  async function makeProfile(suffix) {
    const payload = await gm.request('/api/gm/status-effects/definitions', { method: 'POST', body: {
      canonicalNameZh: `驗證狀態-${runId}-${suffix}`, category: 'OTHER', layers: ['BODY'], durationType: 'ROUNDS',
      defaultDurationRounds: 3, stackingRule: 'NO_STACK', strengthValue: 7, effectProfile: { intensity: 5 },
      metadata: { productionAlphaStatusRun: runId }, changeReason: reason('建立驗證狀態')
    } });
    const definition = payload.definition;
    assert(definition?.id && definition.version === 1);
    definitions.set(definition.id, definition);
    const profile = (await gm.request('/api/gm/non-damage-status-profiles', { method: 'POST', body: {
      name: `${runId}-${suffix}`, statusDefinitionId: definition.id, primaryEffectField: 'DURATION_ROUNDS',
      metadata: { productionAlphaStatusRun: runId }, changeReason: reason('核准驗證套用設定')
    } })).profile;
    assert(profile?.id && profile.readiness?.ready);
    profiles.set(profile.id, profile);
    return { definition, profile };
  }

  async function settle(sourceRawRoll = 90, sourceModifier = 100, resistanceRawRoll = 30) {
    const opposed = (await gm.request('/api/gm/basic-skill-opposed-checks', { method: 'POST', body: {
      source: { characterId: source.id, skillKey: 'persuasion', rawRoll: sourceRawRoll, totalModifier: sourceModifier },
      resistance: { characterId: target.id, skillKey: 'persuasion', rawRoll: resistanceRawRoll, totalModifier: 0 },
      meaningfulReason: reason('驗證對抗判定'), context: { productionAlphaStatusRun: runId }
    } })).opposedCheck;
    assert(opposed?.id);
    return (await gm.request('/api/gm/non-damage-effect-settlements', { method: 'POST', body: {
      opposedCheckId: opposed.id, meaningfulReason: reason('驗證非傷害結算'), context: { productionAlphaStatusRun: runId }
    } })).settlement;
  }

  async function apply(settlement, profile, expectedStatus) {
    return gm.request('/api/gm/non-damage-status-applications', { method: 'POST', expectedStatus,
      body: { settlementId: settlement.id, profileId: profile.id, meaningfulReason: reason('驗證狀態套用') } });
  }

  async function assertRetry(settlement, profile, first) {
    const before = await gmStatuses(target);
    const retry = await apply(settlement, profile);
    assert.equal(retry.idempotent, true);
    assert.deepEqual(retry.application, first.application);
    assert.deepEqual(await gmStatuses(target), before, 'Retry must not mutate Runtime Status or append Runtime audit.');
    assert.equal((await applicationRows()).filter(row => row.settlementId === settlement.id && row.profileId === profile.id).length, 1);
  }

  try {
    await gm.request('/api/admin/auth/login', { method: 'POST', body: { username, password } });
    assert.equal((await gm.request('/api/admin/auth/me')).user?.role, 'admin');
    const combat = await gm.request('/api/gm/combat');
    assert.notEqual(combat.combat?.status, 'active', 'Refusing to create fixtures while an active Combat exists.');
    noteCheck('admin-login-and-no-active-combat');
    source = await createPlayerCharacter(sourcePlayer, runId, 's');
    target = await createPlayerCharacter(targetPlayer, runId, 't');
    assert.notEqual(source.id, target.id);
    const normal = await makeProfile('normal'), doubled = await makeProfile('double');

    const normalSettlement = await settle();
    assert.equal(normalSettlement.originalTargetResolution, 'APPLIES');
    assert.equal(normalSettlement.primaryEffectMultiplier, 1);
    const normalResult = await apply(normalSettlement, normal.profile);
    assert.equal(normalResult.idempotent, false);
    assert.equal(normalResult.application?.applicationStatus, 'APPLIED');
    assert.equal(normalResult.application.runtimeOperation, 'CREATE');
    let state = await gmStatuses(target);
    const initial = state.effects.find(item => item.id === normalResult.application.runtimeStatusEffectId);
    assert.equal(initial?.remainingRounds, 3);
    await assertRetry(normalSettlement, normal.profile, normalResult);
    noteCheck('normal-application-and-idempotent-retry');

    const doubleSettlement = await settle(100);
    assert.equal(doubleSettlement.primaryEffectMultiplier, 2);
    const doubleResult = await apply(doubleSettlement, doubled.profile);
    state = await gmStatuses(target);
    const doubleInstance = state.effects.find(item => item.id === doubleResult.application?.runtimeStatusEffectId);
    assert.equal(doubleInstance?.remainingRounds, 6);
    assert.equal(doubleInstance.strengthValue, 7);
    assert.deepEqual(doubleInstance.effectSnapshot.effectProfile, { intensity: 5 });
    assert.equal(doubleInstance.definitionVersion, doubled.definition.version);
    await assertRetry(doubleSettlement, doubled.profile, doubleResult);
    noteCheck('only-approved-duration-doubled');

    const stackingSettlement = await settle();
    const blocked = await apply(stackingSettlement, normal.profile);
    assert.equal(blocked.application?.applicationStatus, 'BLOCKED');
    assert.equal(blocked.application.runtimeOperation, 'BLOCK');
    assert.equal(blocked.application.runtimeStatusEffectId, initial.id);
    state = await gmStatuses(target);
    assert.deepEqual(state.effects.find(item => item.id === initial.id), initial);
    await assertRetry(stackingSettlement, normal.profile, blocked);
    noteCheck('stacking-block-and-idempotent-retry');

    for (const [settlement, resolution, code] of [
      [await settle(2, -200, 99), 'BLOCKED', 'NON_DAMAGE_STATUS_APPLICATION_SETTLEMENT_BLOCKED'],
      [await settle(1), 'GM_DECISION_REQUIRED', 'NON_DAMAGE_STATUS_APPLICATION_GM_DECISION_REQUIRED']
    ]) {
      assert.equal(settlement.originalTargetResolution, resolution);
      const before = await gmStatuses(target);
      assert.equal((await apply(settlement, normal.profile, 409)).error?.code, code);
      assert.equal((await applicationRows()).filter(row => row.settlementId === settlement.id).length, 0);
      assert.deepEqual(await gmStatuses(target), before);
    }
    noteCheck('blocked-and-unresolved-settlements-have-no-application');

    const revised = (await gm.request(`/api/gm/status-effects/definitions/${encodeURIComponent(doubled.definition.id)}`, {
      method: 'PATCH', body: { expectedVersion: doubled.definition.version, defaultDurationRounds: 4, changeReason: reason('驗證舊設定失效') }
    })).definition;
    assert.equal(revised?.version, 2);
    definitions.set(revised.id, revised);
    const staleSettlement = await settle();
    const beforeStale = await gmStatuses(target);
    assert.equal((await apply(staleSettlement, doubled.profile, 409)).error?.code, 'STATUS_DEFINITION_VERSION_STALE');
    assert.equal((await applicationRows()).filter(row => row.settlementId === staleSettlement.id).length, 0);
    assert.deepEqual(await gmStatuses(target), beforeStale);
    noteCheck('stale-profile-fails-without-runtime-write');

    const targetPath = `/api/player/characters/${encodeURIComponent(target.id)}/status-effects`;
    const projection = await targetPlayer.request(targetPath);
    assert.equal(projection.statusEffects?.length, 2);
    for (const status of projection.statusEffects) {
      assert.deepEqual(Object.keys(status).sort(), EXPECTED_STATUS_KEYS);
      assert.equal(status.status, 'ACTIVE');
    }
    await sourcePlayer.request(targetPath, { expectedStatus: 403 });
    await anonymous.request(targetPath, { expectedStatus: 401 });
    for (const method of ['POST', 'PATCH', 'PUT', 'DELETE']) {
      await targetPlayer.request(targetPath, { method, body: {}, expectedStatus: 405 });
    }
    await targetPlayer.request('/api/gm/non-damage-status-applications', {
      method: 'POST', expectedStatus: 403, body: { settlementId: normalSettlement.id, profileId: normal.profile.id, meaningfulReason: reason('玩家不可套用') }
    });
    assert.deepEqual(await gmStatuses(target), beforeStale);
    noteCheck('player-ownership-get-only-and-projection-allowlist');

    for (const [player, before] of [[sourcePlayer, source], [targetPlayer, target]]) {
      const after = (await player.request(`/api/player/characters/${encodeURIComponent(before.id)}`)).character;
      assert.deepEqual(after.resources, before.resources, 'Status verification must not change HP/MP.');
      assert.deepEqual(after.skills, before.skills, 'Opposed checks must not settle Skill growth.');
    }
    noteCheck('resources-and-skills-unchanged');
  } catch (error) {
    failure = error;
  } finally {
    // Only this invocation's newly created identities are retired. Immutable
    // audits, test accounts and Characters are deliberately retained.
    const retire = async (label, action) => {
      try { await action(); }
      catch (error) { cleanup.errors.push({ fixture: label, code: error.code || 'CLEANUP_FAILED' }); }
    };
    if (target && definitions.size) await retire('runtime-instances', async () => {
      const state = await gmStatuses(target);
      for (const instance of state.effects) {
        if (instance.status !== 'ACTIVE' || !definitions.has(instance.definitionId) || instance.targetId !== target.id) continue;
        await retire(instance.id, async () => {
          await gm.request(`/api/gm/status-effects/instances/${encodeURIComponent(instance.id)}/remove`, {
            method: 'POST', body: { meaningfulReason: reason('驗證完畢，解除測試狀態') }
          });
          cleanup.removedInstances.push(instance.id);
        });
      }
    });
    for (const profile of profiles.values()) await retire(profile.id, async () => {
      await gm.request(`/api/gm/non-damage-status-profiles/${encodeURIComponent(profile.id)}`, {
        method: 'PATCH', body: { expectedVersion: profile.version, status: 'INACTIVE', changeReason: reason('停用本次驗證設定') }
      });
      cleanup.inactiveProfiles.push(profile.id);
    });
    for (const definition of definitions.values()) await retire(definition.id, async () => {
      await gm.request(`/api/gm/status-effects/definitions/${encodeURIComponent(definition.id)}`, {
        method: 'PATCH', body: { expectedVersion: definition.version, status: 'INACTIVE', changeReason: reason('停用本次驗證狀態') }
      });
      cleanup.inactiveDefinitions.push(definition.id);
    });
    for (const [session, path] of [[sourcePlayer, '/api/auth/logout'], [targetPlayer, '/api/auth/logout'], [gm, '/api/admin/auth/logout']]) {
      if (!session.cookies.size) continue;
      await retire(`${session.label}-session`, async () => {
        await session.request(path, { method: 'POST', body: {} });
        cleanup.closedSessions.push(session.label);
      });
    }
  }

  const result = {
    ok: !failure && cleanup.errors.length === 0,
    mode: PRODUCTION_HOSTS.has(new URL(base).hostname) ? 'production-live' : 'local-integration',
    productionWrites: PRODUCTION_HOSTS.has(new URL(base).hostname), runId,
    characterIds: [source?.id, target?.id].filter(Boolean), checks: checked, cleanup,
    retainedFixtures: 'Test Players, Characters and immutable audit rows remain under the unique run namespace.'
  };
  if (failure) result.error = { code: failure.code || 'VERIFICATION_FAILED', message: failure.message };
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = await runStatusApplicationVerification();
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    // Never print credentials, request bodies, cookies or raw response payloads.
    console.error(JSON.stringify({ ok: false, code: error.code || 'STATUS_LIVE_RUNNER_ERROR', message: error.message }));
    process.exitCode = 1;
  }
}
