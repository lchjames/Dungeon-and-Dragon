# Player Pages — Alpha UI/Interaction Specification

> Status: **Alpha working specification**.  
> Purpose: Define what a Player can see and do on the Player-facing Character pages.  
> Balance numbers and exact Skill costs remain tunable during Alpha testing.

---

# 1. Alpha Balance Defaults

The following are temporary Alpha defaults chosen so implementation can continue without blocking on final balance tuning:

- Starting Root Skill list: use the current 27 cross-genre Root Skills as the initial Alpha set.
- Starting Base Values: assign conservative values by category; exact per-Skill values may be tuned during Alpha.
- Creation Skill Point Pool: keep the current working composite formula and 90–120 clamp for Alpha.
- Starting Skill hard cap: 70.
- Character creation must spend the full Creation Skill Point Pool before finalizing.
- Dodge may remain a special derived starting value if testing shows it is useful; otherwise it can be normalized later.
- Post-creation Level-up Skill Points: exact points per Level remains TBD/configurable.
- Skill Point costs for Skill increases and Node unlocks remain TBD/configurable.

These are Alpha implementation defaults, not permanent balancing decisions.

---

# 2. Player Navigation

Primary Player Character navigation:

```text
Character Overview
Skill Tree
Combat
Inventory
Skills / Spells
Requests
```

The Character selector stays available in the global Player header so a User can switch between owned Characters without returning to a separate menu.

Global header should show:

- authenticated User display name;
- current Character name;
- Character selector;
- Character Level;
- EXP progress summary;
- Skill Points Available;
- Lock / logout action.

---

# 3. Character Overview Page

The Overview page is the compact summary of the full Character state.

## 3.1 Identity

Show:

- Character Name
- Class / Occupation
- Age
- Gender
- Level
- Total EXP
- EXP to next Level
- Portrait
- Background summary

Alignment / 陣營 is removed from the Web Character model and is not shown on Player pages.

Class/Occupation starts Unassigned and is GM-managed.

## 3.2 Core Attributes

Show the permanent core Attribute grid:

```text
STR  DEX  CON
APP  POW  INT
SIZ  EDU  LUCK
```

## 3.3 Core Status / Resources

Show:

- Mind / SAN
- HP Current / Max
- MP Current / Max
- Damage Bonus

Confirmed removals:

- Alignment / 陣營 is not shown.
- IDEA is not shown.
- KNOW is not shown.

## 3.4 Progression Tracks

Show separate progression/rank tracks:

- Magic Rank
- Martial Rank
- Adventurer Rank

These are separate from Character Level.

Alpha may initially seed the latest workbook's three track types while the D1 model remains extensible for future custom tracks.

## 3.5 Progression Summary

Show:

- Level
- Total EXP
- EXP progress bar
- Skill Points Earned
- Skill Points Spent
- Skill Points Available

## 3.6 Pending Changes

If any Character Change Requests are pending, show a clear indicator with count and a link to Requests.

---

# 4. Skill Tree Page

The Skill Tree is the primary long-term Character-growth interface.

## 4.1 Main workspace

Use a large full-page SVG graph workspace.

Support:

- drag/pan;
- mouse-wheel zoom;
- mobile pinch zoom;
- centre/reset view;
- node search;
- category filter;
- learned-path highlighting;
- prerequisite-path highlighting;
- locked/available/learned/mastered visual states;
- Skill Points Available shown persistently.

## 4.2 Node card/detail panel

Clicking a node opens a detail panel showing:

- Skill / Node name
- category
- node type
- current Skill value/rank if applicable
- description
- Skill Point cost
- prerequisite Nodes
- required Character Level
- required Attribute values
- required parent Skill/rank
- training / teacher / quest / item / Class / GM requirements
- current requirement completion status
- source/how it was learned

If the node represents an active Skill/Spell, also show:

- Target
- Area of Effect
- Range
- MP Cost
- Bonus/Effect fields

## 4.3 Spending Skill Points

For an available node:

```text
Unlock <Skill>
Cost: N SP
After purchase: X SP remaining
```

Require explicit confirmation before spending.

For an existing numeric Skill, a separate Upgrade action may appear when allowed.

The server validates all costs/prerequisites against D1 before applying the progression transaction.

## 4.4 Node types

Alpha node types:

```text
ROOT
LEARNED
SPECIALIZATION
MASTERY
UNIQUE / EVENT
CLASS / GM-GRANTED
```

Some story/event nodes may be GM-granted and cost zero SP.

---

# 5. Combat Page

The Combat page is not an Inventory duplicate. It is the Character's usable combat profile.

## 5.1 Combat summary

Top section shows:

- HP Current / Max
- MP Current / Max
- Damage Bonus
- Dodge
- relevant combat/status conditions
- available combat Skill Points only if a pending upgrade is possible

## 5.2 Attack list

Each Attack entry shows:

```text
Attack Name
Linked Skill
Hit / Check Value
Damage Formula
Damage Type
Range
Area / Target
Attacks per Round
MP / Resource Cost
Source Item / Skill
Notes
```

Example types:

