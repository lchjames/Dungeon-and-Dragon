const execute = process.env.DND_ALPHA_EXECUTE === '1';

if (execute) {
  console.error('Status Effect Runtime production verification is intentionally plan-only in this slice. No credentialed D1 writes are automated.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-only',
    authority: 'status-effect-runtime-foundation',
    productionWrites: false,
    checks: [
      'GM-only approved Status Definitions are versioned and audited',
      'Runtime Character Status Instances snapshot Definition version/profile and never hard-delete',
      'NO_STACK, REFRESH_DURATION, EXTEND_DURATION, ADD_STACKS, KEEP_STRONGER and TAKE_LATEST lifecycle policies are supported',
      'explicit Status Round decrements finite counters and expires at zero; PERMANENT instances do not tick',
      'no resistance formula, damage/healing, control enforcement, Action/Move, MP, movement or Ability execution is performed'
    ]
  }, null, 2));
}
