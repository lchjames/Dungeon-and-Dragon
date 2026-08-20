# D&D Campaign Hub — Site & Character System Specification

> Status: **Canonical design document**  
> Purpose: Source of truth for website, database, Player, GM, character creation, character sheet, EXP/Level progression, Skill Tree and approval workflow development.  
> Production site: `https://dungeon-and-dragon.lchjames.com/`

---

# 1. Product Direction

D&D Campaign Hub is a web-based TRPG character and campaign management system intended to support mixed settings such as fantasy, science fiction, modern, horror and custom worlds.

The old offline spreadsheet is a structural reference, not something to copy literally. The web version keeps the useful Character-sheet and progression concepts while removing setting-specific CoC elements that are not required by the new system.

The platform has two separated workspaces:

- **Player** — create/unlock a User, create owned Characters, allocate starting Skill points, view Character data, spend earned Skill Points through approved progression rules, and submit proposed Character changes.
- **GM** — administer campaigns, award EXP, manage Classes/Occupations, manage Skill definitions/trees, review change requests, and maintain Campaign rules.

---

# 2. Non-Negotiable Storage Rule

## 2.1 Cloudflare D1 is the only persistent source of truth

All persistent application/game data must live in Cloudflare D1, including:

- Users and Key verification data
- Session metadata
- Characters and ownership
- Character Level
- Character EXP
- earned/spent/available Skill Points
- Class / Occupation
- Attributes
- LUCK
- HP / MP / Resources
- Skill definitions
- Character Skill values
- Skill Tree nodes and edges
- starting Skill-point allocations
- learned Skill Nodes
- Inventory
- Attacks
- Notes
- Character change requests
- approval/audit history
- EXP award history
- Level-up history
- Skill Point spending history
- Campaign settings
- GM settings
- Character-generation results
- progression history

## 2.2 Do not use localStorage as application persistence

The application must not use browser localStorage for persistent User, Character, EXP, Level, Skill, Skill Point, Inventory, Resource, progression, approval or Campaign data.

Do not build local-first Character data, browser/database synchronization as the normal model, authoritative Character snapshots in localStorage, or pending changes that exist only in the browser.

Temporary form/UI state may exist in page memory while the page is open. If resumable creation is required, drafts must be saved to D1.

Authentication state uses a Secure + HttpOnly server-issued cookie.

```text
Browser UI
    ↓ HTTPS API
Cloudflare Worker
    ↓
Cloudflare D1
```

D1 is authoritative.

---

# 3. Player Identity

Normal Player access uses only:

- **User** — player-facing name
- **Key** — exactly four numeric digits

No email address or traditional long password is required for normal Player access.

The Key must never be stored in plaintext.

One User may own multiple Characters.

---

# 4. Character Ownership

Every Character belongs to a User through D1:

```text
characters.owner_user_id -> users.id
```

When a Player creates a Character, the Worker resolves the authenticated Session and writes the current `user.id` as `owner_user_id`. Client input cannot choose another owner.

All Player Character APIs must scope access server-side to the authenticated User.

---

# 5. Site Structure

```text
/
├── /player/
│   ├── /login/
│   ├── /register/
│   └── Player Workspace
│
└── /gm/
    └── GM Workspace
```

Player and GM interfaces remain visually and functionally separated.

---

# 6. Character-Creation Philosophy

Confirmed starting principles:

- Player creates their own Character.
- Every Character begins at **Level 1**.
- Starting EXP is **0**.
- Starting progression Skill Points are **0**.
- Player cannot choose starting Level.
- Player cannot choose starting EXP.
- Player does not choose Class / Occupation during creation.
- Class / Occupation begins **Unassigned**.
- GM assigns/develops Class / Occupation later.
- Eight core Attributes are generated randomly by the server.
- Attribute rolls are directly assigned and cannot be redistributed.
- Server applies a total-stat balance gate.
- Player cannot farm rerolls.
- LUCK is independently randomized.
- HP and MP are core starting Resources.
- Level-1 Characters receive a genre-neutral Root Skill set.
- Starting Skill points are freely allocated by the Player during creation.
- Creation Skill Points are separate from post-creation Level-up Skill Points.
- After play begins, **EXP drives Level**.
- **Level-ups grant Skill Points**.
- Skill Points are used to improve existing Skills and/or unlock new Skill Tree Nodes.
- GM is the normal source of EXP awards.

