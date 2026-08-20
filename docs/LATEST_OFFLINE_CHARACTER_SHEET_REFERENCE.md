# Latest Offline Character Sheet Reference

> Source: user-provided `人物表.xlsx` on 2026-08-20.  
> Status: **Latest offline-sheet reference. Supersedes the previously analysed offline workbook.**  
> Purpose: Record what the latest spreadsheet actually contains so future Web/D1 design work does not accidentally inherit rules from the wrong workbook.

This document describes the source workbook. It does **not** automatically reverse later Web-specific decisions already explicitly confirmed by the user (for example D1-only persistence, Player-created Level-1 characters, GM-managed Class/Occupation, removal of the fixed language system, and removal of Cthulhu Mythos).

---

# 1. Workbook Structure

The workbook contains three visible sheets:

1. `人物表(自動計算)`
2. `持有道具`
3. `持有技能法術`

There is no separate manual character-sheet tab in this version.

---

# 2. Character Identity Fields

The latest character sheet contains:

- 探索者姓名 / Character Name
- 職業 / Occupation
- 陣營 / Alignment
- 年齡 / Age
- 性別 / Gender
- EXP
- 等級 / Level

Notably, this workbook does **not** contain the older Player Name, School/Education-background, Birthplace, Residence or Era fields that appeared in the previously analysed workbook.

For the Web version, authenticated User ownership replaces any Player Name field. Occupation remains subject to the already-confirmed rule that a new Player character does not choose a starting occupation; GM assigns/manages it later.

Alignment is present in this latest source and requires a separate Web decision about whether it is Player-selected, GM-managed, or optional.

---

# 3. Core Attributes and Derived Values

The sheet uses the following core Attribute slots:

- STR / 力量
- DEX / 敏捷
- CON / 體質
- APP / 外貌
- POW / 意志
- INT / 智力
- SIZ / 體型
- EDU / 教育
- LUCK / 幸運

The current spreadsheet also contains these legacy/custom derived fields:

- IDEA / 靈感 = `POW × 5`
- Mind/SAN maximum / 心智值 = `min(99, INT × 5)`
- KNOW / 知識 = `min(99, EDU × 5)`
- Current SAN = `Mind/SAN maximum - SAN adjustment`
- HP maximum = `ceil((CON + SIZ) / 2)`
- MP maximum = `INT × 3`
- Dodge initial value = `DEX × 2`

Important correction from the previously analysed workbook:

```text
Latest workbook Max MP = INT × 3
```

not `POW`.

The sheet contains a LUCK field but does not contain an automatic LUCK formula. Therefore the workbook itself does not prove `LUCK = POW × 5` or `LUCK = 3D6 × 5`; the Web LUCK generation rule remains a separate explicit design decision.

---

# 4. Damage Bonus

The spreadsheet comment defines Damage Bonus from `STR + SIZ`:

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

The workbook presents this as a reference rule rather than a cell formula.

---

# 5. EXP and Level System — Exact Latest Formula

The latest workbook finally contains the previously missing EXP-to-Level equation.

EXP is entered at `I8` and Level is calculated at `AE6`.

Exact Excel formula:

```excel
=ROUNDDOWN(-51 + 841/(24364 + 25 * I8 + 5 * SQRT(-48753 + 48728 * I8 + 25 * I8^2))^(1/3) + (24364 + 25 * I8 + 5 * SQRT(-48753 + 48728 * I8 + 25 * I8^2))^(1/3),0) - 6
```

Equivalent compact mathematical form, with `E = EXP`:

```text
A = 24364 + 25E + 5√(25E² + 48728E - 48753)
Level = floor(A^(1/3) + 841/A^(1/3) - 57)
```

The workbook starts with:

```text
EXP = 1
Level = 1
```

This is significant because the square-root term is invalid at EXP 0. Therefore the latest offline source uses **1 as the starting EXP value**, not 0.

The same formula can be algebraically related to the Level threshold polynomial:

```text
EXP ≈ (L³ + 171L² + 7224L - 7346) / 50
```

For implementation, preserve the workbook's intended threshold behaviour rather than silently substituting an unrelated common RPG EXP curve.

---

# 6. Skill Point System in the Latest Workbook

