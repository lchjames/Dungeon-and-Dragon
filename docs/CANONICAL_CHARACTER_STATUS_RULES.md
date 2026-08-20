# Canonical Character Status Rules

> Status: **Canonical override**  
> Date: 2026-08-20  
> Source basis: latest user-provided `人物表.xlsx` plus explicit Web redesign decisions.  
> This file supersedes any conflicting character-status/resource statements currently remaining in `docs/SITE_SPECIFICATION.md` until that document is consolidated.

## 1. Keep / Remove Decisions

| Field / System | Canonical Web Decision |
|---|---|
| EXP | KEEP |
| Level | KEEP; automatically derived from cumulative EXP using the current Web Level 1–100 progression curve |
| Alignment / 陣營 | KEEP |
| IDEA / 靈感 | REMOVE |
| Mind / SAN / 心智值 | KEEP |
| KNOW / 知識 | REMOVE |
| HP | KEEP |
| MP | KEEP |
| Damage Bonus | KEEP |
| Magic Rank / 魔法等級 | KEEP |
| Martial Rank / 武道等級 | KEEP |
| Adventurer Rank / 冒險者等級 | KEEP |
| Cthulhu Mythos | REMOVE |
| fixed language subsystem | REMOVE |

## 2. EXP and Level

EXP is one cumulative Character-wide progression value.

Current Web starting values remain:

```text
Starting EXP = 1
Starting Level = 1
```

The earlier workbook cube-root Level equation is superseded for the Web game by the following Alpha progression curve.

### 2.1 Current Level Cap

```text
Current Alpha Level Cap = 100
```

Level 100 is the current practical maximum. Future versions may extend the cap, but no Level above 100 is granted by the current resolver.

### 2.2 EXP Required for the Next Level

For a Character currently at Level `L`, where `1 <= L <= 99`:

```text
EXP required from Level L to Level L+1
= 2L² + 25L
```

This deliberately makes later Levels progressively slower to earn.

Examples:

| Current Level | EXP to Next Level |
|---:|---:|
| 1 | 27 |
| 5 | 175 |
| 10 | 450 |
| 20 | 1,300 |
| 25 | 1,875 |
| 40 | 4,200 |
| 50 | 6,250 |
| 60 | 8,700 |
| 75 | 13,125 |
| 80 | 14,800 |
| 90 | 18,450 |
| 95 | 20,425 |
| 99 | 22,077 |

### 2.3 Cumulative EXP Threshold

The minimum Total EXP for Level `L` is:

```text
EXP Threshold(L)
= 1 + ((L - 1) × L × (4L + 73)) / 6
```

Selected thresholds:

| Level | Minimum Total EXP |
|---:|---:|
| 1 | 1 |
| 5 | 311 |
| 10 | 1,696 |
| 20 | 9,691 |
| 25 | 17,301 |
| 40 | 60,581 |
| 50 | 111,476 |
| 60 | 184,671 |
| 75 | 345,026 |
| 80 | 413,961 |
| 90 | 578,056 |
| 95 | 674,216 |
| 99 | 758,374 |
| 100 | 780,451 |

Implementation should derive Level from the highest threshold reached, then cap the result at Level 100.

### 2.4 Ordinary Monster EXP Reference

Current Alpha baseline for a normal ordinary monster is:

```text
Ordinary Monster EXP
= 5 × Monster Level
```

This is a baseline for ordinary monsters, not a universal reward formula for elites, bosses, quests or story rewards.

If the Character fights an ordinary monster of the same Level, the approximate number of such monsters required to gain one Level is:

```text
(2L² + 25L) / (5L)
= 5 + 0.4L
```

Therefore the ordinary same-Level grind becomes steadily harder:

| Character / Monster Level | Same-Level Ordinary Monsters per Level |
|---:|---:|
| 1 | 5.4 |
| 5 | 7 |
| 10 | 9 |
| 20 | 13 |
| 25 | 15 |
| 40 | 21 |
| 50 | 25 |
| 60 | 29 |
| 75 | 35 |
| 80 | 37 |
| 90 | 41 |
| 95 | 43 |
| 99 | 44.6 |

This monotonic increase is intentional. Higher Character Levels are not supposed to become easier to grind using ordinary same-Level enemies.

Elite, boss, quest and campaign EXP multipliers remain separately tunable and must not silently alter this ordinary-monster baseline.