---

# 7. Character Identity and Creation Inputs

## 7.1 Player-provided creation fields

The initial creation form should remain short:

| Field | Required | Notes |
|---|---:|---|
| Character Name | Yes | main display name |
| Age | No | background |
| Gender | No | background |
| Portrait | No | character image |
| Background / Summary | No | free-form background |

The old spreadsheet Player Name field is removed because ownership already comes from the authenticated User.

## 7.2 Server-controlled starting values

| Field | Starting value | Controlled by |
|---|---|---|
| Owner | authenticated User | Server |
| Level | `1` | Server |
| EXP | `0` | Server / later GM awards |
| Progression Skill Points | `0` | Server / Level-up system |
| Class / Occupation | `NULL` / Unassigned | GM later |
| Status | `active` | Server |
| STR/DEX/CON/APP/POW/INT/SIZ/EDU | random generation | Server |
| LUCK | random generation | Server |
| Max HP | calculated | Server |
| Max MP | calculated | Server |
| Damage Bonus | calculated | Server |
| Creation Skill Point Pool | calculated | Server |

The Player chooses only how the valid Creation Skill Point Pool is allocated among available Level-1 Root Skills.

---

# 8. Level, EXP and Class Rules

## 8.1 Starting Level

```text
Level = 1
EXP = 0
```

No Level or EXP input is shown during Character creation.

## 8.2 EXP is one Character-wide pool

EXP is not stored separately per Skill.

```text
Character
├── Level
└── Total EXP
```

The Character has one cumulative EXP value used by the Level system.

## 8.3 EXP determines Level automatically

When EXP changes, the Worker must calculate the Character's Level using the **existing user-defined EXP-to-Level equation**.

The old web code and available spreadsheet data preserve the EXP field but do not contain the original mathematical expression. Therefore:

```text
Level = USER_DEFINED_EXP_EQUATION(Total EXP)
```

This is a required canonical rule placeholder, not a substitute formula.

**Do not invent a replacement EXP equation.**

The exact mathematical expression must be inserted into this document and the server-side rules layer when recovered/provided.

Normal flow:

```text
GM awards EXP
      ↓
Total EXP changes
      ↓
Worker applies EXP equation
      ↓
Calculated Level changes if threshold reached
      ↓
Level-up event recorded
```

The Player does not manually request or select the Level reached by EXP.

## 8.4 Level-up grants Skill Points

When the EXP equation causes the Character to reach a new Level, the system grants progression Skill Points.

The exact number of Skill Points granted per Level is **not yet confirmed**.

It must be rules/config driven rather than hard-coded into the Skill Tree UI.

Conceptually:

```text
Level 1
  ↓ enough EXP
Level 2
  ↓
+ N Skill Points
```

If a single EXP award skips multiple Levels, the system must grant the Skill Point reward for every Level crossed.

## 8.5 Starting Class / Occupation

Every new Character starts with:

```text
Class / Occupation = Unassigned
```

Database equivalent may be:

```text
class_id = NULL
occupation = NULL
```

GM may later assign/change Class based on story development, training, behavior, factions, achievements, transformations, Campaign rules or special events.

Class is a progression/story result, not a starting build choice.

---

# 9. Core Character Attributes

Eight primary Attributes are retained:

| Code | Name | Meaning | Starting roll |
|---|---|---|---|
| STR | Strength / 力量 | physical strength | 3D6 |
| DEX | Dexterity / 敏捷 | speed, coordination, reaction | 3D6 |
| CON | Constitution / 體質 | health, stamina, endurance | 3D6 |
| APP | Appearance / 外貌 | presence and impression | 3D6 |
| POW | Power / 意志 | resolve, will, supernatural potential | 3D6 |
| INT | Intelligence / 智力 | reasoning and problem solving | 2D6 + 6 |
| SIZ | Size / 體型 | physical size/build | 2D6 + 6 |
| EDU | Education / 教育 | general learned knowledge | 3D6 + 3 |

D1 should use an extensible Attribute structure so Campaign-specific Attributes can be added later without redesigning the database.

