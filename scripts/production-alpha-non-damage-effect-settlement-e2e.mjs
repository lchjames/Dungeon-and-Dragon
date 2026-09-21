const execute = process.env.DND_ALPHA_EXECUTE === '1';

if (execute) {
  console.error('Non-damage Effect Settlement production verification is intentionally plan-only in this slice. No credentialed D1 writes are automated.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-only',
    authority: 'non-damage-effect-settlement-authority',
    productionWrites: false,
    checks: [
      'one immutable Shared Opposed D100 audit produces at most one immutable settlement decision',
      'ordinary Result comparison preserves strict Source breakthrough and resistance tie priority',
      'Source raw 100 doubles only the future primary effect field when the original target actually receives the effect',
      'Source raw 1 requires GM deviation adjudication instead of an invented global SELF_TARGET rule',
      'Resistance Great markers never create automatic free buffs/counters or multiply the Source effect',
      '1-vs-1 double Great Failure applies the original effect at normal strength',
      'no Status, damage/healing, movement, Action/Move, MP or Ability execution is performed'
    ]
  }, null, 2));
}
