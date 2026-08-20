# Magic Reference & AI-Created Skill System — Alpha

> Status: **Alpha structural specification**.
> Purpose: define the eight-element magic framework, Rank 1–9 reference magic, and the minimal-input Player-created Spell workflow balanced by AI against canonical reference data.

---

# 1. Element Framework

Alpha uses **eight magic elements**:

```text
LIGHT
DARK
FIRE
WATER
WIND
EARTH
LIGHTNING
WOOD
```

Player-facing identities:

```text
Light / 光元素
- sacred power
- healing
- purification

Dark / 暗元素
- shadow
- curses
- destruction

Fire / 火元素
- heat
- burst damage
- burning

Water / 水元素
- flow
- change
- healing

Wind / 風元素
- speed
- freedom
- air
- movement/displacement

Earth / 土元素
- solidity
- defence
- terrain/ground

Lightning / 雷元素
- speed
- destruction
- high voltage
- interruption/stun tendency

Wood / 木元素
- nature
- plants
- growth
- binding
- regeneration
```

`WOOD` is the system code for the Nature/plant family. The Player-facing label may be rendered as `Wood / Nature` if desired.

These identities are **tendencies**, not hard restrictions. For example Water can attack, Light can damage, Dark can control, and Fire can potentially create utility effects if the AI can justify them inside the Rank budget.

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

Rank is a broad power/complexity budget rather than a fixed damage number.

Higher Rank may support larger combinations of:

- damage;
- healing;
- target count;
- area;
- range;
- duration;
- control strength;
- movement/displacement;
- blindness/vision effects;
- stun/interruption;
- defence;
- terrain manipulation;
- status effects;
- summons;
- resource efficiency;
- special rule exceptions.

Exact numeric budgets remain Alpha-tunable.

---

# 3. Reference Magic Matrix

The canonical balancing library is a **Reference Magic Matrix**:

```text
Element × Rank × Role
```

Reference Spells are **benchmarks**, not a closed spell list.

Example:

```text
FIRE / Rank 1 / Basic Offensive
Reference: Fireball
```

The reference entry contains the authoritative benchmark package, for example:

```text
Element
Rank
Role
Skill used
Source Bonus
Damage / Healing
Target pattern
Range
Area
MP Cost
Duration
Status / Control effects
Movement effects
Restrictions
```

AI compares Player-created Spell concepts against these references before assigning mechanics.

---

# 4. Reference Spell Philosophy

Every Element should eventually have Rank 1–9 reference examples covering common roles.

The point is not that every Player must learn the reference Spell. The point is that AI and GM always have a known baseline.

Example Rank-1 offensive references may include:

```text
LIGHT       Light Bolt / purification-oriented attack
DARK        Shadow Bolt / weakening-oriented attack
FIRE        Fireball / direct damage + burn tendency
WATER       Water Shot / damage + push/flow tendency
WIND        Wind Blade / damage + displacement tendency
EARTH       Stone Bullet / impact + stagger tendency
LIGHTNING   Spark Bolt / damage + interrupt/stun tendency
WOOD        Thorn Shot / damage + bind/bleed tendency
```

Exact names and values remain content/balance data rather than structural rules.

A secondary effect is not free. A Spell with stronger area, healing, control, displacement, blindness, stun, duration or utility may need lower damage or higher MP cost to remain within its Rank budget.

---

# 5. Rank 1–9 Reference Ladder

Broad Alpha intent:

```text
Rank 1  basic effect / simple attack / minor utility
Rank 2  stronger basic effect / minor control or support
Rank 3  stronger attack / small area / meaningful support
Rank 4  persistent effect / stronger defence / stronger control
Rank 5  major combat Spell / battlefield influence
Rank 6  large-area or high-impact advanced magic
Rank 7  major battlefield control / powerful summon / domain-like effect
Rank 8  extreme high-tier transformation/destruction/support
Rank 9  legendary/ultimate magic with major cost, limits or prerequisites
```

This ladder guides AI comparison. Exact numbers remain configurable.

---

# 6. Minimal Player Spell-Creation Input

The Player-facing custom Spell creation form must remain intentionally minimal.

The Player supplies only:

```text
1. Spell Name
2. Effect Range / Target Pattern
```

The Player does **not** manually enter:

```text
Element
Rank
MP Cost
Damage
Healing
Source Bonus
numeric distance
numeric area size
Duration
Stun value
Blind value
Push / Pull distance
Position effect
Status chance
Cooldown
```

Element and available Rank context are supplied by the Character's current Magic Skill / Skill Tree context rather than entered again by the Player.

Example:

```text
Current context:
Fire Magic / available Rank up to 4

Player enters:
Name: Firestorm
Effect Range: Area
```

That is enough to request an AI proposal.

---

# 7. Effect Range / Target Pattern