---

# 10. Random Attribute Generation and Balance

## 10.1 Direct assignment

```text
STR -> 3D6
DEX -> 3D6
CON -> 3D6
APP -> 3D6
POW -> 3D6
INT -> 2D6 + 6
SIZ -> 2D6 + 6
EDU -> 3D6 + 3
```

The Player cannot redistribute results.

## 10.2 Server-side generation only

The Worker generates and validates final starting Attribute numbers. The browser never supplies trusted starting Attribute values.

## 10.3 Confirmed total-stat balance gate

```text
Primary Total = STR + DEX + CON + APP + POW + INT + SIZ + EDU
```

Accepted range:

```text
84 <= Primary Total <= 100
```

If a complete set is outside the range, the Worker rerolls the entire set internally until one accepted set is produced.

## 10.4 Individual extremes remain valid

Only total starting power is bounded. A Character may still have an unusually weak or strong individual Attribute.

## 10.5 No reroll farming

Once the server produces a valid starting set for a Character creation, that accepted result is locked for the creation process.

GM may later perform an administrative reroll/reset with audit history if such a function is enabled.

---

# 11. LUCK

LUCK is a permanent cross-genre Character value and is independent of POW.

Confirmed initial rule:

```text
LUCK = 3D6 × 5
```

Range:

```text
15–90
```

LUCK is rolled server-side and stored in D1. It is not included in the eight-Attribute `84–100` balance gate.

---

# 12. HP, MP and Damage Bonus

## 12.1 HP

```text
Max HP = ceil((CON + SIZ) / 2)
Current HP = Max HP at creation
```

## 12.2 MP

MP is a core starting Resource in the initial ruleset.

```text
Max MP = POW
Current MP = Max MP at creation
```

## 12.3 Damage Bonus

Damage Bonus is automatically calculated from STR + SIZ using the configurable legacy/custom table.

## 12.4 Removed mandatory CoC fields

The following are not mandatory core Character fields:

- IDEA
- KNOW
- SAN
- Cthulhu Mythos

A Campaign may add SAN or another Resource separately.

---

# 13. Starting Skill Allocation System

## 13.1 Core principle

The web version retains the useful allocation concept of the old spreadsheet:

```text
Starting Skill Value
= Initial Base Value
+ Creation Allocation
```

The Player chooses where to spend starting Skill points.

Starting Skill values are not automatically determined by STR/DEX/INT formulas.

## 13.2 Creation Skill Points (CSP)

There is no separate Occupation Point pool because Level-1 Characters do not have a Class/Occupation yet.

There is no separate Interest Point pool.

Both are replaced by one creation-only pool:

```text
Creation Skill Points (CSP)
```

CSP exists only for Character creation and is not the same currency as Skill Points earned through Level-ups.

## 13.3 Composite CSP source

Current working formula:

```text
Raw CSP
= 60
+ INT
+ EDU
+ floor(POW / 2)
+ floor(DEX / 2)
+ floor(APP / 2)
+ floor(LUCK / 10)
```

Then:

```text
Creation Skill Points = clamp(Raw CSP, 90, 120)
```

Therefore a Level-1 Character begins with 90–120 distributable creation points rather than several hundred points.

The exact coefficients live in the server-side rules/configuration layer.

## 13.4 Level-1 Skill cap

Hard creation rule:

```text
Final Starting Skill Value <= 70
```

For every Root Skill:

```text
Initial Base Value + Creation Allocation <= 70
```

The UI stops additional allocation once a Skill reaches 70. The Worker independently validates the same limit.

Values above 70 can only be reached later through the post-creation progression system.

## 13.5 Allocation validation

Before creation can be finalized:

- every allocation must be a non-negative integer;
- total allocated points must not exceed the Character's CSP;
- initial implementation should require all CSP to be spent;
- no starting Skill may exceed 70;
- client-calculated totals are not trusted;
- Worker recalculates CSP from authoritative Attributes/LUCK;
- Worker validates every allocation and final Skill value;
- accepted allocation is persisted in D1.

## 13.6 Starting Skill data model

