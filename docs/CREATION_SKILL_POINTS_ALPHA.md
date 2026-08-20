# Character Creation Skill Points — Alpha

> Status: Canonical Alpha Override
> Date: 2026-08-21
> Scope: Character creation allocation for the 23 base skills.
> This file supersedes any earlier Creation Skill Point pool formula, 90–120 clamp, per-skill default Base Value proposal, derived starting Dodge exception, or Level-1 skill cap of 70 in older documents.

## Locked Creation Rule

Normal Player-created Characters receive a fixed creation-only pool:

```text
Creation Skill Points = 200
```

These points are allocated only among the 23 current base skills.

For Character creation, base skills do not receive a universal automatic starting value. Before the Player allocates Creation Skill Points:

```text
Starting creation value = 0
```

The Player then distributes the 200-point pool freely among the 23 base skills.

At Character creation, the final natural value of any single base skill must not exceed:

```text
30
```

Therefore:

```text
0 <= creation allocation per base skill <= 30
```

A skill that receives no Creation Skill Points starts at 0. `閃避 / Dodge` follows the same creation-allocation rule and does not receive a separate `DEX × 2` starting value during Character creation.

The creation UI and Worker must reject any allocation that would produce a starting base-skill value above 30.

Creation Skill Points:

- are separate from post-creation Level-up Skill Points;
- cannot be spent on named Abilities;
- cannot directly increase Element training or Weapon Specialization;
- must be validated server-side against D1-authoritative Character data;
- follow the global natural permanent D100 skill ceiling of 98% after creation, while the special Character-creation ceiling remains 30.

The fixed 200-point pool replaces the older composite CSP formula and its 90–120 clamp.
