# Magic Reference & AI-Created Skill System — Alpha

> Status: Alpha structural specification.
> Purpose: define the elemental magic framework, Rank 1–9 reference magic, and the workflow for Player-created Skills/Spells balanced by AI against canonical reference data.

---

# 1. Element Framework

Alpha uses **seven natural elements plus Light and Dark**.

Seven natural elements:

```text
FIRE
WATER
ICE
WIND
EARTH
LIGHTNING
NATURE
```

Metaphysical/polar elements:

```text
LIGHT
DARK
```

This gives nine magic families without forcing Light/Dark into the seven-natural-element set.

The elemental families are classification/affinity systems, not rigid spell lists.

---

# 2. Magic Rank

Magic uses Rank 1 through Rank 9.

```text
Rank 1
Rank 2
Rank 3
Rank 4
Rank 5
Rank 6
Rank 7
Rank 8
Rank 9
```

A Rank represents a broad power budget and complexity ceiling rather than one mandatory spell.

Higher Rank may permit larger values in combinations of:

- raw damage;
- number of targets;
- area;
- range;
- duration;
- control strength;
- defensive value;
- healing;
- summons;
- terrain manipulation;
- status effects;
- secondary effects;
- resource efficiency;
- rule-breaking/special properties.

The exact numeric budget per Rank remains Alpha-tunable.

---

# 3. Reference Magic Matrix

The system contains a canonical **Reference Magic Matrix**.

Conceptually:

```text
Element × Rank × Role
```

Each reference Spell is a benchmark, not a restriction on what Players may learn or create.

Example:

```text
FIRE / Rank 1 / Basic Offensive
Reference: Fireball
```

The reference entry defines a known-balanced package such as:

```text
Rank
Element
Role
Check Source
Source Bonus
Damage Formula
Damage Type
Target Count
Range
Area
MP Cost
Duration
Secondary Effects
Restrictions
```

AI uses these reference entries to estimate appropriate values for custom Player-created Skills/Spells.

---

# 4. Elemental Identity

Reference Spells at the same Rank should have similar total power budgets but may express that budget differently.

Illustrative Rank-1 offensive references:

```text
FIRE       Fireball        direct damage / burn tendency
WATER      Water Shot      damage / push / wet tendency
ICE        Ice Shard       damage / slow tendency
WIND       Wind Blade      damage / range / displacement tendency
EARTH      Stone Bullet    damage / impact / stagger tendency
LIGHTNING  Spark Bolt      damage / interrupt tendency
NATURE     Thorn Shot      damage / bind/bleed tendency
LIGHT      Light Lance     damage / purification/anti-dark tendency
DARK       Shadow Bolt     damage / weakening/anti-light tendency
```

The exact names and numbers are Alpha content, not structural rules.

A secondary effect is not automatically free. If one Spell receives stronger control, area, duration or utility than its peers, its damage/cost/other values should be adjusted so the total package remains inside the Rank budget.

---

# 5. Rank Reference Ladder

For Alpha, use this broad reference intent:

```text
Rank 1  Basic spell / simple single-target effect
Rank 2  Improved basic spell / minor utility or control
Rank 3  Stronger attack / small-area effect / stronger support
Rank 4  Persistent effect / meaningful defence / stronger control
Rank 5  Major combat technique / battlefield influence
Rank 6  Large-area or high-impact advanced magic
Rank 7  Major battlefield control / powerful summon / domain-like effect
Rank 8  Extreme high-tier magic / large-scale transformation or destruction
Rank 9  Ultimate/legendary magic with severe cost, limits or prerequisites
```

These descriptions guide AI and GM review. Exact numerical ceilings remain configurable.

---

# 6. Player-Created Skill / Spell Workflow

Players may propose original Skills/Spells rather than being limited to the Reference Magic Matrix.

Player supplies primarily creative intent:

```text
Name
Element
Description / fantasy
Desired effect(s)
Optional target/range/area concept
Optional intended Rank if allowed
```

Example:

```text
Name: Firestorm
Element: FIRE
Description:
Create a violent rotating storm of flame around a target area,
burning multiple enemies over time.
```

The Player does not directly choose authoritative damage, MP cost, bonuses or control numbers.

---

# 7. AI Balancer Role

AI receives:

- proposed Skill/Spell name and description;
- selected Element;
- Character Magic Rank / accessible Rank ceiling;
- relevant Character Skills;
- canonical Reference Magic Matrix;
- current Rank-budget rules;
- current Alpha damage scale;
- allowed effect vocabulary;
- existing similar Skills/Spells;
- Campaign restrictions.

AI returns a **structured mechanical proposal**.

Example:

```text
Firestorm
Element: FIRE
Suggested Rank: 4
Role: Area / Damage-over-Time
Uses Skill: Fire Magic
Source Bonus: +0
Range: 30 m
Area: 6 m radius
Duration: 3 rounds
Damage: 1D6 Fire per round
MP Cost: 12
Secondary Effect: Burn chance
Restrictions: concentration / one active Firestorm
```

AI must also return a short comparison such as:

```text
Reference comparison:
- stronger area and duration than Rank-3 Fire references;
- lower immediate burst than Rank-4 direct-damage references;
- increased MP cost compensates for repeated area damage.
```

The explanation is for GM/Player transparency; the structured fields are what the rules engine uses.

