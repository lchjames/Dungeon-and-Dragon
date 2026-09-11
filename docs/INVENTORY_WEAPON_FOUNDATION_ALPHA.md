# Inventory + Weapon Equipment Foundation — Alpha Contract

Status: Canonical Alpha integration contract.

This document defines the first production implementation slice of `docs/INVENTORY_MONEY_DATA_MODEL_ALPHA.md`. It deliberately implements Inventory ownership and Weapon equipment before Store, Currency, Exchange, Armour combat effects, or automatic Weapon-derived attack maths.

## 1. Scope

This slice implements:

- global reusable `item_definitions`;
- one-to-one `weapon_definitions` for `WEAPON` Items;
- canonical Character ownership on the existing `character_inventory` authority;
- GM Weapon Definition authoring;
- GM grant of a Weapon to a Character;
- Player and GM read of canonical Character Inventory;
- Player and GM Weapon equip / unequip state;
- immutable Inventory mutation audit rows;
- optional Attack Profile → owned Weapon source binding;
- runtime attack availability gating for Weapon-backed Attack Profiles.

This slice does **not** implement:

- Store / Shop / Merchant stock;
- Currency or Exchange Rates;
- buying / selling / transfer economy;
- Armour contribution to Character defence;
- hand capacity, dual-wield, two-handed occupancy, or equipment-slot capacity rules;
- automatic derivation of D100 Accuracy from a Weapon or Skill;
- automatic derivation of combat Damage from `weapon_definitions.damage_formula`;
- automatic application of `weapon_definitions.hit_modifier`;
- Specialisation / Ability source profiles.

Those rules require separate canonical contracts before they become Runtime authority.

## 2. One Inventory Authority

The platform already has an early prototype table named `character_inventory` with `name`, `qty`, and `notes` columns.

Alpha upgrades that **same table in place**. It does not create a second Character inventory table.

Canonical fields added to the existing authority include:

- `item_definition_id`
- `quantity`
- `is_equipped`
- `equip_slot`
- `custom_name`
- `custom_description`
- `condition_value`
- `acquired_at`
- `source`
- `revision`
- `instance_metadata`

The old `name`, `qty`, and `notes` columns remain temporarily as compatibility mirrors for older Character-detail readers. New Inventory APIs treat the canonical fields above as authoritative and update compatibility mirrors where required.

No new gameplay code may treat legacy `name / qty / notes` as an independent Inventory source.

## 3. Legacy row upgrade

Existing prototype Inventory rows are preserved.

For every legacy row without `item_definition_id`:

1. create a deterministic `ITEM / OTHER` Item Definition;
2. preserve the display name and notes;
3. copy `qty` into canonical integer `quantity`;
4. mark the source as `legacy_migration`;
5. initialise `revision = 1`.

Negative or fractional legacy quantities are **not** silently rounded. The lazy production compatibility upgrade fails closed with `INVENTORY_LEGACY_QUANTITY_INVALID` so an operator can correct the row explicitly.

## 4. Item Definition versus owned instance

`item_definitions` is reusable design data.

`character_inventory` is owned Character state.

A Weapon grant creates a fresh Inventory Entry with:

- one stable Inventory ID;
- one `item_definition_id` referencing the reusable design;
- `quantity = 1`;
- `is_equipped = false` initially;
- source provenance identifying the GM grant;
- `revision = 1`.

Changing an Item Definition does not create a new owned entry.

## 5. Weapon Definition

A `WEAPON` Item may have one `weapon_definitions` row containing metadata such as:

- `weapon_group`
- `linked_skill_id`
- `damage_formula`
- `damage_type`
- `range_value`
- `attacks_per_round`
- `hit_modifier`
- `resource_cost`
- `properties`

These fields are structural Weapon metadata in this slice.

They are **not yet combat formula authority**.

In particular, this slice must not add `hit_modifier` to D100 Accuracy and must not parse `damage_formula` into the existing Damage resolver. The current Player Attack Profile bridge remains the approved numeric combat input until a later contract defines Weapon / Skill / Specialisation derivation.

## 6. Equipment state

`character_inventory.is_equipped` is authoritative for whether an owned Weapon is currently ready as an attack source.

Alpha rules:

- a Weapon entry has `quantity = 1`;
- an inactive Weapon Definition cannot be equipped;
- only `WEAPON` equip / unequip is enabled by this slice;
- equipping sets `equip_slot = 'weapon'`;
- unequipping clears `equip_slot`;
- Player may equip or unequip Weapons owned by their own Character;
- GM may equip or unequip a Character Weapon through the GM Inventory authority;
- a DEAD / locked Character cannot use the ordinary Inventory / Equipment mutation path.