`Effect Range` means the **shape/targeting intention**, not the final numeric distance.

Recommended Alpha choices:

```text
SELF
SINGLE
MULTI_TARGET
AREA
LINE
CONE
```

The UI can initially emphasize simple choices such as `Single` and `Area`, while retaining the structured enum for later expansion.

The Player selects the pattern; AI determines appropriate numeric values such as:

```text
Range: 30 m
Area: 5 m radius
Targets: up to 3
Line length: 20 m
Cone length: 10 m
```

based on Rank and reference balance.

---

# 8. AI Interpretation and Mechanical Assignment

AI receives hidden/system context including:

- Character ID and current Character state;
- selected/current Magic Element from Skill Tree context;
- Character's accessible Magic Rank ceiling;
- Spell Name;
- Player-selected Effect Range / Target Pattern;
- Element Rank 1–9 Reference Matrix;
- current Rank-budget rules;
- existing approved similar Spells;
- Campaign restrictions;
- current Combat/Damage scale.

AI then decides the full mechanical interpretation.

AI may assign:

```text
Suggested Rank
Role
Skill used
Source Bonus
MP Cost
Damage
Healing
Range
Area / target count
Duration
Stun
Blind
Burn
Slow
Bind
Push
Pull
Knockback
Reposition
Defence
Cleanse
Regeneration
Terrain effect
Other structured status/effect data
Restrictions / trade-offs
```

The Spell Name is therefore both a creative name and a semantic prompt.

Example:

```text
Context:
Fire Magic
Maximum available Rank: 4

Player Input:
Name: Firestorm
Effect Range: AREA
```

Possible AI proposal:

```text
Firestorm
Element: FIRE
Suggested Rank: 4
Role: Area Damage / Damage over Time
Uses Skill: Fire Magic
Source Bonus: +0
Range: 30 m
Area: 6 m radius
Duration: 3 rounds
Damage: 1D6 Fire per round
MP Cost: 12
Effect: Burn chance
Restriction: one active Firestorm at a time
```

The exact values above are illustrative Alpha content only.

---

# 9. Ambiguous Spell Names

Because the Player only supplies a Name and Effect Range, some names may be ambiguous.

Example:

```text
Name: Crimson Crown
Effect Range: SELF
```

AI must make its best bounded interpretation from:

- Element context;
- Rank ceiling;
- the name's semantic meaning;
- Reference Spells;
- existing Campaign vocabulary.

The AI proposal must clearly show what it interpreted the Spell to do.

If the Player does not like that interpretation, the Player may:

```text
Reject proposal
Rename the Spell
Generate again
```

No additional mandatory description field is required merely to resolve ambiguity.

---

# 10. AI Uses Reference Data, Not Freeform Power Guessing

AI is a **mechanical translator/balancer**, not an unrestricted rules authority.

Required process:

```text
Player Name + Effect Range
        ↓
Element / accessible Rank context
        ↓
Interpret intended Role/effect
        ↓
Find closest Element × Rank × Role references
        ↓
Allocate Rank budget across damage/healing/control/area/range/duration/etc.
        ↓
Assign MP and other costs
        ↓
Return structured proposal + short justification
```

Bad result:

```text
"Firestorm sounds powerful"
→ arbitrary 20D100 damage
```

Required result:

```text
Compared with Rank-3/Rank-4 Fire area references,
this has persistent area damage, therefore immediate damage is reduced and MP cost is increased.
```

---

# 11. AI Effect Trade-Offs

AI balances the complete package, not only raw damage.

Examples at the same Rank may include:

```text
A. High damage + Single target
B. Medium damage + Area
C. Low damage + Area + Stun
D. No damage + strong Blind
E. Healing + Cleanse
F. Push/Pull + positional control
```

All may be valid if their total effect remains within the Rank reference budget.

Important budget dimensions include:

```text
Damage
Healing
Target count
Area
Range
Duration
Stun / interruption
Blind / sensory impairment
Slow / Bind
Push / Pull / Knockback / Reposition
Defence / mitigation
Cleanse
Regeneration
Terrain/environment manipulation
Summoning
Reliability / Source Bonus
MP cost
Action/cast cost
Cooldown / usage limit
Prerequisites
Risk / backlash
Special exceptions
```

---

# 12. Rank Ceiling Handling

AI may not silently grant a Spell above the Character's accessible Rank.

If the name implies something much stronger than the Character can currently use, AI should produce a version that fits the available Rank.

Example:

```text
Player:
Fire Magic currently supports up to Rank 2
Name: Firestorm
Range: Area
```

AI may interpret it as a small Rank-2 fire storm rather than a city-scale disaster.

The same name can later receive stronger upgraded versions through Skill Tree progression if the system supports evolution/upgrades.

---