The workbook still has two creation-era allocation columns:

- 職業 / Occupation
- 興趣 / Interest

and a separate:

- 成長 / Growth

Skill total uses:

```text
Skill Total
= min(99, Initial + Occupation + Interest + Growth)
```

The two old pool totals are:

```text
Occupation total = EDU × 20
Interest total   = INT × 10
```

The latest workbook's available Occupation-point formula is:

```excel
=AQ11-SUM(N14:O50,AK14:AL50) + (AE6 - 1) * 5
```

Meaning the spreadsheet currently adds:

```text
(Level - 1) × 5
```

to the available Occupation-point pool.

This is direct evidence that the old/latest offline system already linked Level progression to additional Skill points.

However, the user explicitly stated in the current Web redesign that the **final number of Skill Points granted per Level is not yet decided**. Therefore `+5 per Level` is recorded here as the latest workbook's current value/reference, **not yet a locked Web rule**.

The Web redesign has also already chosen to merge starting creation points into one creation pool rather than preserve separate Occupation/Interest pools.

---

# 7. Latest Workbook Skill Catalogue and Initial Values

The following are the non-empty skills in the latest workbook.

## Communication

- 說服 / Persuasion — 15
- 信譽度 / Reputation — 15
- 心理學 / Psychology — 5
- 議價 / Bargaining — 5
- 變裝 / Disguise — 1

## Operation / Practical

- 駕駛 / Driving — 20
- 繪畫 / Drawing — 10
- 操縱機械 / Machine Operation — 10
- 工藝製作【】 / Craft【specialization】 — 10
- 資料查詢 / Information Search — 25
- 盜竊 / Theft — 10

## Medical

- 急救 / First Aid — 30
- 精神分析 / Psychoanalysis — 1

## Knowledge

The latest workbook provides slots for:

- 物理學 / Physics — 0
- 化學 / Chemistry — 0
- 植物學 / Botany — 0
- 生物學 / Biology — 0
- 天文學 / Astronomy — 0
- 地質學 / Geology — 0
- 機關學 / Mechanism/Mechanics — 0
- 藥劑學 / Pharmacology — 0
- 醫學 / Medicine — 0
- 魔法知識 / Magic Knowledge
- 神祕學 / Mysticism/Occult

These specialist/setting-dependent skills should not automatically become universal Web Root Skills.

## Action

- 觀察 / Observation — 10
- 聆聽 / Listening — 10
- 躲藏 / Hiding — 10
- 藏東西 / Conceal Object — 10
- 開鎖 / Lockpicking — 1
- 游泳 / Swimming — 10
- 跳躍 / Jumping — 10
- 追蹤 / Tracking — 10
- 攀登 / Climbing — 10

## Combat

- 投擲 / Throwing — 5
- 空手 / Unarmed — 5
- 槍械 / Firearms — 5
- 棍棒 / Club — 5
- 刀/劍 / Knife/Sword — 5
- 法術 / Spell — 0
- 閃躲 / Dodge — `DEX × 2`

There are also blank/custom skill slots.

For the Web redesign, use these values as evidence for the intended **base-value scale**, while retaining the already-confirmed cross-genre Root Skill philosophy and allowing specialist skills to be learned later.

---

# 8. Separate Rank / Progression Tracks Present in the Latest Workbook

The latest sheet contains three distinct rank ladders in addition to numeric Character Level.

## Magic Rank / 魔法等級

1. 不入流
2. 初級魔法學徒
3. 一級元素魔法學徒
4. 二級見習元素法師
5. 三級正式元素法師
6. 四級資深元素法師
7. 五級大魔法師
8. 六級魔導士
9. 七級大魔導士
10. 八級魔導師
11. 九級大魔導師

## Martial Rank / 武道等級

1. 不入流
2. 初學弟子
3. 初級戰士
4. 中級戰士
5. 高級戰士
6. 初級戰將
7. 中級戰將
8. 高級戰將
9. 初級戰神
10. 中級戰神
11. 高級戰神

## Adventurer Rank / 冒險者等級

1. 普通人
2. 銅級
3. 鐵級
4. 銀級
5. 金級
6. 白金級
7. 秘銀級
8. 山銅級
9. 精鋼級

