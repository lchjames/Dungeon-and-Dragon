# First End-to-End Scenario Play-Test — MVP

> Status: Canonical MVP Integration Milestone  
> Date: 2026-08-25  
> Scope: Validate that the already-confirmed Character, Story, Monster, Boss and Combat slices form one playable vertical path without introducing new gameplay rules.

---

# 1. Purpose

This milestone is an integration / regression pass, not a new rules-design phase.

The target path is:

```text
Character
→ Scenario
→ Scene
→ Encounter
→ Character participant assignment
→ Monster Instance spawn
→ Boss Instance spawn
→ Start Encounter Combat
→ shared Character + Monster + Boss Initiative
→ Player / GM turns
→ Player → Monster
→ Monster → Character
→ Player → Boss
→ Boss → Character
→ Boss Phase control
→ HP updates
→ Monster / Boss HP0 defeat
→ GM End Combat
→ GM Resolve Encounter
→ Scene continuation
```

Full Tactical Map simulation, AI, automatic Encounter resolution and advanced Boss mechanics remain Deferred.

---

# 2. Integration Invariants

The first playable Scenario requires all of the following to stay true together:

```text
D1 remains authoritative
Scenario → Scene → Encounter relationships remain intact
Encounter participant records reference runtime entities
Combat remains the authoritative Round / Turn state
Character / Monster / Boss use one Initiative list
1 Action + 1 Move remains authoritative per Combatant
Player attack authority remains server-side
Monster / Boss attacks remain GM-controlled in MVP
Monster and Boss Defence remain D100 Defence + separate Armor reduction
ordinary Monster HP0 → immediate defeated
Boss HP0 → immediate defeated
Player Character HP0 → DYING baseline
Combat completion remains GM-controlled
Encounter resolution remains GM-controlled
```

Ending Combat must not silently resolve an Encounter.

---

# 3. Boss Encounter Start Atomicity

The first integration audit found one real runtime defect in the Boss-enabled Encounter start path.

Previous unsafe sequence:

```text
Start lower-layer Character / Monster Combat
→ link Combat to Encounter
→ validate Boss Instance
→ Boss invalid / HP0
→ return error
```

That could leave the Encounter linked to a partially-created Combat even though the Boss-enabled start request failed.

The hardened sequence is now:

```text
Read Boss participants
→ preflight every Boss Instance
→ require status = active and Current HP > 0
→ only then delegate lower-layer Combat start
→ add Bosses to shared Initiative
```

If a lower-layer Combat becomes linked but the Boss augmentation still fails unexpectedly:

```text
best-effort End Combat
→ remove the newly-created Encounter → Combat link
→ return the original failure
→ GM may correct data and retry
```

This is an implementation integrity rule only. It does not change Boss gameplay semantics.

---

# 4. Automated Scenario E2E Gate

`tests/mvp-scenario-e2e.test.mjs` is the permanent integration regression gate.

It verifies:

```text
production Worker gateway chain
Scenario / Scene / Encounter persistence contracts
Encounter start-combat route
Monster and Boss participant integration
Boss start preflight ordering
partial-start cleanup contract
shared Initiative for Character + Monster + Boss
Player targeting support for Monster + Boss
shared opposed D100 resolution
shared Damage Result pipeline
Monster HP0 lifecycle
Boss HP0 lifecycle
Character DYING baseline remains distinct
GM Combat End remains separate from Encounter resolution
```

The test is included in `.github/workflows/mvp-checks.yml` and runs on push / pull request.

---

# 5. Test Boundary

This automated gate validates source integration contracts and deterministic domain behaviour in CI.

It does **not** prove that Cloudflare production has been deployed or that production D1 contains suitable test data.

Production deployment remains separate from GitHub merge state.

A later live Alpha session may still uncover UX, latency, browser, deployment or real-data issues that source-level CI cannot reproduce.

---

# 6. Completion Criteria

This milestone is complete when:

```text
Scenario E2E regression passes
all existing MVP checks remain green
Boss partial-start integrity defect is fixed
feature branch is 0 behind main before merge
scoped changes are merged to main
```

After completion, the project moves from feature-slice construction into Alpha integration / usability tuning rather than adding more MVP combat subsystems by default.
