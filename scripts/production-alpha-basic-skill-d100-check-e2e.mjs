const plan = {
  ok: true,
  mode: 'plan-only',
  component: 'basic-skill-d100-check-authority',
  writesProduction: false,
  steps: [
    'GM opens one Character and loads the canonical 23 Basic Skills plus recent immutable Basic Skill check audit.',
    'Resolve one server-generated D100 check with a meaningful reason and verify Result = roll - [100 - (natural skill + total modifier)].',
    'Resolve one GM-entry raw roll and verify roll_source is GM_ENTRY while the Character natural Skill value remains unchanged.',
    'Use raw 100 on a meaningful check and verify GREAT_SUCCESS plus exactly one PENDING_BALANCE growth-eligibility audit row.',
    'Verify the Great Success write does not change character_skills.growth_progress, use_growth_value, or natural_value.',
    'Use raw 1 and verify GREAT_FAILURE is stored separately from the numeric Result.',
    'Verify Player history is GET-only for the owned Character and omits GM context / actor provenance.',
    'Verify a character_locked death state blocks a new formal Basic Skill check.'
  ],
  note: 'This descriptor intentionally performs no login and no D1-writing production automation. It does not claim live Basic Skill mutation coverage or any growth-progress settlement.'
};

console.log(JSON.stringify(plan, null, 2));