Alpha intentionally does **not** enforce one equipped Weapon, hand capacity, dual-wield, or two-handed occupancy. Multiple Weapon entries may therefore have `is_equipped = true`. This is a temporary absence of slot-capacity rules, not a statement that every future build allows unlimited hands.

## 7. Optimistic Inventory mutation

Every canonical owned entry has `revision`.

UI writes send the revision they read. A stale mutation fails with `INVENTORY_REVISION_CHANGED` rather than overwriting newer ownership/equipment state.

Every accepted grant / equip / unequip / quantity change appends to `character_inventory_log` with actor identity and before/after state.

## 8. Attack Profile → Weapon source bridge

`player_attack_profiles.source_inventory_id` is nullable.

- `NULL` means the existing temporary legacy Attack Profile bridge.
- a non-null value means the Profile is backed by one owned Weapon Inventory Entry.

GM may bind or unbind the source. Binding requires:

- Inventory Entry belongs to the same Character;
- Item type is `WEAPON`;
- Weapon quantity is 1;
- Item Definition is active.

Binding does not require the Weapon to be equipped; this permits authoring before play.

A source change appends to `player_attack_profile_source_log`.

## 9. Attack-time availability

A Weapon-backed Attack Profile is available to Player combat only when, at the instant the attack request is processed:

- the Profile is active;
- the source Inventory Entry still exists;
- it still belongs to the attacking Character;
- it still resolves to a `WEAPON` Definition;
- the Definition is active;
- `quantity = 1`;
- `is_equipped = true`.

If a linked Weapon is unequipped or otherwise unavailable, the Profile is removed from the Player's available Profile list. A direct stale attack request using that Profile is rejected before Action consumption with `ATTACK_PROFILE_WEAPON_NOT_EQUIPPED`.

This gate applies above the existing Character, Monster, and Boss attack resolvers, so all target types retain the same Weapon-source availability rule without duplicating D100 / Damage logic.

## 10. Existing combat maths remain canonical

For a Weapon-backed Profile in this foundation slice:

- `stored_accuracy`
- `damage_dice_count`
- `damage_dice_sides`
- `fixed_damage_modifier`
- `applies_character_damage_bonus`

remain the combat numbers used by the existing approved Attack Profile resolver.

The Weapon source establishes ownership / equipment provenance and availability only.

No new alternate D100 or Damage engine is introduced.

## 11. API surface

GM Definition authority:

- `GET /api/gm/items`
- `POST /api/gm/items`
- `PATCH /api/gm/items/:itemDefinitionId`

The Alpha authoring endpoint accepts `WEAPON` Definitions only.

GM Character Inventory:

- `GET /api/gm/characters/:characterId/inventory`
- `POST /api/gm/characters/:characterId/inventory`
- `PATCH /api/gm/characters/:characterId/inventory/:inventoryId`

Player Character Inventory:

- `GET /api/player/characters/:characterId/inventory`
- `PATCH /api/player/characters/:characterId/inventory/:inventoryId`

Existing GM Attack Profile create / patch routes additionally accept optional `sourceInventoryId`.

## 12. Definition / ownership isolation

Granting, equipping, unequipping, or changing Character quantity never mutates the Item Definition.

Editing a Weapon Definition never changes ownership identity or Inventory IDs.

Definition `active = false` makes it unavailable for new grant / equip / Weapon-backed attack use without deleting historical ownership rows.

## 13. Production compatibility

`schema/0030_inventory_weapon_foundation.sql` defines the explicit migration.

Because normal production deployment currently deploys Worker code without automatically applying SQL migration files, `src/inventory-weapon-authority.js` also performs the equivalent additive compatibility upgrade lazily on first relevant request.

The lazy upgrader must preserve old rows and fail closed rather than silently coerce invalid legacy quantity.

## 14. UI

GM receives a dedicated Inventory / Weapon panel for:

- creating Weapon Definitions;
- granting Weapons;
- equipping / unequipping owned Weapons;
- binding existing Attack Profiles to owned Weapons.

Player Inventory renders canonical Item Definition + ownership state and permits:

- integer quantity edits for stackable non-Weapon Items;
- Weapon Equip / Unequip.

The existing raw prototype Inventory rendering remains only a downstream compatibility fallback; the new Inventory module owns the visible canonical Inventory interaction.

## 15. Next authority slices

After this foundation is production stable, useful follow-up work includes:

1. lock the canonical Weapon / Skill / Specialisation formula that derives approved attack inputs;
2. replace explicit GM-authored Attack Profile numbers with generated source profiles;
3. implement Armour equipment authority and Character defence contribution;
4. only then add Store / Currency / Exchange transaction flows on top of the same Inventory authority.
