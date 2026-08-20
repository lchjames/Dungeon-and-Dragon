# Canonical Character Status Rules

> Status: **Canonical override**  
> Date: 2026-08-21  
> Source basis: latest user-provided `人物表.xlsx` plus explicit Web redesign decisions.  
> This file supersedes any conflicting character-status/resource statements currently remaining in `docs/SITE_SPECIFICATION.md` until that document is consolidated.  
> Core integration behaviour is additionally locked by `docs/ALPHA_CORE_INTEGRATION_RULES.md`.

## 1. Keep / Remove Decisions

| Field / System | Canonical Web Decision |
|---|---|
| EXP | KEEP |
| Level | KEEP; automatically derived from cumulative EXP using the current Web Level 1–100 progression curve |
| Alignment / 陣營 | REMOVE |
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

The earlier workbook cube-root Level equation and the short-lived `2L² + 25L` Web curve are superseded for the Web game by the following Level 1–100 Alpha progression.

### 2.1 Current Level Cap

```text
Current Alpha Level Cap = 100
```

Level 100 is the current practical maximum. Future versions may extend the cap, but no Level above 100 is granted by the current resolver.

EXP itself is **not** capped at the Level 100 threshold. A Level 100 Character may continue accumulating cumulative EXP; the resolver preserves the full EXP total while returning `Level = 100` until a future rule extends the Level cap.

### 2.2 Ordinary Monster EXP Reference

Current Alpha baseline for a normal ordinary monster is:

```text
Ordinary Monster EXP
= 5 × Monster Level
```

This is a baseline for ordinary monsters, not a universal reward formula for elites, bosses, quests or story rewards.

### 2.3 Target Same-Level Ordinary Monsters per Level

The current Alpha progression is deliberately designed from the desired number of same-Level ordinary monsters needed to gain the next Character Level.

For a Character currently at Level `L`, where `1 <= L <= 99`:

```text
Target same-Level ordinary monsters
= ceil(6 × L^1.5)
```

Because one same-Level ordinary monster grants `5L EXP`, the required EXP for the next Level is:

```text
EXP required from Level L to Level L+1
= 5L × ceil(6 × L^1.5)
```

Equivalent smooth approximation:

```text
EXP to next Level
≈ 30 × L^2.5
```

The deterministic implementation should use the `ceil(6 × L^1.5)` form so the target monster count remains explicit and integer-valued.

Selected progression points:

| Current Level | Same-Level Ordinary Monsters | EXP to Next Level |
|---:|---:|---:|
| 1 | 6 | 30 |
| 5 | 68 | 1,700 |
| 10 | 190 | 9,500 |
| 20 | 537 | 53,700 |
| 25 | 750 | 93,750 |
| 30 | **986** | **147,900** |
| 40 | 1,518 | 303,600 |
| 50 | 2,122 | 530,500 |
| 60 | 2,789 | 836,700 |
| 75 | 3,898 | 1,461,750 |
| 80 | 4,294 | 1,717,600 |
| 90 | 5,123 | 2,305,350 |
| 95 | 5,556 | 2,639,100 |
| 99 | 5,911 | 2,925,945 |

This progression intentionally makes later Levels substantially harder to grind using ordinary enemies.

The Level 30 anchor is intentional:

```text
Level 30 → 31
≈ 1,000 same-Level ordinary monsters
```

This does not mean the intended campaign loop requires literally defeating around one thousand separate ordinary-monster encounters every Level. Bosses, elite enemies, quests, objectives, exploration rewards and story progression may provide substantially larger EXP awards. The ordinary-monster figure is the baseline used to establish the scale and to ensure ordinary grinding becomes increasingly inefficient at high Level.

### 2.4 Cumulative EXP Threshold

Because the per-Level requirement contains `ceil(6 × L^1.5)`, cumulative thresholds are stored/calculated as a deterministic sum rather than by the older closed-form equation:

