# Inventory & Money Data Model — Alpha

> Status: Alpha structural decision.  
> Scope: database representation only; detailed Inventory page UI is intentionally deferred.

---

# 1. Money Model

The normal economy uses three visible coin denominations:

- Brown Coin
- Silver Coin
- Gold Coin

Alpha conversion:

```text
100 Brown = 1 Silver
100 Silver = 1 Gold
1 Gold = 10,000 Brown
```

These ratios are rules/config values and may be tuned later without changing stored Character balances or item prices.

## 1.1 Store one authoritative base amount

D1 does **not** store three independent editable balances for Brown/Silver/Gold.

The authoritative money value is stored in the smallest denomination:

```text
money_base_amount = total value in Brown Coins
```

Example:

```text
12,345 Brown base units
= 1 Gold + 23 Silver + 45 Brown
```

The UI converts the base amount into Gold/Silver/Brown for display.

This prevents denomination drift such as simultaneously storing inconsistent equivalents.

## 1.2 Character wallet

Conceptual table:

```text
character_wallets
├── character_id             PRIMARY KEY
├── base_amount              INTEGER NOT NULL DEFAULT 0
├── revision
└── updated_at
```

`base_amount` must never become negative unless a future Campaign rule explicitly allows debt.

## 1.3 Item prices

Normal item prices are also stored in Brown base units:

```text
item_definitions.base_price
```

Examples:

```text
Torch          20 Brown
Potion         175 Brown   -> 1 Silver 75 Brown
Steel Sword  2,450 Brown   -> 24 Silver 50 Brown
Rare Armour 12,500 Brown   -> 1 Gold 25 Silver
```

`base_price` may be NULL for priceless/non-tradeable/story items.

## 1.4 Money transactions

Do not silently overwrite wallet totals without history.

Conceptual table:

```text
character_money_transactions
├── id
├── character_id
├── delta_base_amount
├── balance_after
├── transaction_type
├── reason
├── source_type
├── source_reference
├── created_by_user_id / gm_id
├── created_at
└── metadata
```

Examples of `transaction_type`:

```text
GM_AWARD
PURCHASE
SALE
LOOT
REWARD
TRANSFER
CORRECTION
REQUEST_APPROVAL
```

For Alpha, Player-authored manual money changes follow the normal Change Request -> GM approval workflow. Future Shop/Trade systems may create validated transactions directly.

---

# 2. Item Model

The three primary Item categories are fixed for Alpha:

```text
WEAPON
ARMOUR
ITEM
```

`ITEM` is the general category for consumables, tools, materials, keys, quest objects and other non-weapon/non-armour possessions.

Do not create a separate database table for every possible minor subtype.

---

# 3. Two-Layer Item Storage

Items are represented using two layers:

```text
Item Definition
      ↓
Character Inventory Entry
```

This avoids duplicating the same standard sword/potion definition on every Character while still allowing a Character to own individual modified copies.

## 3.1 Item definitions

GM/system catalogue table:

```text
item_definitions
├── id
├── name
├── item_type              WEAPON | ARMOUR | ITEM
├── description
├── base_price             Brown base units / nullable
├── stackable              boolean
├── max_stack              nullable
├── tradeable              boolean
├── active
├── image_ref              nullable
├── created_at
├── updated_at
└── metadata
```

`metadata` is only for uncommon extension data. Important combat fields should not be hidden exclusively inside generic metadata.

---

# 4. Weapon Data

Weapon-specific data is attached to a WEAPON definition.

Conceptual table:

```text
weapon_definitions
├── item_definition_id     PRIMARY KEY / FK
├── weapon_group           nullable
├── linked_skill_id        nullable
├── damage_formula
├── damage_type            nullable
├── range_value            nullable
├── attacks_per_round      nullable
├── hit_modifier           default 0
├── resource_cost          nullable
└── properties
```

Examples:

```text
Steel Sword
Type: WEAPON
Damage: 1D8
Damage Type: Slash
Linked Skill: Swordsmanship
Range: Melee
```

```text
Plasma Rifle
Type: WEAPON
Damage: 3D6
Damage Type: Energy
Linked Skill: Plasma Rifle Handling
Range: 120m
```

Weapon definitions describe the item. Actual usable `Attack` records may reference the owned weapon but remain a separate combat entity.

---

# 5. Armour Data

Armour-specific data is attached to an ARMOUR definition.

Conceptual table:

```text
armour_definitions
├── item_definition_id     PRIMARY KEY / FK
├── armour_group           nullable
├── defence_value          nullable
├── damage_reduction       nullable
├── equip_slot             nullable
├── movement_modifier      nullable
└── properties
```

Exact armour combat mathematics remain Alpha-tunable. The database therefore records relevant values without forcing a final defence formula yet.

Examples:

```text
Leather Armour
Type: ARMOUR
Defence: 1
Slot: Body
```

```text
Powered Exosuit
Type: ARMOUR
Defence: 5
Movement Modifier: -1
```

---

# 6. General ITEM Data

`ITEM` covers ordinary possessions such as:

- potions / medicine
- ammunition
- food
- tools
- crafting materials
- keys
- books
- quest objects
- electronic devices
- scrolls
- other consumables or utility objects

General items do not require their own subtype table during Alpha.

Optional behaviour/effects may later be represented by reusable effect records rather than forcing fixed `Bonus1/Bonus2/Bonus3` columns.

---

# 7. Character-Owned Inventory Entries

The Character does not own an `item_definition` directly. It owns an Inventory entry pointing to that definition.

Conceptual table:

```text
character_inventory
├── id
├── character_id
├── item_definition_id
├── quantity
├── is_equipped
├── equip_slot             nullable
├── custom_name            nullable
├── custom_description     nullable
├── condition_value        nullable
├── acquired_at
├── source
├── revision
└── instance_metadata
```

Rules:

- WEAPON and ARMOUR default to `quantity = 1` and non-stackable.
- ITEM may be stackable depending on `item_definitions.stackable`.
- Two otherwise identical items with different unique modifications/condition should use separate Inventory entries.
- `custom_name`, `custom_description` and instance metadata allow unique loot without duplicating the global definition.

Example:

```text
Definition:
Steel Sword
Damage 1D8
Price 2450

Owned instance:
"Captain Rook's Steel Sword"
Character: char_123
Quantity: 1
Condition: 82
Equipped: Yes
```

---

# 8. Relationship with Combat and Skills

Inventory, Attack and Skill remain separate entities but can link to each other.

```text
Item Definition
      ↓
Character Inventory Entry
      ↓ source_item_id
Attack
      ↓ linked_skill_id
Skill / Skill Tree Node
```

Example:

```text
Steel Sword (Inventory)
        ↓
Sword Slash (Attack)
        ↓
Swordsmanship (Skill)
```

This prevents an item from becoming the same database object as an attack or a Skill.

---

# 9. Alpha Rules Locked by This Document

1. Money is displayed as Brown / Silver / Gold coins.
2. Brown Coin is the authoritative smallest currency unit.
3. Alpha conversion is 100 Brown = 1 Silver and 100 Silver = 1 Gold.
4. Character wallet and item prices are stored as integer Brown base units.
5. Money changes are auditable transactions.
6. Main Item categories are WEAPON / ARMOUR / ITEM.
7. Standard item data lives in `item_definitions`.
8. Character ownership of items lives in `character_inventory`.
9. Weapon and Armour use structured subtype data.
10. General ITEM remains flexible and may stack.
11. Inventory, Attack and Skill are separate but linkable.
12. All authoritative values live in Cloudflare D1; no localStorage persistence.