# 13. Skill vs Spell

A broad elemental proficiency is a numeric Skill:

```text
Fire Magic 52
Water Magic 31
Wood Magic 44
```

A specific Spell is an Ability that references the relevant Skill.

Example:

```text
Firestorm
Uses: Fire Magic

Final Check
= Fire Magic
+ Firestorm Source Bonus
+ Buff/Debuff
```

This remains compatible with the canonical one-check equation.

---

# 14. Player Confirmation Before GM Submission

AI output is **not submitted to GM immediately**.

Required Player workflow:

```text
Player enters
Name + Effect Range
      ↓
AI generates complete mechanical proposal
      ↓
PLAYER CONFIRMATION SCREEN
      ├── Confirm & Send to GM
      └── Reject / Rename / Generate Again
      ↓
GM receives proposal only after Player confirmation
```

The Player confirmation screen should show at least:

```text
Name
Element
Suggested Rank
Role
Skill used
Source Bonus
MP Cost
Damage and/or Healing
Target pattern
Range / Area
Duration
Status / Control effects
Restrictions
AI reference justification
```

The Player cannot directly edit authoritative generated combat numbers during this confirmation step. If the interpretation is unwanted, the Player can reject/regenerate or rename the proposed Spell.

---

# 15. GM Approval

After Player confirmation:

```text
PLAYER CONFIRMED
      ↓
PENDING GM REVIEW
      ↓
GM
   ├── Approve
   ├── Edit + Approve
   └── Reject
      ↓
Approved Spell stored as structured D1 data
```

GM remains the final authority during Alpha.

If GM edits the AI-generated mechanics before approval, the final saved definition must preserve the GM-approved values and the audit history should preserve the original AI proposal.

---

# 16. Approved Spell Reuse

An approved custom Spell may be:

- unique to that Character;
- added as a Skill Tree node;
- promoted by GM into a reusable Campaign template;
- added to the AI's approved reference/example library;
- used to improve future proposals for mechanically similar Skills.

The system therefore becomes better grounded in the Campaign's own rules over time without allowing AI to mutate live balance automatically.

---

# 17. Suggested D1 Structures

Conceptually:

```text
magic_elements
├── id
├── code                  LIGHT | DARK | FIRE | WATER | WIND | EARTH | LIGHTNING | WOOD
├── name
├── description
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
├── healing_formula
├── target_pattern
├── range_data
├── area_data
├── duration_data
├── mp_cost
├── effects
├── restrictions
├── active
└── metadata
```

```text
custom_spell_proposals
├── id
├── character_id
├── element_id
├── proposed_name
├── requested_target_pattern
├── accessible_rank_ceiling
├── ai_suggested_rank
├── ai_structured_proposal
├── ai_reference_comparison
├── player_status         DRAFT | CONFIRMED | CANCELLED
├── gm_status             NOT_SUBMITTED | PENDING | APPROVED | REJECTED
├── reviewed_by_gm_id
├── created_at
└── updated_at
```

Approved proposals become normal structured Character Ability/Skill Tree records rather than remaining only as AI-generated text.

---

# 18. Alpha Locked Direction

1. Magic uses eight elements: Light, Dark, Fire, Water, Wind, Earth, Lightning and Wood/Nature.
2. Magic power is organized from Rank 1 through Rank 9.
3. Canonical Reference Spells exist as `Element × Rank × Role` balancing benchmarks.
4. Reference Spells are reference points, not a restrictive spell list.
5. Player-created Spells are intentionally minimal-input.
6. The Player supplies only `Name` and `Effect Range / Target Pattern`.
7. Element and accessible Rank are supplied by current Character/Skill Tree context rather than manually entered again.
8. The Player does not assign MP, damage, healing, Source Bonus, numeric range, duration or status/control values.
9. AI interprets the Name and Target Pattern against the Element/Rank Reference Matrix.
10. AI assigns the complete structured mechanical proposal, including MP and damage/healing/control effects such as stun, displacement/repositioning and blindness where appropriate.
11. AI must remain inside the Character's accessible Rank ceiling and reference budget.
12. Stronger area/control/healing/duration/utility consumes the same Rank budget and may reduce damage or increase MP/cost/restrictions.
13. Ambiguous names are resolved through AI interpretation; the Player may reject/rename/regenerate rather than filling a mandatory description form.
14. AI output is first shown to the Player for confirmation.
15. Only after Player confirmation is the proposal sent to GM.
16. GM may approve, edit+approve or reject during Alpha.
17. Approved custom Spells are stored as structured D1 data.
18. Approved Campaign Spells may later become reusable references/examples for future AI balancing.
19. Spell checks remain compatible with `Skill + Source Bonus + Buff/Debuff`.
20. AI assists balancing and interpretation but does not autonomously change authoritative Character data.