```text
EXP Threshold(1) = 1

EXP Threshold(L)
= 1 + Σ [5k × ceil(6 × k^1.5)]
    for k = 1 to L-1
```

Selected thresholds:

| Level | Minimum Total EXP |
|---:|---:|
| 1 | 1 |
| 5 | 1,641 |
| 10 | 22,661 |
| 20 | 280,791 |
| 25 | 624,231 |
| 30 | 1,195,601 |
| 40 | 3,321,041 |
| 50 | 7,316,081 |
| 60 | 13,930,366 |
| 75 | 30,596,526 |
| 80 | 38,407,121 |
| 90 | 58,142,421 |
| 95 | 70,326,626 |
| 99 | 81,307,641 |
| 100 | **84,233,586** |

Implementation should derive Level from the highest threshold reached, then cap the result at Level 100.

Elite, boss, quest and campaign EXP multipliers remain separately tunable and must not silently alter the ordinary-monster baseline.

Player cannot directly edit EXP or Level. GM may add EXP, subtract EXP, or set Total EXP directly through authorised GM controls; every change is server-side, auditable and followed by automatic Level recalculation.

Normal Player-created Characters begin at `EXP = 1 / Level = 1`. GM-created/imported Characters may be assigned a Starting Level; the server converts that Level into the minimum EXP threshold for that Level so EXP remains authoritative.

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

Alpha creation flow is:

```text
Server/System Roll
→ Player may Reroll before finalisation
→ Player explicitly confirms the final generated set
```

The Player does not manually enter arbitrary permanent starting Attribute values. The exact reroll cap, if any, remains separately configurable unless explicitly locked later.

Permanent Attribute changes that alter derived Max HP/MP use the same Current-resource delta handling defined below.

## 4. HP

Character creation keeps the latest-sheet HP basis:

```text
Base HP = ceil((CON + SIZ) / 2)
```

HP and MP now share one Level 1–100 resource growth multiplier:

```text
G(Level)
= 1 + ((Level - 1) / 21.7)²
```

Calculated Max HP is:

```text
Calculated Max HP
= ceil(Base HP × G(Level))
```

Final Max HP supports an explicit GM-managed modifier rather than direct formula replacement:

```text
Final Max HP
= Calculated Max HP + HP Max Modifier
```

At Level 1 with a zero modifier:

```text
G(1) = 1
Final Max HP = Base HP
```

so the original workbook starting HP is preserved exactly.

For a representative Character with:

```text
CON = 12
SIZ = 13
Base HP = 13
HP Max Modifier = 0
```

selected values are:

| Level | Growth Multiplier | Max HP |
|---:|---:|---:|
| 1 | 1.00 | 13 |
| 10 | 1.17 | 16 |
| 20 | 1.77 | 23 |
| 30 | 2.79 | 37 |
| 40 | 4.23 | 55 |
| 50 | 6.10 | 80 |
| 60 | 8.39 | 110 |
| 70 | 11.11 | 145 |
| 75 | 12.63 | 165 |
| 80 | 14.25 | 186 |
| 85 | 15.98 | 208 |
| 90 | 17.82 | 232 |
| 95 | 19.76 | 257 |
| 99 | 21.40 | 279 |
| 100 | 21.81 | 284 |

This multiplicative design preserves the long-term importance of CON and SIZ: a Character with a larger Base HP remains proportionally tougher at high Level rather than having the original attributes drowned out by a large flat Level bonus.

Current HP starts at Final Max HP at Character creation.

When a permanent Level/Attribute/modifier change raises Final Max HP:

```text
Current HP += New Final Max HP - Old Final Max HP
```

This preserves the amount of missing HP rather than performing a full heal. If Final Max HP falls, clamp `Current HP = min(Current HP, New Final Max HP)`.

Ordinary HP recovery does not occur automatically every combat turn.

```text
Short Rest — HP
Only outside combat
2 rounds
→ recover ceil(Final Max HP × 10%)

Long Rest — HP
Only outside combat
5 rounds
→ recover ceil(Final Max HP × 50%)
```