```text
Character Skill
├── skill_definition_id
├── base_value
├── creation_allocation
├── progression_investment
├── current_value
├── node_state
├── rank / mastery metadata
└── source metadata
```

At Level 1 creation:

```text
progression_investment = 0
current_value = base_value + creation_allocation
```

Post-creation increases must come through the Skill Point progression system rather than an unexplained free-form `growth_value`.

---

# 14. Root Skill Set — Current Working List

The Root Skill list remains genre-neutral and avoids world-specific specializations.

## Awareness / Mental

- Perception / 觀察
- Investigation / 調查
- Insight / 洞察
- Tracking / 追蹤
- General Knowledge / 常識
- Concentration / 專注

## Physical

- Athletics / 運動
- Acrobatics / 靈巧
- Stealth / 潛行
- Survival / 生存
- Endurance / 耐力

## Social

- Persuasion / 說服
- Deception / 欺瞞
- Intimidation / 威嚇
- Negotiation / 談判
- Leadership / 領導

## Practical

- First Aid / 急救
- Craft & Repair / 製作與修理
- Operation / 操控
- Navigation / 導航
- Research / 資料研究

## Combat

- Melee / 近戰
- Ranged / 遠程
- Dodge / 閃避
- Guard / 防禦
- Grapple / 擒抱
- Throw / 投擲

This is currently **27 Root Skills**.

The exact Initial Base Value of each Root Skill still needs to be confirmed before implementation.

The list itself is still a working set and may be expanded/reduced before seeding production D1.

---

# 15. Specialist / Learned Skills

Do not add fixed starting specialist Skills for individual languages, weapon families, sciences, magic schools, hacking, archaeology, accounting, law, photography, specific vehicles, starship systems, alchemy, Cthulhu Mythos or other world-specific catalogues.

These appear later as learned/specialization nodes.

Examples:

```text
Melee
└── Swordsmanship
    └── Iaido

Ranged
└── Firearms
    └── Plasma Rifle Handling

Craft & Repair
└── Engineering
    └── Cybernetics

Operation
├── Driving
├── Piloting
└── Riding

Research
└── Physics
    └── Quantum Physics
```

Character individuality develops primarily after creation.

---

# 16. Post-Creation Skill Point System

## 16.1 Skill Points are earned from Level-ups

EXP does not directly increase a Skill.

Instead:

```text
GM Award EXP
      ↓
EXP equation recalculates Level
      ↓
Level Up
      ↓
Gain Skill Points
      ↓
Spend Skill Points
```

The exact number of Skill Points granted per Level is not yet confirmed.

## 16.2 Skill Point uses

Progression Skill Points are used for both:

1. improving an existing Skill; and
2. unlocking/learning a new Skill Tree Node.

Therefore Skill value growth and Skill Tree expansion share the same post-creation progression currency.

The exact costs for:

- +1 Skill value;
- different Skill-value bands;
- Root versus Specialist Nodes;
- Mastery Nodes;
- Unique/Event Nodes;

are not yet confirmed and must remain rules/config driven.

Do not assume one Skill Point always equals +1% until that rule is explicitly confirmed.

## 16.3 Skill Point accounting

D1 must be able to distinguish:

```text
skill_points_earned
skill_points_spent
skill_points_available
```

Every spend must produce a progression/audit record.

The Worker must reject a spend that would make available Skill Points negative or violate node prerequisites/caps.

---

# 17. Dynamic Skill / Talent Tree

## 17.1 Core concept

The Skill interface uses a large zoomable node graph inspired by ARPG talent-tree interaction patterns such as Path of Exile, without copying proprietary art, exact layouts or assets.

The graph is Character-specific and dynamic.

A Level-1 Character starts with universal Root Skills. New branches appear as Skills are learned.

## 17.2 Node types

```text
BASE
LEARNED
SPECIALIZATION
MASTERY
UNIQUE / EVENT
CLASS / GM-GRANTED
```

## 17.3 Node states

```text
LOCKED
AVAILABLE
LEARNED
MASTERED
SPECIAL / GM-GRANTED
```

## 17.4 Edge types

```text
PREREQUISITE
SPECIALIZATION
UPGRADE
RELATED
CLASS LINK
STORY LINK
```

## 17.5 Skill Points and prerequisites

