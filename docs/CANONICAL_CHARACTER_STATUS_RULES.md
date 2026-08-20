# Canonical Character Status Rules

> Status: **Canonical override**  
> Date: 2026-08-20  
> Source basis: latest user-provided `人物表.xlsx` plus explicit Web redesign decisions.  
> This file supersedes any conflicting character-status/resource statements currently remaining in `docs/SITE_SPECIFICATION.md` until that document is consolidated.

## 1. Keep / Remove Decisions

| Field / System | Canonical Web Decision |
|---|---|
| EXP | KEEP |
| Level | KEEP; automatically derived from EXP using the latest workbook equation |
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

The latest workbook uses:

```text
Starting EXP = 1
Starting Level = 1
```

The exact workbook Level formula is:

```excel
=ROUNDDOWN(-51 + 841/(24364 + 25 * EXP + 5 * SQRT(-48753 + 48728 * EXP + 25 * EXP^2))^(1/3) + (24364 + 25 * EXP + 5 * SQRT(-48753 + 48728 * EXP + 25 * EXP^2))^(1/3),0) - 6
```

Equivalent implementation form:

```text
A = 24364 + 25E + 5√(25E² + 48728E - 48753)
Level = floor(A^(1/3) + 841/A^(1/3) - 57)
```

where `E = Total EXP`.

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

Keep the latest-sheet formula:

```text
Max MP = INT × 3
Current MP = Max MP at Character creation
```

This supersedes the earlier incorrect Web draft that used `Max MP = POW`.

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
