# Monster / NPC System — Alpha

> Status: Canonical Alpha Working Rule  
> Date: 2026-08-21  
> Scope: Defines the structural model used for Monsters and NPCs in the Alpha ruleset. Detailed stat formulas and balance values are decided incrementally in later sections.

---

# 1. Core Model — Hybrid

Alpha uses a **Hybrid Monster / NPC Model**.

The system does not force every enemy, creature and NPC to use the full Player Character data model.

## 1.1 Ordinary Monsters / Disposable Combatants

Ordinary Monsters and similarly lightweight combatants use a **Simplified Profile**.

Purpose:

- fast GM creation;
- low database/UI overhead;
- suitable for encounters containing many units;
- avoids requiring irrelevant full Character fields for every minor creature.

The exact mandatory fields of the Simplified Profile are not yet locked and will be decided separately.

## 1.2 Elite / Boss Enemies

Elite and Boss enemies may use a **richer Monster Profile** when required by their mechanics.

They are not automatically forced to become full Player-style Characters, but the model must be extensible enough to support additional Attributes, Resources, Abilities, Status rules and encounter-specific mechanics.

The exact distinction between Ordinary / Elite / Boss profiles and their required fields is still to be decided.

## 1.3 Important / Persistent / Growing NPCs

Important NPCs, persistent companions, recurring characters or NPCs that require long-term progression may use the **Full Character Model**.

When Full Character Model is used, the NPC may participate in the same authoritative Character systems as appropriate, including Attributes, derived Resources, Skills, progression and Abilities.

Whether every Full-Model NPC uses EXP/Level progression identically to a Player Character is a separate decision and is not implied by this section.

---

# 2. Canonical Principle

```text
Ordinary Monster
→ Simplified Profile

Elite / Boss
→ Richer Monster Profile when needed

Important / Persistent / Growing NPC
→ Full Character Model
```

The profile type is chosen according to gameplay complexity, not simply whether the entity is friendly or hostile.

---

# 3. D1 / Alpha Implementation Requirement

All Monster / NPC Profiles used by the live Alpha remain server-authoritative and persist in D1 where persistence is required.

The data model must support the Hybrid approach without duplicating unrelated Player-only fields into every ordinary Monster record.

---

# 4. Still To Be Decided

The following are deliberately unresolved and must be decided one by one:

- mandatory Simplified Profile fields;
- whether ordinary Monsters use full STR/DEX/CON etc. or only selected combat values;
- HP / MP generation and scaling;
- Attack / Defence values;
- Elite / Boss modifiers;
- Skill / D100 handling;
- Ability handling;
- Status / Resistance / Immunity fields;
- EXP rewards;
- NPC progression behaviour;
- encounter difficulty contribution.