Unlike the earlier draft, the post-creation Skill Tree **does use earned Skill Points as progression currency**.

A node may require both sufficient Skill Points and non-point prerequisites such as:

- Character Level
- Attribute requirement
- parent Skill value/rank
- another Node
- training
- teacher
- quest
- item
- Class / Occupation
- GM/story permission

A node is only purchasable when every required condition is satisfied.

Some story/unique nodes may be GM-granted and cost zero Skill Points if their definition says so.

## 17.6 UI behavior

The Skill Tree should support:

- pan / drag
- zoom
- reset / centre
- search
- category filter
- click/tap detail panel
- prerequisite path highlighting
- learned path highlighting
- locked requirement display
- Skill Point cost display
- Skill Points Available display
- confirmation before spending points
- mobile interaction

Initial renderer: **SVG**.

Logical nodes/edges and progression values live in D1. Screen coordinates are presentation metadata only.

---

# 18. EXP Award System

## 18.1 GM awards EXP

GM is the normal authority that awards EXP.

Player cannot directly add, subtract or edit EXP.

GM UI should support an action such as:

```text
Award EXP
Character: <character>
Amount: <positive integer>
Reason: session / quest / event / correction
```

## 18.2 EXP transaction history

Do not only overwrite a single EXP number without history.

D1 should record transactions:

```text
character_exp_transactions
├── id
├── character_id
├── amount
├── reason
├── source_type
├── source_reference
├── awarded_by_gm_id
├── created_at
└── metadata
```

Current Total EXP may be stored/cached on the Character for fast reads, but transactions remain auditable.

## 18.3 Atomic Level-up processing

When GM awards EXP, one server-side transaction should:

1. validate the GM action;
2. write the EXP award;
3. update Total EXP;
4. calculate Level from the canonical EXP equation;
5. determine every Level crossed;
6. grant the corresponding Skill Points;
7. update Level and Skill Point balances;
8. write Level-up/progression history;
9. return the resulting Character state.

This prevents EXP, Level and Skill Points from drifting out of sync.

---

# 19. Post-Creation Change Request and GM Approval System

After Character creation, a Player does not directly overwrite ordinary persistent Character data.

```text
Player proposes change
        ↓
Change Request stored in D1
        ↓
GM reviews
   ┌────┴────┐
Approve     Reject
   ↓           ↓
Apply to      Character remains
Character     unchanged
   ↓
Audit history
```

Player-initiated persistent changes include Character Name, Age/Gender/background, Portrait reference, HP/MP current values, Campaign Resources, Inventory changes, Character notes and other exposed Character fields.

EXP, Level, Skill Point balance, Class, rolled Attributes and LUCK are protected system/GM fields, not ordinary Player change requests.

Skill Point spending should use its own progression endpoint and validation logic rather than pretending to be a generic Character-edit request.

Request states:

```text
PENDING
APPROVED
REJECTED
CANCELLED
```

---

# 20. Language System

There is no dedicated global language subsystem.

A language that matters mechanically may appear as an ordinary learned Skill if a Campaign needs it.

There are no fixed Asian/European/African/Ancient language tables.

---

# 21. Combat / Attacks

Attacks remain separate from Inventory.

```text
Attack
├── id
├── character_id
├── name
├── linked_skill_id
├── hit_value / calculation
├── damage_formula
├── attacks_per_round
├── notes
└── source_item_id
```

Items may link to Attack definitions without becoming the same database entity.

---

# 22. Inventory

Inventory is structured D1 data.

```text
Inventory Item
├── id
├── character_id
├── name
├── quantity
├── description / notes
├── category
└── metadata
```

Player-proposed persistent Inventory changes use the GM Change Request workflow unless a later Campaign rule defines a different transactional inventory mechanic.

---

# 23. Character Creation Flow

