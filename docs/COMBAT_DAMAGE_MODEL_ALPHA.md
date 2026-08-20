# Combat & Damage Source Model — Alpha

> Status: Alpha structural specification.  
> Purpose: keep combat resolution simple while allowing any physical object, Skill, spell or environmental source to cause damage when appropriate.

---

# 1. One Combat Check Equation

Alpha uses one general check equation for attacks and other Skill-based actions:

```text
Final Check = Skill Value + Source Bonus + Buff/Debuff Modifier
```

Where:

- `Skill Value` is the Character's relevant Skill;
- `Source Bonus` is the modifier supplied by the Weapon, Item, Skill, spell, tool or other action source;
- `Buff/Debuff Modifier` is the total temporary modifier currently affecting the action.

Do not create separate hit equations for swords, guns, improvised objects, spells or techniques unless later Alpha testing proves one is necessary.

Examples:

```text
Swordsmanship 45
Steel Sword +2
Blessing +5
Final Check = 52
```

```text
Unarmed 35
Glass Cup -10
Adrenaline +3
Final Check = 28
```

The Source Bonus may be negative for awkward/improvised objects.

---

# 2. Weapon Is Not the Same as Damage Source

The database Item classification remains:

```text
WEAPON
ARMOUR
ITEM
```

However, **WEAPON does not mean "the only thing that can deal damage"**.

Any of the following may become a Damage Source:

```text
WEAPON
ITEM
Skill / Technique
Spell
Environmental Object
Creature body / Unarmed
Trap
Temporary improvised object
```

Examples:

- sword: WEAPON, normally has a predefined Damage Profile;
- glass cup: ITEM, normally has no combat role, but may create an improvised Damage Profile when used to strike something;
- chair: ITEM/environmental object, may be swung as an improvised bludgeon;
- torch: ITEM, may cause blunt and/or fire effects;
- falling rock: environmental Damage Source;
- Fire Bolt: Skill/Spell Damage Source.

Item category therefore describes what an object primarily **is**, not everything it can possibly **do**.

---

# 3. Damage Profiles

Damage is described by a reusable structured Damage Profile rather than inferred directly from Item type.

Conceptual structure:

```text
Damage Profile
├── id
├── source_type
├── source_reference
├── name
├── damage_formula
├── damage_type
├── source_bonus
├── applies_character_damage_bonus
├── range
├── area / target
├── resource_cost
├── break / consume behaviour
├── conditions / secondary effects
├── provenance
└── metadata
```

`provenance` may be:

```text
PREDEFINED
RULE_DERIVED
AI_SUGGESTED
GM_CREATED
GM_APPROVED
TEMPORARY
```

A Weapon usually has one or more predefined profiles.

A general ITEM may have zero predefined profiles and gain one only when context requires it.

---

# 4. Predefined Weapon Example

```text
Steel Sword
Item Type: WEAPON

Damage Profile: Sword Slash
Skill: Swordsmanship
Source Bonus: +2
Damage: 1D8
Damage Type: Slash
Character Damage Bonus: Yes
```

Combat check:

```text
Final Check = Swordsmanship + 2 + Buff/Debuff
```

Damage resolution uses the stored Sword Slash Damage Profile.

---

# 5. Improvised Item Example — Glass Cup

The Item Definition remains ordinary:

```text
Glass Cup
Item Type: ITEM
Subtype: MISC / CONTAINER
```

It does not need to be permanently reclassified as a WEAPON.

If a Player says:

```text
"I smash the glass cup against the target."
```

an improvised profile can be resolved:

```text
Improvised Glass Strike
Relevant Skill: Unarmed / Improvised Combat
Source Bonus: -10
Damage: 1D2
Damage Type: Blunt
Break Risk: High
```

If the cup breaks, the same object can transition into a different usable state:

```text
Broken Glass / Glass Shards
Damage: 1D4
Damage Type: Slash / Pierce
Source Bonus: -5
Break/Consume: may be destroyed after use
```

The exact Alpha numbers are tuning values, not permanent rules.

The important structural rule is:

```text
Glass Cup remains ITEM
        ↓ used offensively
Improvised Damage Profile
        ↓ possible break event
Broken Glass state/profile
```

---

# 6. Item State / Transformation

Some Items can change state because of combat use.

Examples:

```text
Glass Cup
   ↓ break
Broken Glass
```

