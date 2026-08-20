# Inventory, Currency & Store Data Model — Alpha

> Status: **Alpha structural specification**.  
> Scope: authoritative D1 representation of Items, Currency, Store pricing and GM-controlled exchange rates. Detailed Inventory page layout may be refined later.

---

# 1. Core Economy Model

The normal economy begins with three visible coin Items:

```text
Bronze / Brown Coin
Silver Coin
Gold Coin
```

Coins are **real Character possessions**. They are not merely display denominations of one hidden base-money number.

Therefore a Character may independently own:

```text
Bronze Coin × 312
Silver Coin × 48
Gold Coin   × 7
```

All values are stored as integer Item quantities in D1.

There is no automatic normalization such as:

```text
100 Bronze = 1 Silver
```

inside the Character inventory.

Instead, currency conversion is an explicit game action using the **current GM-configured exchange-rate table**.

---

# 2. Main Item Types

The three primary Item categories remain:

```text
WEAPON
ARMOUR
ITEM
```

Currency is represented inside the general `ITEM` family:

```text
ITEM
└── subtype = CURRENCY
```

Useful `ITEM` subtypes may include:

```text
CURRENCY
CONSUMABLE
AMMUNITION
MATERIAL
TOOL
KEY
QUEST
BOOK
DEVICE
OTHER
```

Subtype is organizational data and does not require a separate D1 table for every subtype.

---

# 3. Coin Definitions

Alpha begins with three reusable Item Definitions:

```text
coin_bronze
coin_silver
coin_gold
```

Conceptually:

```text
item_definitions
├── id
├── name
├── item_type              WEAPON | ARMOUR | ITEM
├── item_subtype           nullable / e.g. CURRENCY
├── description
├── stackable
├── max_stack              nullable
├── tradeable
├── active
├── image_ref              nullable
├── created_at
├── updated_at
└── metadata
```

A Currency Item Definition does **not** contain a permanent universal conversion value.

Do not put fields such as:

```text
value_in_silver
value_in_gold
fixed_exchange_rate
```

on the Coin Item itself.

The exchange rate belongs to the active Campaign exchange-rate configuration.

---

# 4. Character Currency Storage

Coins use the same authoritative Character Inventory structure as other possessions:

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

Currency rules:

- quantity is always a non-negative integer;
- Currency Items are stackable;
- Bronze/Silver/Gold remain separate stacks;
- no background process converts one stack into another;
- Player UI may display Currency separately from ordinary Inventory Items even though D1 uses the same inventory ownership model.

---

# 5. GM-Controlled Current Exchange Rates

Currency conversion is controlled from the **GM General Control Panel**.

The GM sets the current exchange-rate table for the Campaign/session/day.

Example active table:

```text
Bronze -> Silver     103 Bronze -> 1 Silver
Silver -> Bronze       1 Silver -> 98 Bronze
Silver -> Gold       100 Silver -> 95 Gold
Gold -> Silver          1 Gold   -> 101 Silver
```

These are **directional** rules.

The system must NOT assume that the reverse rate is the mathematical reciprocal of the forward rate.

Therefore:

```text
Bronze -> Silver
```

and:

```text
Silver -> Bronze
```

are separate rate records and may contain a spread.

---

# 6. Exchange Rate Data Model

Use a versioned Exchange Rate Set rather than overwriting rates with no history.

Conceptual tables:

```text
currency_exchange_rate_sets
├── id
├── campaign_id
├── label                  e.g. "20 Aug 2026" / "Session 12"
├── effective_from
├── effective_until        nullable
├── status                 ACTIVE | ARCHIVED | DRAFT
├── created_by_gm_id
├── created_at
└── updated_at
```

```text
currency_exchange_rates
├── id
├── rate_set_id
├── from_item_definition_id
├── to_item_definition_id
├── from_quantity
├── to_quantity
├── enabled
├── sort_order
└── metadata
```

Example:

```text
from_item = coin_bronze
from_quantity = 103
to_item = coin_silver
to_quantity = 1
```

means exactly:

```text
103 Bronze -> 1 Silver
```

The quoted bundle is preserved exactly as entered by GM. The server must not silently simplify `100 -> 95` into `20 -> 19` or otherwise change GM intent.

Only one normal Exchange Rate Set should be ACTIVE for a Campaign at a time during Alpha.