```text
Step 1 — Identity
  Character Name
  optional Age / Gender / Portrait / Background

  NOT SHOWN:
  Owner ID
  Level
  EXP
  Class / Occupation

Step 2 — Server Generation
  Level = 1
  EXP = 0
  Progression Skill Points = 0
  Class / Occupation = Unassigned
  Roll STR / DEX / CON / APP / POW / INT / SIZ / EDU
  Apply 84–100 total-stat balance gate
  Roll LUCK = 3D6 × 5
  Calculate HP
  Calculate MP
  Calculate Damage Bonus
  Calculate Creation Skill Point Pool

Step 3 — Starting Skill Allocation
  Load Root Skills with Initial Base Values
  Show CSP remaining
  Player freely allocates CSP
  Enforce Starting Skill <= 70
  Require all CSP to be allocated
  Worker validates allocation

Step 4 — Review
  Show complete Level-1 Character
  Show EXP 0
  Show Attributes / LUCK / HP / MP / Damage Bonus
  Show Root Skills: Base + Allocation = Starting Value
  Player confirms creation

Step 5 — Persist
  Save Character and all related records directly to D1
```

No authoritative creation data is persisted in localStorage.

---

# 24. Character Sheet Layout

Recommended Player page:

```text
OVERVIEW
────────────────────────
Name
Level
EXP / next-level progress
Class / Occupation
Age / Gender
Background
Portrait
Pending Change indicator

CORE ATTRIBUTES
────────────────────────
STR   DEX   CON   APP
POW   INT   SIZ   EDU

STATUS
────────────────────────
HP        Current / Max
MP        Current / Max
LUCK
Damage Bonus
Campaign Resources

PROGRESSION
────────────────────────
Level
Total EXP
EXP to next Level
Skill Points Available
Skill Points Earned / Spent

SKILL TREE
────────────────────────
Dynamic D1-backed graph
Root Skills + learned branches

COMBAT
────────────────────────
Attacks / Weapons

INVENTORY
────────────────────────
Approved Items
Pending-change indicator

NOTES
────────────────────────
Approved Character notes
```

Primary tabs:

```text
Overview
Skill Tree
Combat
Inventory
Notes
Requests
```

---

# 25. Player Permissions

During creation, Player may provide allowed identity/background fields, receive server-generated Attributes/LUCK, freely allocate the valid CSP, review the generated Character and confirm creation.

After creation, Player may view owned Characters, view EXP/Level/Skill Points, use the Skill Tree, spend available Skill Points on valid Skill progression, submit ordinary Character change requests, view request history and cancel their own pending requests.

Player may not directly change owner, EXP, Level, Class/Occupation, rolled Attributes, LUCK, Skill Point balance, Campaign rules, another User's Character, or bypass server-side Skill Tree requirements.

---

# 26. GM Responsibilities

GM responsibilities include:

- view Users and Characters;
- award EXP;
- correct/reverse EXP through an audited administrative action when necessary;
- view EXP transaction history;
- review Character change requests;
- assign/change Class / Occupation;
- configure the canonical EXP equation once its exact expression is restored;
- configure Skill Points granted per Level once decided;
- configure Attribute total range;
- configure CSP formula and min/max clamp;
- configure Level-1 Skill cap;
- create/manage Skill definitions and Initial Base Values;
- configure Skill Point costs for Skill increases and Node unlocks;
- manage Skill relationships/prerequisites;
- grant/remove special story/Class nodes when appropriate;
- manage Campaign settings;
- archive/delete Characters.

Normal Level progression is **not manually chosen by GM**; GM awards EXP and the server computes Level using the EXP equation.

---

# 27. Database Principles

Core logical entities:

```text
users
sessions
characters
character_attributes
character_resources
class_definitions / occupations
character_class_history
skill_definitions
character_skills
skill_edges / prerequisites
character_skill_point_transactions
character_exp_transactions
character_level_history
character_inventory
character_attacks
character_change_requests
progression_history / audit_history
settings
```

## 27.1 Character record

```text
Character
├── id
├── owner_user_id
├── name
├── level                       default 1
├── total_exp                   default 0
├── skill_points_earned         default 0
├── skill_points_spent          default 0
├── skill_points_available      default 0
├── class_id                    nullable / GM-controlled
├── status
├── portrait reference
├── approved background fields
├── revision
├── created_at
└── updated_at
```

The Worker must keep:

```text
skill_points_available
= skill_points_earned - skill_points_spent
```

consistent.

## 27.2 Skill definitions

```text
skill_definitions
├── id
├── name
├── category
├── node_type
├── initial_base_value
├── point_cost_rule
├── description
├── active
└── metadata
```

