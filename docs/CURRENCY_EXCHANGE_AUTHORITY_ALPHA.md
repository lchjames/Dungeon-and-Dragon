# Currency Exchange Authority — Alpha

> Status: **Production authority contract** for the Alpha Currency Exchange slice.
> Structural economy rules remain defined by `INVENTORY_MONEY_DATA_MODEL_ALPHA.md`.

## 1. Authority boundary

Currency is not a separate wallet table. Bronze, Silver and Gold are canonical `ITEM / CURRENCY` definitions owned through the existing `character_inventory` authority:

- `coin_bronze`
- `coin_silver`
- `coin_gold`

Each Character has at most one stack for each denomination. The Worker lazily inserts missing zero-balance stacks.

`character_inventory.quantity` is authoritative. Legacy `qty` remains a compatibility mirror and is updated in the same authoritative writes.

## 2. Currency cannot use generic Inventory quantity editing

Player Currency quantity may change only through:

1. a committed Currency Exchange transaction; or
2. explicit GM Currency correction.

The top-level Currency gateway rejects generic `/inventory/:inventoryId` quantity/qty PATCH operations when the target definition subtype is `CURRENCY`.

The Player Inventory UI also removes Currency rows from the generic quantity editor. This UI rule is defence-in-depth; the server gate is authoritative.

## 3. Exchange Rate Sets

Rate configuration is Campaign-scoped under Alpha campaign identity `alpha`.

`currency_exchange_rate_sets.status` is one of:

- `DRAFT`
- `ACTIVE`
- `ARCHIVED`

Only one normal ACTIVE set may exist. A partial unique index enforces that invariant.

Activating a DRAFT archives the previous ACTIVE set and activates the selected DRAFT through one D1 batch. The action is written to `currency_exchange_admin_log`.

## 4. Directional rates

Alpha supports exactly four directions:

- Bronze → Silver
- Silver → Bronze
- Silver → Gold
- Gold → Silver

Each direction stores an exact bundle:

```text
from_quantity source coins -> to_quantity destination coins
```

The reverse rate is independent and is never inferred as a reciprocal.

Direct Bronze ↔ Gold is out of scope for this Alpha slice.

## 5. Random generation

Default references:

- 100 Bronze per Silver
- 100 Silver per Gold

Default random ranges:

- low → high premium: 2–10%
- high → low haircut: 0–3%

For a reference `R`:

```text
low_to_high_required = ceil(R × (1 + premium))
high_to_low_receive = floor(R × (1 - haircut))
```

The generator must enforce:

```text
high_to_low_receive < low_to_high_required
```

for each adjacent pair before exposing the DRAFT. Randomising never publishes immediately; the GM must explicitly activate the DRAFT.

## 6. Manual Drafts

GM may edit all four directional bundles and enable/disable each direction before saving a manual DRAFT.

All four direction records must remain present even if one is disabled. Quantities must be positive integers.

## 7. Whole-bundle Player exchange

Player submits:

- `rateId`
- `expectedRateSetId`
- quoted source/destination bundle values
- total source Currency quantity to convert

Source quantity must be a positive whole multiple of the current source bundle. The Worker never rounds and never creates fractional Coins.

The destination total is derived server-side:

```text
exchange_units = source_quantity / quoted_from_quantity
destination_total = exchange_units × quoted_to_quantity
```

## 8. Stale-rate protection

The HTTP authority first loads the requested quote, but that is not the final trust boundary.

`trg_currency_exchange_apply` re-validates inside the authoritative transaction statement that:

- the Rate exists;
- the Rate belongs to the expected Rate Set;
- the Set is currently ACTIVE;
- the direction is enabled;
- source/destination Item identities still match;
- quoted bundle quantities still match.

A changed or replaced quote aborts with `CURRENCY_RATE_STALE`. No balance mutation persists.

## 9. Atomic balance mutation

A successful insert into `currency_exchange_transactions` is the transaction boundary.

Before the immutable transaction row commits, the trigger:

1. re-validates the ACTIVE quote;
2. validates bundle totals;
3. subtracts source Currency only when sufficient balance exists;
4. requires exactly one source stack update;
5. adds destination Currency;
6. requires exactly one destination stack update;
7. writes `currency_exchange_out` Inventory audit;
8. writes `currency_exchange_in` Inventory audit.

If any step aborts, SQLite rolls back the statement including trigger side-effects. The system cannot persist only the debit or only the credit.

## 10. Audit

Three audit surfaces exist:

- `currency_exchange_transactions`: immutable completed Player exchanges and the exact quote used;
- `currency_exchange_admin_log`: GM generation/settings/activation actions;
- `character_inventory_log`: balance transitions for exchange-in/out and GM corrections.

Historical exchange transactions preserve the exact quoted bundle even after later Rate Sets are archived.

## 11. Character lock policy

Currency is Inventory authority. A Character marked locked/dead by `character_life_states.character_locked = 1` cannot:

- perform Player exchange;
- receive GM Currency correction through the normal Currency endpoint.

Read-only balances remain available.

## 12. UI contract

GM Dashboard exposes:

- current ACTIVE rates;
- DRAFT preview/editing;
- random generator settings;
- Randomise Today's Rates;
- manual Draft save;
- explicit activation;
- recent Rate Set history.

GM Character detail exposes Bronze/Silver/Gold correction controls.

Player Inventory exposes:

- separate Coin balances;
- current ACTIVE enabled rates;
- an Exchange dialog with exact bundle step;
- Pay / Receive / After preview;
- Max and bundle increment controls.

## 13. Explicitly out of scope

This slice does not add:

- Store purchase/sale authority;
- automatic Currency conversion during purchases;
- Bronze ↔ Gold direct market;
- floating/fractional Coins;
- hidden base-money normalization;
- Weapon-derived combat formula changes;
- Armour combat maths.

## 14. Production verification

`scripts/production-alpha-currency-exchange-e2e.mjs` is plan-only unless both are supplied:

```text
DND_ALPHA_EXECUTE=1
DND_ALPHA_GM_PASSWORD=<operator credential>
```

The live runner deliberately does **not** activate or replace the global Campaign Rate Set. It requires an already ACTIVE enabled quote, creates temporary Player/Character audit data, gives the test Character source Currency through GM correction, executes one real Player exchange, verifies balances, and confirms generic Player Inventory Currency quantity editing is rejected.

Normal CI executes only the plan/safety path. A green CI run must never be reported as a live D1-writing Currency Exchange run.
