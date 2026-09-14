console.log(JSON.stringify({
  ok: true,
  mode: 'plan-only',
  component: 'element-progression-authority',
  writesProduction: false,
  steps: [
    'GM reads all nine Attribute Rank / progression rows for a live test Character.',
    'GM sets one Attribute Rank and progression EXP with source/reason metadata.',
    'Verify exactly one immutable progression audit row records from/to values and actor provenance.',
    'Verify the same acquired Ability changes usability immediately when its Attribute Rank gate becomes satisfied.',
    'Award positive progressionDelta and verify progression increases while Rank remains unchanged.',
    'Attempt a stale from-state write and verify ELEMENT_PROGRESSION_STALE rejects it without partial mutation.',
    'Verify Player Ability view reflects the updated Rank / progression but exposes no mutation route.',
    'Verify a locked DEAD Character rejects ordinary progression mutation.',
    'Verify no threshold table, automatic Rank promotion or per-cast progression reward is introduced.'
  ],
  note: 'This descriptor intentionally performs no login and no D1-writing production automation. Live verification is operator-controlled.'
}, null, 2));