---

# 7. GM General Control Panel — Exchange Rate Control

The GM General Control Panel contains a `Today's Exchange Rate` / `Current Exchange Rate` section.

Recommended control layout:

```text
CURRENT EXCHANGE RATES
──────────────────────────────────────────
Bronze -> Silver   [103] Bronze -> [1] Silver
Silver -> Bronze   [1] Silver    -> [98] Bronze
Silver -> Gold     [100] Silver  -> [95] Gold
Gold -> Silver     [1] Gold      -> [101] Silver

[Save as Current Rates]
```

GM functions:

- edit each directional rate;
- enable/disable a direction;
- add a future Currency pair if new currencies are introduced;
- save a new active Rate Set;
- automatically archive the previous active Rate Set;
- see when the current rates were last updated;
- view previous Rate Sets/history;
- optionally prepare a DRAFT before activating it.

Saving a new active Rate Set is an audited GM action.

The Player never edits exchange-rate values.

---

# 8. Player-Side Exchange Rate Display

The Player can see the current active exchange rates near their Currency display.

Example:

```text
Your Coins
Bronze  2,415
Silver     37
Gold        4

Today's Exchange Rate
──────────────────────────
103 Bronze  -> 1 Silver     [Exchange]
1 Silver    -> 98 Bronze    [Exchange]
100 Silver  -> 95 Gold      [Exchange]
1 Gold      -> 101 Silver   [Exchange]

Updated: 20 Aug / Session 12
```

The Player interface must display the **actual active D1 rate**, not a hard-coded frontend value.

If a direction is disabled by GM, its Exchange button is hidden or disabled.

---

# 9. Player Currency Exchange Dialog

Clicking an `Exchange` button opens a modal/dialog.

Example:

```text
Exchange Bronze -> Silver

Current Rate
103 Bronze -> 1 Silver

You Have
2,415 Bronze

Bronze to Convert
[ 515 ]

Exchange Units
5

You Pay
515 Bronze

You Receive
5 Silver

After Exchange
Bronze: 1,900
Silver:    42

[Cancel] [Confirm Exchange]
```

## 9.1 Integer coin rule

Coins are indivisible integer Items.

For Alpha, Player conversion must use whole GM-defined exchange bundles.

For a rate:

```text
103 Bronze -> 1 Silver
```

valid source quantities are:

```text
103
206
309
412
515
...
```

The amount input should use the exchange bundle as its step size and may provide convenience controls such as:

```text
[-1 Bundle] [+1 Bundle] [+5 Bundles] [Max]
```

The UI must not create fractional Coins and must not silently round a Player's requested amount.

If an invalid amount is typed, show the required multiple and do not allow confirmation.

For:

```text
100 Silver -> 95 Gold
```

valid conversions are whole quoted bundles such as 100 -> 95, 200 -> 190, etc.

---

# 10. Exchange Validation and Atomic Transaction

When the Player confirms an exchange, the client sends the selected rate ID and requested bundle/source amount.

The Worker must independently:

1. authenticate the Player Session;
2. verify Character ownership;
3. load the currently ACTIVE Exchange Rate Set from D1;
4. verify the requested rate belongs to that active set and is enabled;
5. re-read `from_quantity` and `to_quantity` from D1;
6. reject stale frontend rates if GM changed the rate after the dialog was opened;
7. validate the requested amount is a whole number of exchange bundles;
8. verify the Character owns enough source Coins;
9. subtract source Currency quantity;
10. add destination Currency quantity;
11. write an immutable exchange transaction record;
12. commit all changes atomically.

If any step fails, neither Currency stack changes.

A stale-rate response should tell the Player that the exchange rate changed and reload the current rate rather than executing at an old quote.

---

# 11. Currency Exchange Transaction History

Every completed exchange is auditable.

Conceptual table:

```text
currency_exchange_transactions
├── id
├── campaign_id
├── character_id
├── rate_set_id
├── rate_id
├── from_item_definition_id
├── from_quantity_total
├── to_item_definition_id
├── to_quantity_total
├── quoted_from_quantity
├── quoted_to_quantity
├── exchange_units
├── created_at
└── metadata
```

Example immutable history entry:

```text
Character: James
Rate: 103 Bronze -> 1 Silver
Units: 5
Paid: 515 Bronze
Received: 5 Silver
```