- Unarmed attack
- Weapon attack
- Ranged attack
- Spell attack
- Throwing attack
- custom learned technique

## 5.3 Attack detail

Selecting an Attack opens a side/detail panel with full calculation breakdown:

```text
Base linked Skill
+ item/skill bonus
+ situational modifiers
= displayed attack/check value
```

The page should clearly distinguish permanent Character data from temporary situational modifiers.

## 5.4 Player actions

Alpha Player actions:

- view attacks;
- expand calculation/details;
- submit a request to add/edit an Attack if it represents persistent Character data;
- jump to linked Inventory Item;
- jump to linked Skill Tree Node.

Do not let the Player silently overwrite authoritative Attack definitions.

---

# 6. Inventory Page

The Inventory page is a structured item manager backed by D1.

## 6.1 Currency

Show a compact money/currency panel.

Alpha seeds the latest sheet's:

- Copper
- Silver
- Gold

but the D1 model should support arbitrary Campaign currencies.

## 6.2 Item list

Default columns/cards:

```text
Item Name
Category
Description
Quantity
Attack
Defense
Weight (optional)
Value (optional)
Equipped status
Linked Attack / Skill
```

Allow search, category filters and equipped-only filtering.

## 6.3 Item detail

Selecting an Item opens details including:

- full description;
- quantity;
- stats/effects;
- attack/defense values;
- resource modifiers;
- linked Attack;
- linked Skill/Spell;
- source/acquisition note;
- GM notes if Player-visible.

## 6.4 Persistent edits

Player item changes are proposed through Change Requests unless a future Campaign rule provides an automated transactional inventory system.

Examples:

- add item;
- remove item;
- change quantity;
- edit description;
- equip/unequip when equipment state is treated as persistent authoritative data.

Pending requested changes should be visibly marked without pretending they are already approved.

---

# 7. Skills / Spells Page

This page is a structured list/detail view of **learned active abilities**, complementary to the graph-based Skill Tree.

The Skill Tree answers: "How did this Character develop?"

The Skills / Spells page answers: "What can this Character actually use now?"

## 7.1 List view

Support search/filter by:

- Skill / Spell / Technique type;
- category;
- active/passive;
- MP/resource cost;
- combat/non-combat;
- source/Class;
- learned/mastered state.

Each row/card should show:

- Name
- short description
- type/category
- current rank/value
- Target
- Range
- MP/resource cost

## 7.2 Full ability detail

Based on the latest offline `持有技能法術` sheet, support:

```text
Name
Description
Target
Area of Effect
Range
Bonus / Effect 1
Bonus / Effect 2
Bonus / Effect 3
MP / Resource Cost
Linked Root / Parent Skill
Skill Tree Node
Rank / Mastery
Requirements
Source
Notes
```

The data model should allow more than three Effects in the future even if the Alpha UI visually begins with the latest sheet's three-effect pattern.

## 7.3 Relationship with Skill Tree

Every learned ability should be able to link back to its Skill Tree node.

From the ability page:

```text
View in Skill Tree
```

From a Skill Tree node:

```text
Open Ability Details
```

## 7.4 Player changes

Learning/unlocking normally uses Skill Point progression and prerequisites, not a generic Change Request.

Editing descriptive or custom persistent ability data uses a Change Request where applicable.

GM may directly grant special/event abilities with audit history.

---

# 8. Requests Page

This page exposes Player-initiated Character modification requests.

## 8.1 Summary tabs

```text
Pending
Approved
Rejected
Cancelled
All
```

Show a badge count for Pending.

## 8.2 Request card

Each request shows:

- request type;
- target Character/entity;
- submitted date;
- status;
- Current value / data;
- Proposed value / data;
- Player reason;
- GM response/comment;
- reviewed date where applicable.

## 8.3 Player actions

Player may:

- submit a new supported request;
- inspect request details;
- cancel their own Pending request;
- see GM approval/rejection comments.

Player may not approve their own requests.

## 8.4 What does NOT use Requests

The following progression actions use their own protected systems instead:

- GM EXP awards;
- automatic Level changes from EXP;
- Level-up Skill Point grants;
- valid Skill Point spending;
- GM-assigned Class/Occupation;
- GM-granted story/special Nodes.

---

# 9. Cross-Page Linking

The Player UI should avoid isolated tables. Entities should cross-link:

```text
Inventory Item
  ↔ Attack
  ↔ Learned Skill / Spell
  ↔ Skill Tree Node

Skill Tree Node
  ↔ Learned Ability
  ↔ Class / Progression requirement

Attack
  ↔ Linked Skill
  ↔ Source Item

Request
  ↔ Target entity
```

This is a major design principle for Alpha because it makes the Character sheet feel like one system rather than several unrelated spreadsheets.

---

# 10. Alpha Page Priority

Recommended implementation sequence:

1. Character Overview
2. Inventory
3. Skills / Spells
4. Combat
5. Requests
6. Skill Tree graph

The Skill Tree is strategically important but technically heavier, so the underlying Skill/Ability data should exist first. This allows the graph to visualize real D1 content rather than forcing the data model to follow a decorative graph prototype.