## 27.3 Character Skills

```text
character_skills
├── id
├── character_id
├── skill_definition_id
├── base_value
├── creation_allocation
├── progression_investment
├── current_value
├── state
├── source
├── learned_at
└── metadata
```

## 27.4 Progression transactions

EXP awards and Skill Point spends must be auditable transactions rather than unexplained final numbers.

---

# 28. API Direction

Recommended logical endpoints:

```text
POST /api/player/character-drafts
GET  /api/player/character-drafts/:id
POST /api/player/character-drafts/:id/allocate-skills
POST /api/player/character-drafts/:id/finalize

GET  /api/player/characters/:id
GET  /api/player/characters/:id/progression
POST /api/player/characters/:id/skill-spends

POST /api/player/characters/:id/change-requests
GET  /api/player/characters/:id/change-requests
POST /api/player/change-requests/:id/cancel

POST /api/gm/characters/:id/exp-awards
GET  /api/gm/characters/:id/exp-history

GET  /api/gm/change-requests?status=pending
POST /api/gm/change-requests/:id/approve
POST /api/gm/change-requests/:id/reject
```

Skill-spend requests must be validated against authoritative D1 Skill Point balance and prerequisites.

EXP-award endpoints must atomically apply EXP, Level and Level-up Skill Point results.

---

# 29. Security and Integrity Rules

- User + Key validation occurs server-side.
- Key is not stored in plaintext.
- Session uses Secure + HttpOnly cookie.
- D1 is the only authoritative persistent store.
- Do not persist game data in localStorage.
- Character ownership is server-enforced.
- Character creation ignores client-supplied owner, Level, EXP, Class and Attribute values.
- New Character Level is always 1.
- New Character EXP is always 0.
- New Character progression Skill Point balance is always 0.
- New Character Class/Occupation is always Unassigned.
- Attribute and LUCK rolls happen server-side.
- Attribute balance validation happens server-side.
- CSP is recalculated server-side.
- Starting Skill allocation and 70 cap are validated server-side.
- EXP can only change through authorized GM/admin progression actions.
- Level is recalculated from EXP using the canonical equation.
- Level-up Skill Points are granted server-side.
- Skill Point spending is server-validated and auditable.
- Skill Point balance cannot go negative.
- Skill prerequisites and costs are server-validated.
- Player ordinary persistent edits use Change Requests.
- GM approval/rejection is server-authorized and audited.

---

# 30. Development Order

## Phase A — Character Builder Core

1. Remove Level input.
2. Remove Class/Occupation input.
3. Server creates Level 1 / EXP 0 / progression Skill Points 0.
4. Server creates Unassigned Class.
5. Implement eight-Attribute dice generation.
6. Implement `84–100` balance gate.
7. Roll `LUCK = 3D6 × 5`.
8. Calculate HP / MP / Damage Bonus.
9. Calculate CSP.
10. Persist creation state in D1.

## Phase B — Starting Skill Allocation

1. Finalize Root Skill list.
2. Finalize Initial Base Values.
3. Seed definitions in D1.
4. Build CSP allocation UI.
5. Show CSP Remaining live.
6. Enforce Level-1 Skill cap 70.
7. Revalidate server-side.
8. Save Base and Creation Allocation separately.

## Phase C — EXP / Level Progression

1. Restore the user's exact EXP-to-Level equation.
2. Add `total_exp` to authoritative Character progression data.
3. Add EXP transaction history.
4. Build GM EXP Award UI/API.
5. Recalculate Level automatically after every EXP change.
6. Detect multiple Levels crossed in one award.
7. Finalize Skill Points granted per Level.
8. Grant Level-up Skill Points atomically.
9. Add Level-up history.

## Phase D — Skill Point Progression

1. Add earned/spent/available Skill Point accounting.
2. Define cost rules for increasing existing Skill values.
3. Define cost rules for learning new Nodes.
4. Build Player Skill Point spending UI.
5. Validate prerequisites and balances server-side.
6. Add Skill Point transaction history.

## Phase E — Change Request System

1. Add `character_change_requests` schema.
2. Add Player request UI/history.
3. Add GM Pending Requests inbox.
4. Add Approve / Reject.
5. Add revision/conflict detection.
6. Add audit history.