A Character at `Current HP = 0` / Down / Dying cannot revive through ordinary rest recovery; they must first be legally restored above 0 HP by healing, treatment, an Item, an Ability or another approved effect.

Current HP cannot be negative and ordinary recovery cannot exceed Final Max HP.

## 5. MP

Character creation keeps the workbook baseline:

```text
Base MP = INT × 3
```

Max MP uses the same Level growth multiplier as HP:

```text
G(Level)
= 1 + ((Level - 1) / 21.7)²

Calculated Max MP
= floor(Base MP × G(Level))
```

Final Max MP supports an explicit GM-managed modifier:

```text
Final Max MP
= Calculated Max MP + MP Max Modifier
```

At Level 1 with a zero modifier this is exactly the original workbook value:

```text
Level 1 Final Max MP = INT × 3
```

The curve is calibrated so a representative `INT = 12` Character reaches the current standard Rank 9 MP cost (`640 MP`) at approximately Level 90 rather than only at the Level cap.

For `INT = 12` and zero modifier:

| Level | Max MP |
|---:|---:|
| 1 | 36 |
| 10 | 42 |
| 20 | 63 |
| 30 | 100 |
| 40 | 152 |
| 50 | 219 |
| 60 | 302 |
| 70 | 399 |
| 75 | 454 |
| 80 | 513 |
| 85 | 575 |
| 90 | **641** |
| 95 | 711 |
| 99 | 770 |
| 100 | 785 |

Therefore:

```text
Representative INT 12 Character
Level 90 Max MP = 641
Standard Rank 9 MP Cost = 640
→ can fund one standard Rank 9 activation from a full MP pool
```

INT remains mechanically important because the Level multiplier scales the Character's own Base MP rather than adding a mostly attribute-independent flat amount.

Selected comparisons with zero modifier:

| INT | Lv90 Max MP | Lv100 Max MP |
|---:|---:|---:|
| 8 | 427 | 523 |
| 10 | 534 | 654 |
| 12 | **641** | 785 |
| 15 | 801 | 981 |
| 18 | 962 | 1,177 |

A lower-INT Character may therefore need equipment, Buffs, special progression or another approved source to fund Rank 9 earlier, while a high-INT Character has substantially more remaining MP after using high-Rank abilities.

Owning or qualifying for a Rank 9 Ability remains separate from having enough Current / Max MP to activate it.

Current MP starts at Final Max MP when the Character is created.

When a permanent Level/Attribute/modifier change raises Final Max MP:

```text
Current MP += New Final Max MP - Old Final Max MP
```

If Final Max MP falls, clamp `Current MP = min(Current MP, New Final Max MP)`.

Exact MP recovery/action rules are defined in `基礎動作與MP資源消耗_ALPHA.md` and the Alpha Core Integration rules. Ordinary MP cannot exceed Final Max MP unless an explicit Temporary MP / Overcharge Profile says otherwise.

This supersedes the short-lived additive `INT × 3 + floor((Level - 1)² / 15)` Web curve, the earlier Web draft that used only `Max MP = INT × 3` at every Level, and the older incorrect draft that used `Max MP = POW`.

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

Alignment / 陣營 is removed from the Web Character model.

```text
No Character-creation Alignment field
No Player Overview Alignment field
No Alignment-based mechanics
No GM-managed Alignment state
```

Older spreadsheet/site references that retain Alignment are superseded by this rule.

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
├── HP Current / Final Max
├── MP Current / Final Max
└── Damage Bonus
```

Do not display Alignment, IDEA or KNOW as Character status fields.

Player-facing Current HP/MP are not arbitrary edit fields. Ordinary changes are resolved through Damage, Healing, Ability cost, Focus, Rest, Items/effects and other approved server actions. GM may make authorised corrective adjustments. All authoritative values are stored in D1.
