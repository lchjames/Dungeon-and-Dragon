import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import {
  applySettlementStatusProfile,
  ensureNonDamageStatusApplicationAuthority
} from '../src/non-damage-status-application-authority.js';
import { createNonDamageStatusProfile } from '../src/non-damage-status-profile-authority.js';
import { resolveAndRecordOpposedD100 } from '../src/opposed-d100-authority.js';
import { recordNonDamageEffectSettlement } from '../src/non-damage-effect-settlement-authority.js';
import {
  advanceCharacterStatusRound,
  applyStatusEffectToCharacter,
  createStatusEffectDefinition,
  removeRuntimeStatusEffect,
  updateStatusEffectDefinition
} from '../src/status-effect-authority.js';

// Exercise the production authorities and their real SQL/triggers, with D1-shaped
// statements backed by SQLite. Fault injection stops only the application ledger
// finalization, after the canonical Runtime Status write has already committed.
const sqlite = new DatabaseSync(':memory:');
let failFinalization = false;
function statement(sql, values = []) {
  return {
    bind(...bindings) { return statement(sql, bindings); },
    async first() { return sqlite.prepare(sql).get(...values) || null; },
    async all() { return { success: true, results: sqlite.prepare(sql).all(...values) }; },
    async run() {
      if (failFinalization && sql.includes('application_status=?, runtime_status_effect_id=?') && sql.includes('AND lease_token=?')) {
        failFinalization = false;
        throw new Error('Injected ledger finalization failure');
      }
      const result = sqlite.prepare(sql).run(...values);
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  };
}
const env = { DB: {
  prepare: statement,
  async batch(statements) {
    sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const item of statements) results.push(await item.run());
      sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
} };

sqlite.exec(`
  PRAGMA foreign_keys=ON;
  CREATE TABLE users (id TEXT PRIMARY KEY);
  CREATE TABLE characters (id TEXT PRIMARY KEY, name TEXT NOT NULL, status TEXT NOT NULL);
  CREATE TABLE ability_definitions (id TEXT PRIMARY KEY);
  CREATE TABLE character_skills (
    id TEXT PRIMARY KEY, character_id TEXT NOT NULL, key TEXT NOT NULL,
    label TEXT NOT NULL, natural_value INTEGER NOT NULL, growth_progress INTEGER NOT NULL,
    FOREIGN KEY (character_id) REFERENCES characters(id)
  );
  INSERT INTO users VALUES ('gm');
  INSERT INTO characters VALUES ('source','施術者','active'), ('target','目標','active'), ('other','其他角色','active');
  INSERT INTO character_skills VALUES
    ('source-skill','source','persuasion','說服',80,0),
    ('target-skill','target','persuasion','說服',80,0);
`);
await ensureNonDamageStatusApplicationAuthority(env);

async function settlement({ sourceRawRoll = 90, resistanceRawRoll = 30 } = {}) {
  const { opposedCheck } = await resolveAndRecordOpposedD100(env, {
    source: { characterId: 'source', skillKey: 'persuasion', rawRoll: sourceRawRoll },
    resistance: { characterId: 'target', skillKey: 'persuasion', rawRoll: resistanceRawRoll },
    meaningfulReason: '驗證狀態套用中斷後的恢復'
  }, 'gm');
  const result = await recordNonDamageEffectSettlement(env, {
    opposedCheckId: opposedCheck.id, meaningfulReason: '確認非傷害效果結算'
  }, 'gm');
  return result.settlement;
}

async function profile(stackingRule, extra = {}) {
  const definition = await createStatusEffectDefinition(env, {
    canonicalNameZh: `恢復測試${stackingRule}`,
    category: 'OTHER', layers: ['BODY'], durationType: 'ROUNDS',
    defaultDurationRounds: 3, stackingRule,
    maxStacks: stackingRule === 'ADD_STACKS' ? 3 : null,
    strengthValue: 5, changeReason: '核准測試狀態', ...extra
  }, 'gm');
  const approvedProfile = await createNonDamageStatusProfile(env, {
    name: '恢復測試設定', statusDefinitionId: definition.id,
    primaryEffectField: 'DURATION_ROUNDS', changeReason: '核准套用設定'
  }, 'gm');
  return { definition, profile: approvedProfile };
}

async function interruptApplication(approvedProfile, committedSettlement) {
  const input = {
    settlementId: committedSettlement.id, profileId: approvedProfile.id,
    meaningfulReason: '依已提交的結算套用狀態'
  };
  failFinalization = true;
  await assert.rejects(applySettlementStatusProfile(env, input, 'gm'), /Injected ledger finalization failure/);
  const pending = sqlite.prepare('SELECT * FROM non_damage_status_application_log WHERE settlement_id=? AND profile_id=?')
    .get(input.settlementId, input.profileId);
  assert.equal(pending.application_status, 'PENDING');
  return { input, pending };
}

function runtimeState() {
  return {
    instances: sqlite.prepare('SELECT * FROM runtime_status_effects ORDER BY id').all(),
    audit: sqlite.prepare('SELECT * FROM runtime_status_effect_audit ORDER BY id').all()
  };
}

async function recover(input, expectedOperation, expectedInstanceId, expectedStatus = 'APPLIED') {
  const committedState = runtimeState();
  const recovered = await applySettlementStatusProfile(env, input, 'gm');
  assert.equal(recovered.idempotent, true);
  assert.equal(recovered.application.applicationStatus, expectedStatus);
  assert.equal(recovered.application.runtimeOperation, expectedOperation);
  assert.equal(recovered.application.runtimeStatusEffectId, expectedInstanceId);
  assert.deepEqual(runtimeState(), committedState, 'Recovery must not write another Runtime Status or audit event');
  const repeated = await applySettlementStatusProfile(env, input, 'gm');
  assert.deepEqual(repeated, recovered);
  assert.deepEqual(runtimeState(), committedState);
  const ledgerAudit = sqlite.prepare('SELECT application_status,runtime_operation FROM non_damage_status_application_audit WHERE application_id=? ORDER BY created_at,id')
    .all(recovered.application.id);
  assert.equal(ledgerAudit.filter(row => row.application_status === expectedStatus).length, 1);
  assert.equal(ledgerAudit.find(row => row.application_status === expectedStatus).runtime_operation, expectedOperation);
  return recovered;
}

try {
  // Great-success duration remains the committed doubled snapshot on retry,
  // even if the Definition changes after the Runtime application committed.
  const created = await profile('NO_STACK');
  const doubleSettlement = await settlement({ sourceRawRoll: 100 });
  assert.equal(doubleSettlement.primaryEffectMultiplier, 2);
  const createCrash = await interruptApplication(created.profile, doubleSettlement);
  const createdInstance = sqlite.prepare('SELECT * FROM runtime_status_effects WHERE definition_id=?').get(created.definition.id);
  assert.equal(createdInstance.remaining_rounds, 6);
  await updateStatusEffectDefinition(env, created.definition.id, {
    expectedVersion: created.definition.version, defaultDurationRounds: 9,
    changeReason: '後續核准新版狀態'
  }, 'gm');
  await recover(createCrash.input, 'CREATE', createdInstance.id);

  const cases = [
    ['NO_STACK', 'BLOCK', 'BLOCKED'],
    ['REFRESH_DURATION', 'REFRESH', 'APPLIED'],
    ['EXTEND_DURATION', 'EXTEND', 'APPLIED'],
    ['ADD_STACKS', 'STACK', 'APPLIED'],
    ['KEEP_STRONGER', 'REPLACE_STRONGER', 'APPLIED'],
    ['TAKE_LATEST', 'REPLACE_LATEST', 'APPLIED']
  ];
  for (const [policy, operation, applicationStatus] of cases) {
    const current = await profile(policy);
    const initialDefinition = policy === 'KEEP_STRONGER'
      ? (await profile('KEEP_STRONGER', { stackKey: current.definition.stackKey, strengthValue: 1 })).definition
      : current.definition;
    const initial = await applyStatusEffectToCharacter(env, 'target', {
      definitionId: initialDefinition.id, meaningfulReason: '先建立既有狀態'
    }, 'gm');
    const committedSettlement = await settlement();
    assert.equal(committedSettlement.originalTargetResolution, 'APPLIES');
    const crash = await interruptApplication(current.profile, committedSettlement);
    const active = sqlite.prepare("SELECT * FROM runtime_status_effects WHERE target_id='target' AND stack_key=? AND status='ACTIVE'")
      .get(current.definition.stackKey);
    if (operation.startsWith('REPLACE')) {
      assert.notEqual(active.id, initial.instance.id);
      assert.equal(sqlite.prepare('SELECT status FROM runtime_status_effects WHERE id=?').get(initial.instance.id).status, 'REPLACED');
      assert.equal(sqlite.prepare('SELECT COUNT(*) AS count FROM runtime_status_effect_audit WHERE instr(reason,?)>0')
        .get(`[ND_STATUS_APP:${crash.pending.id}]`).count, 2);
    }
    if (operation === 'EXTEND') assert.equal(active.remaining_rounds, 6);
    if (operation === 'STACK') assert.equal(active.stack_count, 2);
    await recover(crash.input, operation, active.id, applicationStatus);
  }

  // Free-form reasons can mention another application. Such an audit must not
  // override the authoritative Character/Definition identity being recovered.
  const scoped = await profile('NO_STACK');
  const scopedCrash = await interruptApplication(scoped.profile, await settlement());
  const scopedInstance = sqlite.prepare('SELECT id FROM runtime_status_effects WHERE definition_id=?').get(scoped.definition.id);
  const unrelated = await profile('NO_STACK');
  const marker = `[ND_STATUS_APP:${scopedCrash.pending.id}]`;
  await applyStatusEffectToCharacter(env, 'other', {
    definitionId: scoped.definition.id, meaningfulReason: `其他角色 ${marker}`
  }, 'gm');
  const wrongDefinition = await applyStatusEffectToCharacter(env, 'target', {
    definitionId: unrelated.definition.id, meaningfulReason: `其他狀態 ${marker}`
  }, 'gm');
  await applyStatusEffectToCharacter(env, 'target', {
    definitionId: unrelated.definition.id, meaningfulReason: `其他阻擋紀錄 ${marker}`
  }, 'gm');
  // Avoid relying on same-millisecond random audit ID order in the regression.
  sqlite.prepare(`INSERT INTO runtime_status_effect_audit (
    id,instance_id,definition_id,target_type,target_id,action,before_snapshot_json,after_snapshot_json,reason,actor_user_id,created_at
  ) VALUES ('unrelated-newest',?,?, 'CHARACTER','target','APPLY_BLOCKED',NULL,?,?,'gm',?)`)
    .run(wrongDefinition.instance.id, unrelated.definition.id, JSON.stringify({ status: 'ACTIVE' }), marker, Date.now() + 1000);
  await recover(scopedCrash.input, 'CREATE', scopedInstance.id);

  // A later tick/removal may legitimately quote the marker. Recovery still
  // reports the original application and never restores the removed Status.
  const lifecycle = await profile('NO_STACK');
  const lifecycleCrash = await interruptApplication(lifecycle.profile, await settlement());
  const lifecycleInstance = sqlite.prepare('SELECT id FROM runtime_status_effects WHERE definition_id=?').get(lifecycle.definition.id);
  const lifecycleMarker = `[ND_STATUS_APP:${lifecycleCrash.pending.id}]`;
  await advanceCharacterStatusRound(env, 'target', { meaningfulReason: `後續回合 ${lifecycleMarker}` }, 'gm');
  const tickAudit = sqlite.prepare("SELECT * FROM runtime_status_effect_audit WHERE instance_id=? AND action='TICK'")
    .get(lifecycleInstance.id);
  sqlite.prepare(`INSERT INTO runtime_status_effect_audit (
    id,instance_id,definition_id,target_type,target_id,action,before_snapshot_json,after_snapshot_json,reason,actor_user_id,created_at
  ) VALUES ('lifecycle-newest',?,?, 'CHARACTER','target','TICK',?,?,?,'gm',?)`)
    .run(tickAudit.instance_id, tickAudit.definition_id, tickAudit.before_snapshot_json,
      tickAudit.after_snapshot_json, tickAudit.reason, Date.now() + 2000);
  await removeRuntimeStatusEffect(env, lifecycleInstance.id, { meaningfulReason: `後續解除 ${lifecycleMarker}` }, 'gm');
  await recover(lifecycleCrash.input, 'CREATE', lifecycleInstance.id);
  assert.equal(sqlite.prepare('SELECT status FROM runtime_status_effects WHERE id=?').get(lifecycleInstance.id).status, 'REMOVED');

  console.log('Non-damage Status Application SQLite recovery passed (all application operations, retries, replacement selection and audit identity).');
} finally {
  sqlite.close();
}