---

# 8. AI Must Not Invent Power Without Reference Constraints

AI is a **balancer and translator**, not an unrestricted rules authority.

Bad workflow:

```text
Player: "Firestorm that destroys everything"
AI: 20D100 damage because it sounds powerful
```

Required workflow:

```text
Creative intent
      ↓
Determine closest Element / Role / Rank references
      ↓
Estimate total effect budget
      ↓
Trade damage against area/range/control/duration/cost
      ↓
Return bounded structured proposal
```

If the requested concept exceeds the Character's available Rank, AI should either:

1. downgrade the mechanics to fit the highest available Rank; or
2. propose the requested version at a higher Rank and explain that it is currently unavailable.

It must never silently bypass Rank restrictions.

---

# 9. Reference Comparison Is More Important Than Exact Formula

The Alpha AI balancer does not need one giant universal equation for every possible Spell.

Instead, each proposal should be anchored against known reference points.

Example:

```text
Reference Fireball R1
Reference Flame Burst R2
Reference Fire Wave R3
Reference Inferno Field R4
```

For a Player-created Firestorm, AI can interpolate/compare against the closest relevant references and produce a bounded package.

This allows unusual effects without requiring hand-authored formulas for every possible concept.

---

# 10. Mechanical Budget Dimensions

AI should evaluate at least these dimensions when balancing a custom Skill/Spell:

```text
Damage / Healing
Target count
Area
Range
Duration
Control strength
Defence / mitigation
Mobility
Summoning
Terrain/environment manipulation
Status effects
Reliability / Source Bonus
MP/resource cost
Cast/action cost
Cooldown / usage limit
Prerequisites
Risk / backlash
Special exceptions
```

Increasing one or more dimensions may require reducing another or increasing cost/Rank.

---

# 11. Skill vs Spell Definition

A broad magic proficiency is a numeric Skill:

```text
Fire Magic 52
Ice Magic 31
Earth Magic 44
```

A specific Player-created or reference Spell is an Ability/Spell that normally uses the relevant numeric Skill.

Example:

```text
Firestorm
Uses: Fire Magic

Final Check
= Fire Magic
+ Firestorm Source Bonus
+ Buff/Debuff
```

This remains consistent with the general Combat equation.

---

# 12. AI Proposal Approval

During Alpha, AI-generated custom Skills/Spells should not become authoritative immediately.

Recommended flow:

```text
Player Create Skill/Spell
      ↓
AI Generate Mechanical Proposal
      ↓
Player Review
      ↓
Submit
      ↓
GM Review
   ├── Approve
   ├── Edit + Approve
   └── Reject
      ↓
Approved definition stored in D1
```

This protects balance while still letting Players own the creative process.

A future Campaign setting may allow automatic approval for proposals that pass strict deterministic budget validation.

---

# 13. Reuse and Learning

Once approved, a custom Skill/Spell becomes a normal D1-backed definition/Character ability.

It may be:

- unique to that Character;
- made available as a learnable Skill Tree Node;
- promoted by GM into a reusable Campaign template;
- used later as another AI reference example.

Thus the Campaign's Skill library can grow organically through play.

---

# 14. Suggested D1 Structures

Conceptually:

```text
magic_elements
├── id
├── code
├── name
├── category              NATURAL | POLAR
├── active
└── metadata
```

```text
magic_reference_spells
├── id
├── element_id
├── rank                  1..9
├── role
├── name
├── source_bonus
├── damage_formula
├── damage_type
├── target_data
├── range_data
├── area_data
├── duration_data
├── resource_cost
├── effects
├── restrictions
├── active
└── metadata
```

```text
custom_ability_proposals
├── id
├── character_id
├── proposed_name
├── element_id
├── player_description
├── requested_effects
├── ai_suggested_rank
├── ai_structured_proposal
├── ai_reference_comparison
├── status                DRAFT | PENDING | APPROVED | REJECTED
├── reviewed_by_gm_id
├── created_at
└── updated_at
```

Approved proposals become ordinary Character ability/Skill Tree data rather than remaining trapped inside an AI text blob.

---

# 15. Alpha Locked Direction

1. Magic uses seven natural elements: Fire, Water, Ice, Wind, Earth, Lightning and Nature.
2. Light and Dark are additional metaphysical/polar magic families.
3. Magic power is organized from Rank 1 through Rank 9.
4. The system contains canonical reference Spells for Element × Rank × Role.
5. Reference Spells are balancing benchmarks, not the only Spells Players may use.
6. Players may create original Skills/Spells by name and effect concept.
7. Players do not directly assign authoritative damage/cost/balance numbers to custom Spells.
8. AI converts creative intent into a structured mechanical proposal.
9. AI must compare against canonical Rank/Element reference data rather than inventing unconstrained values.
10. Stronger area/control/duration/utility consumes part of the same Rank power budget and may reduce damage or increase cost.
11. Broad elemental magic proficiencies are numeric Skills; individual Spells/Abilities normally reference those Skills.
12. Custom Spell checks remain compatible with `Skill + Source Bonus + Buff/Debuff`.
13. During Alpha, GM reviews AI-generated custom Skill/Spell proposals before they become authoritative.
14. Approved custom abilities are stored as structured D1 data and may later become reusable Campaign references.
