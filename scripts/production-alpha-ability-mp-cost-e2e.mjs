const plan = {
  ok: true,
  mode: 'plan-only',
  component: 'ability-mp-cost-authority',
  writesProduction: false,
  steps: [
    'GM creates a classified Rank Ability with an explicit approved positive integer MP cost.',
    'Verify the Definition returns approved mpCost plus the canonical Rank referenceMpCost without replacing the approved value.',
    'GM creates or edits a SPECIAL Ability with an explicit approved MP cost and verifies SPECIAL has no Rank reference cost.',
    'Verify an older classified Ability without a resource profile remains PENDING rather than receiving an automatic Rank-reference backfill.',
    'Verify Definition revision history captures the approved MP cost when GM edits the Ability.',
    'Grant the Ability to a test Character and read current/max MP plus read-only activationResource affordability.',
    'Verify affordability changes when current MP crosses the approved cost while Ability qualification remains a separate usability result.',
    'Verify this slice exposes no Ability cast/activate endpoint and does not spend MP or Combat Action.'
  ],
  note: 'This descriptor intentionally performs no login and no D1-writing production automation. It does not claim Ability combat execution coverage.'
};

console.log(JSON.stringify(plan, null, 2));