GM awards EXP. Player cannot directly edit EXP. Level is calculated automatically from EXP.

When Level increases, the Character receives post-creation Skill Points. The final number of Skill Points granted per Level is still TBD/configurable; the workbook's historical `+5 per level` is reference only, not yet a locked Web rule.

## 3. Core Attributes

Keep:

```text
STR
DEX
CON
APP
POW
INT
SIZ
EDU
LUCK
```

Starting generation rules already confirmed elsewhere remain in force unless explicitly changed later.

## 4. HP

Keep the latest-sheet formula:

```text
Max HP = ceil((CON + SIZ) / 2)
Current HP = Max HP at Character creation
```

## 5. MP

Character creation keeps the workbook baseline:

```text
Base MP = INT × 3
```

Current Alpha Max MP then grows with Character Level using a bounded Level 1–100 quadratic term:

```text
Max MP
= INT × 3 + floor((Level - 1)² / 15)
```

At Level 1 this is exactly the original workbook value:

```text
Level 1 Max MP = INT × 3
```

The Level term exists so the common MP resource can support increasingly expensive named physical and magical abilities without making a low-Rank Ability itself more expensive as the Character grows.

For a representative `INT = 12` Character:

| Level | Max MP |
|---:|---:|
| 1 | 36 |
| 10 | 41 |
| 20 | 60 |
| 30 | 92 |
| 40 | 137 |
| 50 | 196 |
| 60 | 268 |
| 70 | 353 |
| 75 | 401 |
| 80 | 452 |
| 90 | 564 |
| 95 | 625 |
| 99 | 676 |
| 100 | 689 |

With the current natural starting INT range (`2D6 + 6`, or 8–18), Level 100 Max MP is approximately:

```text
INT 8  → 677 MP
INT 12 → 689 MP
INT 18 → 707 MP
```

This intentionally places the current Rank 9 default MP reference (`640 MP`) near the end of the Level 1–100 progression. Owning or qualifying for a Rank 9 Ability remains separate from having enough Current / Max MP to activate it.

Current MP starts at Max MP when the Character is created. Exact MP recovery/rest rules are defined separately and are not changed by this formula.

This supersedes the earlier Web draft that used only `Max MP = INT × 3` at every Level, and the older incorrect draft that used `Max MP = POW`.

## 6. Mind / SAN

Mind / SAN remains part of the core visible Character status rather than being removed or merely treated as an optional Campaign Resource.

Latest-sheet basis:

```text
Mind / SAN Maximum = min(99, INT × 5)
Current SAN = Mind / SAN Maximum - SAN adjustment
```

The implementation should keep Current and Maximum values separate and auditable.

IDEA and KNOW are removed even though the latest workbook contains them.

## 7. Damage Bonus

Keep Damage Bonus derived from `STR + SIZ` using the current table:

```text
2–12   => -1D6
13–16  => -1D4
17–24  => 0
25–32  => +1D4
33–40  => +1D6
41–56  => +2D6
57–72  => +3D6
73–88  => +4D6
```

## 8. Alignment

Alignment / 陣營 is retained as a Character field.

The field's ownership at creation is not yet locked: whether Player selects it, GM assigns it, or it is editable through the normal approval workflow remains TBD.

## 9. Separate Rank Tracks

Keep all three latest-workbook rank tracks as distinct progression values, separate from numeric Character Level:

```text
Character Level
Magic Rank
Martial Rank
Adventurer Rank
```

They must not be collapsed into the normal EXP Level.

The first implementation should model them as structured rank/progression tracks so their labels and ladders can be maintained in D1.

Current workbook ladders remain source-reference content; detailed advancement conditions and who controls each rank remain to be confirmed before implementation.

## 10. Character Overview — Confirmed Visible Status

The Player Character Overview should ultimately expose at least:

```text
Identity
├── Character Name
├── Alignment
├── Age / Gender where present
└── GM-managed Class / Occupation

Progression
├── Level
├── EXP / next-Level progress
├── Magic Rank
├── Martial Rank
├── Adventurer Rank
└── available post-creation Skill Points

Attributes
├── STR / DEX / CON / APP
├── POW / INT / SIZ / EDU
└── LUCK

Status / Resources
├── Mind / SAN Current / Max
├── HP Current / Max
├── MP Current / Max
└── Damage Bonus
```

Do not display IDEA or KNOW as Character status fields.
