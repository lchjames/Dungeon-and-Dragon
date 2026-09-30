const execute = process.env.DND_ALPHA_EXECUTE === '1';

if (execute) {
  console.error('Player Status Visibility production verification is intentionally plan-only. No authenticated production session is automated.');
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-only',
    authority: 'player-status-visibility',
    productionWrites: false,
    checks: [
      'Player route is GET-only and owner-scoped',
      'only active Runtime Status conditions are projected',
      'projection excludes GM reason, actor, source context, effect snapshot and audit history',
      'Combat UI shows Player-owned Character Status name, duration and stack count',
      'no Status lifecycle, resource, Action/Move or Ability mutation is introduced'
    ]
  }, null, 2));
}
