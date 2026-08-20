# Inventory, Currency & Store Data Model — Alpha

> Status: Alpha structural decision.  
> Scope: database representation only; detailed Inventory/Store page UI is intentionally deferred.

---

# 1. Core Economy Principle

There is **no automatic currency conversion** and no universal fixed exchange rate.

Bronze/Brown, Silver and Gold coins are real in-world possessions. They are stored and traded as Items rather than being converted into one authoritative base-money number.

A coin may itself be bought or sold in a Store.

Exchange value belongs to a specific Store Offer at a specific time.

Examples:

```text
Store A
Give:    103 Bronze Coins
Receive:   1 Silver Coin
```

```text
Store B
Give:    101 Bronze Coins
Receive:   1 Silver Coin
```

A different exchange may be expressed directly as another trade:

```text
Give:    100 Silver Coins
Receive:  95 Gold Coins
```

No system-wide equation attempts to reconcile these into a universal conversion rate.

This allows:

- different exchange rates between towns/stores;
- exchange spreads;
- temporary market changes;
- shortages/inflation;
- faction-specific pricing;
- future negotiation/reputation modifiers;
- shops that refuse a particular currency;
- direct barter using non-currency Items.

---

# 2. Main Item Types

The three primary Item categories remain:

```text
WEAPON
ARMOUR
ITEM
```

Currency remains inside the general `ITEM` family, using a structured subtype/tag:

```text
ITEM
└── CURRENCY
```

Therefore the core three-category model is not expanded merely to accommodate money.

Other possible general ITEM subtypes may include:

```text
CONSUMABLE
AMMUNITION
MATERIAL
TOOL
KEY
QUEST
BOOK
DEVICE
CURRENCY
OTHER
```

Subtype is organizational data and should not require a separate D1 table for every subtype.

---

# 3. Coin Definitions

Alpha begins with three normal coin definitions:

```text
Bronze / Brown Coin
Silver Coin
Gold Coin
```

The exact Player-facing name of the lowest coin (Brown versus Bronze) may be finalized later without changing the data architecture.

Conceptually these are ordinary Item Definitions:

```text
item_definitions
├── id                    e.g. coin_bronze
├── name                  Bronze Coin
├── item_type             ITEM
├── item_subtype          CURRENCY
├── description
├── stackable             true
├── max_stack             nullable / high
├── tradeable             true
├── active
├── image_ref             coin artwork/icon
├── created_at
├── updated_at
└── metadata
```

Important:

```text
Bronze Coin does NOT contain:
  value_in_silver
  value_in_gold
  universal_exchange_rate
```

Silver and Gold likewise contain no fixed conversion relationship.

---

# 4. Character Money Storage

There is no separate authoritative `character_wallets.base_amount` model.

Coins are stored through Character Inventory exactly like other stackable possessions:

```text
character_inventory
├── id
├── character_id
├── item_definition_id
├── quantity
├── is_equipped
├── equip_slot
├── custom_name
├── custom_description
├── condition_value
├── acquired_at
├── source
├── revision
└── instance_metadata
```

Example Character holdings:

```text
coin_bronze × 312
coin_silver × 48
coin_gold   × 7
```

Player UI may render these three currency stacks in a dedicated Money section rather than mixed among ordinary bag Items.

The UI must NOT automatically change:

```text
100 Bronze -> 1 Silver
```

or any other ratio.

If the Player wants to exchange coins, that requires an actual Store/GM transaction.

---

# 5. Item Definitions

Standard reusable Item data lives in:

```text
item_definitions
├── id
├── name
├── item_type              WEAPON | ARMOUR | ITEM
├── item_subtype           nullable / e.g. CURRENCY, CONSUMABLE
├── description
├── stackable
├── max_stack
├── tradeable
├── active
├── image_ref
├── created_at
├── updated_at
└── metadata
```

There is deliberately **no authoritative global `base_price`**.

An Item can have different prices in different Stores and at different times.

A future optional `reference_value` may exist for GM convenience, but it must never be treated as an enforced transaction price or automatic conversion value.

---

# 6. Store / Merchant Model

A Store is a world entity that can expose trade offers.

Conceptual table:

```text
stores
├── id
├── campaign_id
├── name
├── description
├── location_reference
├── faction_reference
├── active
├── created_at
├── updated_at
└── metadata
```

Examples:

```text
Riverside General Store
Royal Exchange House
Guild Quartermaster
Black Market Dealer
Travelling Merchant
```

---

# 7. Store Offers — Unified Buy / Sell / Exchange Model

Do not model normal purchases and currency exchange as fundamentally different systems.

Every Store Offer describes what the customer gives and what the customer receives.

```text
Store Offer
       │
       ├── Input Bundle  (Player gives)
       └── Output Bundle (Player receives)
```

Conceptual tables:

```text
store_offers
├── id
├── store_id
├── name / label
├── active
├── valid_from             nullable
├── valid_until            nullable
├── stock_limit            nullable
├── purchase_limit         nullable
├── created_at
├── updated_at
└── metadata
```

```text
store_offer_inputs
├── offer_id
├── item_definition_id
└── quantity
```

```text
store_offer_outputs
├── offer_id
├── item_definition_id
└── quantity
```

This supports ordinary shopping:

```text
Healing Potion Offer

Player Gives:
  Silver Coin × 2
  Bronze Coin × 15

Player Receives:
  Healing Potion × 1
```

