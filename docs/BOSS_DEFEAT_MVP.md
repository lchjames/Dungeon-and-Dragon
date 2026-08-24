# Boss HP0 / Defeat — MVP

> Status: Canonical MVP Rule  
> Date: 2026-08-25  
> Scope: Resolves the final Boss HP0 blocker for the playable Boss combat loop. This document supersedes any earlier `BOSS_RUNTIME_MVP.md` wording that described Boss HP0 as unresolved.

---

# 1. Locked Rule

A Boss Instance uses immediate defeat at HP 0.

```text
Current HP > 0
→ status = active

Current HP <= 0
→ clamp Current HP to 0
→ status = defeated immediately
```

Boss HP must never become negative.

---

# 2. No Player DYING Lifecycle

Boss Instances do not inherit the Player Character DYING system merely because they are important enemies.

Do not apply:

```text
ceil(CON / 5) dying rounds
Player DYING countdown
Player death lock
negative HP
```

Boss Phase architecture remains separate from HP0 life-state handling.

---

# 3. Runtime Consequences

When a Boss becomes `defeated`:

```text
ordinary Action = unavailable
ordinary Move = unavailable
Boss Skill attack = unavailable
normal hostile targeting = unavailable
new Combat participation as active Boss = unavailable
```

The existing Combatant row may remain in the current Combat for initiative and audit history.

Defeating one Boss does not automatically:

```text
End Combat
Resolve Encounter
Complete Scene
```

Those remain GM-controlled lifecycle actions.

---

# 4. Player → Boss Resolution

Player-origin attacks against an active Boss use the shared hostile-target pipeline:

```text
Player Attack Profile Stored Accuracy
vs
Boss Effective D100 Defence
→ opposed D100
```

Boss defence remains:

```text
Modified Defence
= Boss Stored Defence + runtime Defence Modifier

Effective D100 Defence
= min(100, Modified Defence)
```

On successful hit:

```text
Player Raw Damage
→ Boss Final Armor Defence
→ Damage Result
→ HP Damage
```

Then:

```text
HP after damage > 0
→ Boss remains active

HP after damage <= 0
→ HP = 0
→ Boss status = defeated
```

Armor remains a post-hit fixed defence contribution and is not added to the D100 opposed check.

---

# 5. Phase Interaction

HP-percentage Phase conditions may become applicable while the Boss remains above 0 HP.

At HP 0:

```text
Defeated lifecycle wins
```

The system must not automatically convert HP0 into a new Phase, final Phase, scripted survival state, or pending-defeat state unless a future explicit Boss mechanic defines an exception.

A Boss-specific future mechanic may intentionally intercept lethal damage, but such mechanics must be explicit content/runtime rules rather than an assumed default.

---

# 6. GM Corrections

GM-authorised Instance correction may reconcile Boss status with Current HP:

```text
defeated + Current HP > 0
→ active

active + Current HP = 0
→ defeated
```

`removed` remains a separate explicit state and must not be automatically revived merely because HP is corrected above 0.

---

# 7. Audit Requirement

Player → Boss action audit should preserve enough data to reconstruct:

```text
Combat / Round / Turn
Player Attack Profile
Attack D100 / Result
Boss Stored Defence
Boss Defence Modifier
Boss Effective D100 Defence
Boss Defence D100 / Result
Raw Damage
Boss Final Armor Defence
Damage Result
HP Damage
Boss HP before / after
Boss status after
outcome
```

---

# 8. Locked Conclusions

1. Boss HP0 resolves immediately to `defeated`.
2. Boss HP clamps at 0 and never becomes negative.
3. Bosses do not use Player DYING by default.
4. Boss Phase does not automatically replace the HP0 defeat rule.
5. Defeated Bosses lose normal Action / Move / Boss Skill attack eligibility.
6. Defeating a Boss does not automatically end Combat or resolve Encounter.
7. Player → Boss uses Boss Stored Defence for the opposed D100 check and Boss Armor after a successful hit.
8. GM corrective HP changes may explicitly restore a defeated Boss to active when Current HP becomes greater than 0.