```text
Bottle
   ↓ smash
Broken Bottle
```

```text
Torch
   ↓ extinguished
Unlit Torch
```

This may be represented either as:

1. an Inventory instance state change; or
2. replacing the owned Item Definition/reference with another definition.

For Alpha, use the simpler approach that best fits the specific Item. The database should preserve the possibility of state transitions rather than requiring every Item to be immutable.

---

# 7. How to Justify Unknown Damage

It is unrealistic to hand-author a combat profile for every possible object in a cross-world TRPG.

The system should therefore use a layered resolver:

```text
1. Existing Predefined Damage Profile?
      ↓ yes
   use it

2. Known Rules/Tags sufficient?
      ↓ yes
   derive a suggested improvised profile

3. Still ambiguous?
      ↓
   AI generates a structured suggestion

4. GM reviews / accepts / edits
      ↓
   save approved profile to D1 if reusable
```

This keeps gameplay flexible without letting an AI silently become the authoritative rules engine.

---

# 8. Structured Physical Tags

General Items may optionally carry broad physical descriptors useful for improvised-damage reasoning:

```text
material
size / mass class
hardness
fragility
shape
edge / sharpness
heat / energy state
flammable
breakable
```

These are not required for every Item.

Example:

```text
Glass Cup
material: glass
size: small
hardness: low-medium
fragility: high
shape: blunt vessel
sharp_when_broken: true
breakable: true
```

A deterministic rule layer can use these tags for common cases before asking AI.

---

# 9. AI Role

AI is useful for **justification and proposal generation**, not final authoritative combat mutation.

Recommended AI workflow:

```text
GM/Player context:
"The player grabs a thick glass beer mug and smashes it against the guard's head."

AI receives:
- object definition/tags;
- intended action;
- relevant Character Skill candidates;
- existing Alpha damage scale;
- target/context if relevant.

AI returns structured proposal:
- suggested Skill;
- Source Bonus;
- Damage Formula;
- Damage Type;
- break chance/condition;
- resulting object state;
- secondary effects;
- short justification.
```

Example AI proposal:

```text
Skill: Unarmed / Improvised Combat
Source Bonus: -5
Damage: 1D3
Type: Blunt
On strong impact: mug breaks
Broken state: Glass Shards
Reason: heavy but awkward handheld object; brittle material can become sharp after breakage.
```

GM can then:

```text
[Accept]
[Edit]
[Reject]
```

If accepted and likely reusable, the resulting profile is stored in D1 so the same object does not require another AI call next time.

---

# 10. Do Not Call AI for Every Attack

AI should not be in the normal attack loop.

Bad design:

```text
Player attacks with sword
→ AI decides damage every time
```

Recommended design:

```text
Known attack/profile
→ deterministic D1 rules
→ instant resolution
```

AI is used only when the system encounters a novel or ambiguous interaction that has no adequate stored/rule-derived profile.

This avoids:

- inconsistent damage between identical attacks;
- latency;
- unnecessary AI cost;
- unpredictable rule changes;
- dependence on AI availability;
- difficulty auditing combat results.

---

# 11. Temporary vs Reusable Improvised Profiles

When a new improvised profile is created, GM may choose:

```text
Use Once
Save for this Item Definition
Save as reusable template
```

Examples:

```text
Glass Cup improvised strike
→ reusable for standard Glass Cup definitions
```

but:

```text
A cursed crystal chandelier falling from a cathedral roof
→ probably temporary/event-specific
```

This allows the rules database to become richer naturally through play.

---

# 12. Alpha Locked Direction

1. Combat uses one main check equation: `Skill + Source Bonus + Buff/Debuff`.
2. `WEAPON` is not the only Item type capable of causing damage.
3. Damage capability is represented through Damage Profiles.
4. Weapons normally have predefined Damage Profiles.
5. Ordinary Items may gain temporary/improvised Damage Profiles when context requires.
6. Item category does not change merely because an Item is used offensively.
7. Breakage or transformation can change the available Damage Profile/state.
8. Deterministic stored/rule-derived profiles are preferred whenever possible.
9. AI may suggest structured profiles for ambiguous novel interactions.
10. AI does not directly become the final authoritative combat rules engine.
11. GM may accept/edit/reject AI suggestions.
12. Approved reusable profiles may be stored in D1 to avoid repeated AI calls.
13. All authoritative Character/Item/Profile data remains D1-backed.
