const execute = process.env.DND_ALPHA_EXECUTE === '1';

if (execute) {
  console.error('Shared Opposed D100 production verification is intentionally plan-only in this slice. No credentialed D1 writes are automated.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-only',
    authority: 'shared-opposed-d100',
    productionWrites: false,
    checks: [
      'GM-only POST resolves two Character Basic Skill D100 checks in one authority call',
      'higher final Result wins; exact tie preserves resistance priority for negative-effect breakthrough',
      'raw 100/1 remain Great markers and never bypass Result comparison',
      'each raw-100 side independently records PENDING_BALANCE growth eligibility',
      'no damage, control, status, Action/Move, MP or Skill-value mutation is performed'
    ]
  }, null, 2));
}