The workbook shows these as rank/reference ladders; no formulas were found that automatically calculate them.

The Web version must decide whether these become:

- optional Campaign-specific progression tracks;
- GM-managed Character rank fields;
- Skill Tree mastery/rank systems; or
- are omitted from the universal core.

They should not be confused with the EXP-derived numeric Character Level.

---

# 9. Attack Section

The character sheet includes an `攻擊方式 / Attack Method` section with rows such as:

- 武器戰鬥 / Weapon Combat — 100%
- 法術戰鬥 / Spell Combat — 100%
- 投擲物 / Thrown Object — 25%

and additional blank rows.

The Web version should continue treating Attacks as structured records rather than merging them into Inventory.

---

# 10. Inventory Sheet

`持有道具` contains a dedicated money section:

- 銅幣 / Copper
- 銀幣 / Silver
- 金幣 / Gold

and item columns:

- 物品名稱 / Item Name
- 說明 / Description
- 數量 / Quantity
- 攻擊力 / Attack
- 防禦力 / Defence

The fixed copper/silver/gold currency model is fantasy-oriented. For a cross-genre Web system, money/currency should therefore be data-driven per Campaign rather than hard-coded globally.

Item Attack/Defence values are useful source fields and should be available as optional item metadata.

---

# 11. Held Skills / Spells Sheet

`持有技能法術` defines learned Skill/Spell records with these columns:

- 技能名稱 / Skill Name
- 說明 / Description
- 目標 / Target
- 效應範圍 / Area of Effect
- 效應距離 / Range
- 加成1 / Bonus 1
- 加成2 / Bonus 2
- 加成3 / Bonus 3
- 消耗法力 / MP Cost

This is important for the Web learned-skill / Skill Tree node model. A learned Node should be able to carry structured mechanical metadata such as target, range, area, modifiers and Resource cost, rather than only a name and description.

---

# 12. Web Decisions That Remain in Force Despite the Source Workbook

The following were explicitly confirmed after the offline system and should continue unless the user later changes them:

- Cloudflare D1 is the only persistent game-data source of truth.
- Do not use localStorage for persistent Character/game data.
- Player creates their own Character.
- New Character is Level 1.
- Starting Class/Occupation is not entered by Player and is handled later by GM.
- Cthulhu Mythos is removed from the Web system.
- The fixed language catalogue/system is removed.
- Starting universal Skills should be cross-genre rather than copying all setting-specific spreadsheet Skills.
- Players can learn/add unique Skills later through progression.
- Starting Skill allocation remains Player-controlled.
- Creation points and post-Level-up Skill Points are separate concepts.
- Character EXP is one Character-wide pool.
- GM awards EXP.
- EXP determines Character Level.
- Level-up grants Skill Points.
- Post-creation Skill Points are used to increase Skills and/or unlock new Skill Tree nodes.
- Exact Level-up Skill Point award quantity is still not finalized.
- Player persistent Character edits use a GM approval workflow.

---

# 13. Current Reconciliation Items

Because the previously analysed workbook was wrong, these items must be treated as needing explicit reconciliation before implementation:

1. **Starting EXP** — latest workbook uses `1`; current Web spec previously said `0`.
2. **Exact EXP equation** — now recovered from the latest workbook and should replace the placeholder.
3. **Max MP** — latest workbook uses `INT × 3`; current Web spec previously used `POW`.
4. **LUCK generation** — latest workbook has an independent LUCK field but no formula; Web rule must remain explicit/configured.
5. **SAN/Mind value** — present in latest workbook; whether Web keeps it core, optional, or removes it needs explicit confirmation.
6. **Alignment** — present in latest workbook; Player/GM ownership of the field needs confirmation.
7. **Magic/Martial/Adventurer ranks** — present as separate ladders; their Web role needs confirmation.
8. **Level-up Skill Points** — workbook currently uses +5 per Level, while current Web redesign has deliberately left the final amount undecided.
9. **Learned Skill/Spell mechanics** — latest workbook contains Target/Area/Range/Bonuses/MP Cost and these should inform the new Skill Tree node schema.

Until these are reconciled, do not use values inherited from the previously analysed workbook as authoritative.