It also supports coin exchange:

```text
Silver Exchange — Store A

Player Gives:
  Bronze Coin × 103

Player Receives:
  Silver Coin × 1
```

and a different Store can simultaneously offer:

```text
Silver Exchange — Store B

Player Gives:
  Bronze Coin × 101

Player Receives:
  Silver Coin × 1
```

No conflict exists because they are two separate Store Offers.

---

# 8. Exchange Direction and Spread

Buying and selling the same currency can have different Offers.

Example:

```text
Merchant buys Silver from Player:
Player Gives:    Silver × 1
Player Receives: Bronze × 98
```

```text
Merchant sells Silver to Player:
Player Gives:    Bronze × 103
Player Receives: Silver × 1
```

The difference is the Store's exchange spread.

The same model works for Gold/Silver or any future currency.

There is no requirement that Store offers be mathematically symmetrical.

---

# 9. Time-Dependent Prices

Store Offers can be replaced, deactivated, or time-limited rather than changing a universal Item price.

Example:

```text
Week 1
103 Bronze -> 1 Silver

Week 2
108 Bronze -> 1 Silver

Festival Event
95 Bronze -> 1 Silver
```

For Alpha, GM may manually manage active Offers.

Later systems may derive Offers from:

- location;
- supply/demand;
- faction;
- Campaign events;
- Character reputation;
- negotiation Skill;
- scarcity;
- world economy rules.

The authoritative transaction must always use the concrete Offer accepted at purchase time.

---

# 10. Barter Is Naturally Supported

Because Store Offers use Item bundles rather than a hard-coded `price` number, Stores can request non-currency Items.

Example:

```text
Player Gives:
  Wolf Pelt × 5
  Silver Coin × 3

Player Receives:
  Hunter Bow × 1
```

Or pure barter:

```text
Player Gives:
  Ancient Relic × 1

Player Receives:
  Spellbook × 1
```

No extra barter system is required.

---

# 11. Store Transaction Records

A completed Shop/Exchange action must be auditable.

Conceptual structure:

```text
store_transactions
├── id
├── store_id
├── character_id
├── offer_id
├── transaction_type
├── created_at
├── created_by
└── metadata
```

The transaction must also preserve the exact Item quantities transferred at that moment, either through transaction-line tables or an immutable transaction snapshot.

Conceptual lines:

```text
store_transaction_lines
├── transaction_id
├── direction              CHARACTER_TO_STORE | STORE_TO_CHARACTER
├── item_definition_id
└── quantity
```

This ensures historical transactions remain understandable even if the Store Offer changes later.

---

# 12. Atomic Store Transaction

When a Character accepts an Offer, the Worker should perform one D1 transaction:

1. load active Offer;
2. validate time/stock/limits;
3. validate Character ownership/session;
4. verify Character has every required Input Item and quantity;
5. subtract every Input quantity;
6. add every Output quantity;
7. update Store stock if stock is tracked;
8. write transaction history;
9. commit everything together.

If any part fails, no Item or coin quantity changes.

This is especially important for currency exchange because a partial transaction must never remove one currency without granting the other.

---

# 13. Weapon Data

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

Weapon definitions describe the Item. Actual usable Attack records may reference the owned Weapon but remain separate combat entities.

---

# 14. Armour Data

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

# 15. General ITEM Data

General `ITEM` covers ordinary possessions such as:

- currency;
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

# 16. Character-Owned Item Instances

Standard Item Definition data and Character ownership remain separate:

```text
Item Definition
      ↓
Character Inventory Entry
```

Rules:

- Currency is stackable and represented by quantity.
- Ordinary stackable ITEMs may share one Inventory entry.
- WEAPON and ARMOUR default to quantity 1 and non-stackable.
- Modified/unique Items use separate Inventory entries where needed.
- Unique names, condition/durability and Character-specific modifications belong to the owned Inventory instance rather than changing the global definition.

---

# 17. Relationship with Combat and Skills

Inventory, Attack and Skill remain separate entities but may link:

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

# 18. Alpha Rules Locked by This Document

1. The normal visible currencies begin with Bronze/Brown, Silver and Gold Coins.
2. Coins are real tradable Items, not display denominations of one hidden base amount.
3. Currency Items use the main Item type `ITEM` with subtype `CURRENCY`.
4. There is no automatic currency conversion.
5. There is no universal fixed Bronze/Silver/Gold exchange ratio.
6. Character coin holdings are stored as Item quantities in D1.
7. Item Definitions do not have an authoritative universal price.
8. A price/exchange rate belongs to a Store Offer.
9. Different Stores may offer different exchange rates simultaneously.
10. The same Store may change rates over time.
11. Buying Items and exchanging currencies use the same Input Bundle -> Output Bundle model.
12. Store Offers may use multiple currencies or non-currency barter Items.
13. Completed transactions preserve the exact Items/quantities transferred.
14. Main Item categories remain WEAPON / ARMOUR / ITEM.
15. Standard Item data lives in `item_definitions`.
16. Character ownership lives in `character_inventory`.
17. Weapon and Armour use structured subtype data.
18. Inventory, Attack and Skill are separate but linkable.
19. Store transactions are atomic and auditable.
20. All authoritative data lives in Cloudflare D1; no localStorage persistence.