The transaction preserves the rate actually used even after GM changes tomorrow's/current rates.

---

# 12. Store Item Pricing Is Separate from Currency Exchange

GM-controlled Currency Exchange is a **Campaign-level/general control function**.

Store Item prices remain Store-specific.

An Item Definition does not require one enforced global price.

Conceptually:

```text
Store A
Healing Potion -> 2 Silver + 15 Bronze

Store B
Healing Potion -> 3 Silver
```

A Store price may therefore differ by place or time even while every Player sees the same current Campaign exchange-rate table.

The Store system and the Currency Exchange control should not be conflated.

---

# 13. No Automatic Exchange During Purchase

During Alpha, buying an Item does **not** automatically exchange the Player's other Coin types to cover the cost.

Example:

```text
Potion price:
2 Silver + 15 Bronze
```

If the Character has:

```text
0 Silver
500 Bronze
```

checkout does not silently convert Bronze to Silver.

The Player must explicitly use the Exchange action first, then return to the Store purchase.

This keeps every currency conversion visible, intentional and auditable.

---

# 14. Item Definitions and Character-Owned Instances

Standard reusable Item data and Character ownership remain separate:

```text
Item Definition
      ↓
Character Inventory Entry
```

Standard definitions live in `item_definitions`; Character ownership lives in `character_inventory`.

Rules:

- Currency is stackable and represented by quantity.
- Ordinary stackable ITEMs may share one Inventory entry.
- WEAPON and ARMOUR default to quantity 1 and non-stackable.
- Modified/unique Items use separate Inventory entries where needed.
- unique names, condition/durability and Character-specific modifications belong to the owned instance rather than changing the global Item Definition.

---

# 15. Weapon Data

Weapon-specific data is attached to a WEAPON definition.

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

Weapon definitions describe the Item. Actual usable Attack records may reference an owned Weapon but remain separate combat entities.

---

# 16. Armour Data

Armour-specific data is attached to an ARMOUR definition.

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

Exact armour combat mathematics remain Alpha-tunable.

---

# 17. General ITEM Data

General `ITEM` covers possessions such as:

- Currency;
- potions / medicine;
- ammunition;
- food;
- tools;
- crafting materials;
- keys;
- books;
- quest objects;
- devices;
- scrolls;
- other consumables or utility objects.

General Items may later use reusable effect records rather than fixed `Bonus1/Bonus2/Bonus3` columns.

---

# 18. Relationship with Combat and Skills

Inventory, Attack and Skill remain separate but linkable entities:

```text
Item Definition
      ↓
Character Inventory Entry
      ↓ source_item_id
Attack
      ↓ linked_skill_id
Skill / Skill Tree Node
```

Currency normally has no Attack or Skill link.

---

# 19. Alpha Rules Locked by This Document

1. Normal visible currencies begin with Bronze/Brown, Silver and Gold Coins.
2. Coins are real stackable Items, not display denominations of one hidden base amount.
3. Currency Items use `ITEM` with subtype `CURRENCY`.
4. Bronze, Silver and Gold holdings are stored independently in D1.
5. There is no automatic inventory normalization between Coin types.
6. GM controls the current Campaign exchange-rate table from the General Control Panel.
7. Player can view current rates but cannot edit them.
8. Exchange directions are independent; reverse rates are not automatically reciprocal.
9. Player currency exchange is explicit through an Exchange button and confirmation dialog.
10. Player enters how many source Coins to convert and the UI previews the resulting destination Coins.
11. Alpha conversions use whole GM-defined bundles; fractional Coins and silent rounding are prohibited.
12. Worker revalidates the currently active rate before every exchange.
13. A rate changed by GM invalidates an older Player quote before transaction execution.
14. Currency exchanges are atomic and auditable.
15. Store Item prices remain separate from the Campaign exchange-rate table.
16. Purchases do not automatically convert other Player currencies during Alpha.
17. Main Item categories remain WEAPON / ARMOUR / ITEM.
18. Standard Item data lives in `item_definitions`.
19. Character ownership lives in `character_inventory`.
20. Weapon and Armour use structured subtype data.
21. Inventory, Attack and Skill are separate but linkable.
22. All authoritative data lives in Cloudflare D1; no localStorage persistence.
