const plan = {
  ok: true,
  mode: 'plan-only',
  component: 'ability-definition-grant-authority',
  writesProduction: false,
  steps: [
    'GM creates a classified Ability Definition.',
    'GM edits the Definition and verifies revision history.',
    'GM grants the Ability to a live test Character with source metadata.',
    'Retry the same Grant and verify idempotent=true with no duplicate acquisition.',
    'Player reads only acquired Abilities and sees nine-Attribute grouping.',
    'Verify usability changes with current Attribute Rank / Level data and remains separate from acquisition.',
    'Verify a legacy character_abilities row imports as PRIVATE + NEEDS_CLASSIFICATION and remains visible.',
    'Verify a locked DEAD Character rejects ordinary GM Grant.',
    'Verify no DELETE/ungrant endpoint exists in this Alpha slice.'
  ],
  note: 'This script intentionally performs no login and no D1-writing production automation. Live verification is operator-controlled.'
};

console.log(JSON.stringify(plan, null, 2));
