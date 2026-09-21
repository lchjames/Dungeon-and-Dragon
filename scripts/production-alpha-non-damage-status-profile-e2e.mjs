const execute = process.env.DND_ALPHA_EXECUTE === '1';

if (execute) {
  console.error('Non-damage Status Profile production verification is intentionally plan-only in this slice.');
  process.exitCode = 2;
} else {
  console.log(JSON.stringify({
    ok: true,
    mode: 'plan-only',
    authority: 'non-damage-status-application-profile',
    productionWrites: false,
    verifies: [
      'approved Status Definition version pinning',
      'single explicit primary effect field',
      'stale Definition detection',
      'immutable Profile revision audit',
      'no Runtime Status application'
    ]
  }, null, 2));
}
