const execute = process.env.DND_ALPHA_EXECUTE === '1';

if (execute) {
  console.error('Non-damage Status Application production verification is intentionally plan-only in this slice. No credentialed D1 writes are automated.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-only',
    authority: 'non-damage-status-application-adapter',
    productionWrites: false,
    checks: [
      'only APPLIES settlements without GM deviation adjudication may reach Runtime Status authority',
      'BLOCKED and GM_DECISION_REQUIRED settlements are rejected before an application ledger row is created',
      'READY Profile pins Status Definition version and one approved primary effect field',
      'Settlement multiplier changes only that approved primary field',
      'Status stacking and Runtime audit remain owned by the existing Status Effect authority',
      'Settlement + Profile application identity is idempotent with lease and audit-marker crash reconciliation',
      'no direct damage/healing, HP/MP, Action/Move, movement, Skill growth or Ability execution is performed'
    ]
  }, null, 2));
}