## Phase F — Character Sheet

1. Display Level / EXP / EXP-to-next-Level.
2. Display Skill Points Available.
3. Display GM-managed Class.
4. Display Attributes / LUCK / HP / MP / DB.
5. Display Skills, Inventory and Combat data.
6. Add pending-change indicators and Requests tab.

## Phase G — Skill Tree UI

1. Build SVG graph renderer.
2. Read graph from D1.
3. Add pan/zoom.
4. Add node states/details.
5. Add Skill Point costs/balance.
6. Add search/filter.
7. Add path highlighting.
8. Add mobile interaction.

## Phase H — Class / Occupation

1. Build GM assignment UI.
2. Define optional Classes/Occupations.
3. Link Class to Skill branches/requirements.
4. Record Class history.

## Phase I — Full GM D1 Workspace

1. GM authentication/authorization.
2. User/Character browser.
3. EXP award centre.
4. Character administration.
5. Change Request review centre.
6. Skill graph/content management.
7. Campaign settings.

---

# 31. Canonical Decisions

The following decisions must not be silently reversed during implementation:

1. Player and GM are separate workspaces.
2. Player identity uses User + 4-digit Key.
3. Cloudflare D1 is the only authoritative persistent data store.
4. Do not use localStorage for persistent game/application data.
5. Players create their own Characters.
6. Character owner comes from authenticated Session.
7. Every new Character starts at Level 1.
8. Every new Character starts at EXP 0.
9. Every new Character starts with 0 post-creation progression Skill Points.
10. Player cannot choose starting Level or EXP.
11. Player does not choose Class / Occupation at creation.
12. Class / Occupation starts Unassigned and is GM-managed later.
13. Core Attributes are STR, DEX, CON, APP, POW, INT, SIZ and EDU.
14. Starting Attributes are randomized and directly assigned server-side.
15. Starting Primary Total range is 84–100.
16. Valid starting rolls cannot be redistributed or farmed by rerolling.
17. LUCK is core, independent of POW, and initially uses `3D6 × 5`.
18. HP uses `ceil((CON + SIZ) / 2)`.
19. MP is core in the initial ruleset and uses POW as Max MP.
20. Damage Bonus is derived from STR + SIZ.
21. Cthulhu Mythos is removed.
22. Fixed language systems are removed.
23. Level-1 Characters use a genre-neutral Root Skill set; the current working list contains 27 Skills.
24. Starting Skills use Initial Base Value + Player Creation Allocation.
25. Player receives one combined Creation Skill Point Pool during creation.
26. Current CSP formula combines INT, EDU, POW, DEX, APP and LUCK and is clamped to 90–120.
27. Level-1 final Skill value cannot exceed 70.
28. Creation Skill allocation is freely chosen by the Player within pool/cap rules.
29. Character EXP is one cumulative Character-wide pool.
30. GM is the normal source of EXP awards.
31. Level is automatically determined from Total EXP using the user's existing EXP equation.
32. The exact original EXP equation must be restored; no substitute equation may be invented.
33. EXP does not directly improve Skills.
34. Reaching a new Level grants Skill Points.
35. Exact Skill Points granted per Level is still undecided/configurable.
36. Post-creation Skill Points are used both to improve existing Skills and to learn/unlock new Skill Tree Nodes.
37. Creation Skill Points and post-creation Level-up Skill Points are separate systems.
38. Skill Point costs for Skill increases and Node unlocks are rules-driven and still require confirmation.
39. Skill progression is visualized as a Character-specific dynamic zoomable node graph.
40. The Skill Tree uses earned Skill Points plus prerequisites for normal post-creation progression.
41. Skill relationships/unlocks are data-driven and server-validated.
42. Player ordinary persistent Character changes are submitted as D1 Change Requests.
43. Player requests do not modify authoritative Character data until GM approval.
44. EXP, Level and Skill Point balances are protected progression fields and do not use the ordinary Player Change Request workflow.
45. GM approval/rejection and progression changes are audited in D1.
46. Character page uses Overview / Skill Tree / Combat / Inventory / Notes / Requests as the primary interaction model.
