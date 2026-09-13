PRAGMA foreign_keys = ON;

-- Currency remains ordinary canonical Inventory ownership. These reusable
-- definitions are the only Alpha currency denominations.
INSERT OR IGNORE INTO item_definitions (
  id, name, item_type, item_subtype, description, stackable, max_stack,
  tradeable, active, image_ref, created_at, updated_at, metadata
) VALUES
  ('coin_bronze', 'Bronze Coin', 'ITEM', 'CURRENCY', 'Bronze visible Campaign currency.', 1, NULL, 1, 1, NULL, 0, 0, '{"currency":true,"denomination":"bronze"}'),
  ('coin_silver', 'Silver Coin', 'ITEM', 'CURRENCY', 'Silver visible Campaign currency.', 1, NULL, 1, 1, NULL, 0, 0, '{"currency":true,"denomination":"silver"}'),
  ('coin_gold', 'Gold Coin', 'ITEM', 'CURRENCY', 'Gold visible Campaign currency.', 1, NULL, 1, 1, NULL, 0, 0, '{"currency":true,"denomination":"gold"}');

CREATE TABLE IF NOT EXISTS currency_exchange_generation_settings (
  campaign_id TEXT PRIMARY KEY,
  bronze_per_silver_reference INTEGER NOT NULL DEFAULT 100,
  silver_per_gold_reference INTEGER NOT NULL DEFAULT 100,
  low_to_high_premium_min_pct REAL NOT NULL DEFAULT 2,
  low_to_high_premium_max_pct REAL NOT NULL DEFAULT 10,
  high_to_low_spread_min_pct REAL NOT NULL DEFAULT 0,
  high_to_low_spread_max_pct REAL NOT NULL DEFAULT 3,
  updated_by_gm_id TEXT,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (updated_by_gm_id) REFERENCES users(id) ON DELETE SET NULL
);

INSERT OR IGNORE INTO currency_exchange_generation_settings (
  campaign_id, bronze_per_silver_reference, silver_per_gold_reference,
  low_to_high_premium_min_pct, low_to_high_premium_max_pct,
  high_to_low_spread_min_pct, high_to_low_spread_max_pct,
  updated_by_gm_id, updated_at
) VALUES ('alpha', 100, 100, 2, 10, 0, 3, NULL, 0);

CREATE TABLE IF NOT EXISTS currency_exchange_rate_sets (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  label TEXT NOT NULL,
  effective_from INTEGER,
  effective_until INTEGER,
  status TEXT NOT NULL CHECK (status IN ('ACTIVE','ARCHIVED','DRAFT')),
  generation_mode TEXT NOT NULL CHECK (generation_mode IN ('MANUAL','RANDOM')),
  random_seed TEXT,
  created_by_gm_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by_gm_id) REFERENCES users(id) ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_currency_exchange_active_campaign
  ON currency_exchange_rate_sets(campaign_id)
  WHERE status = 'ACTIVE';
CREATE INDEX IF NOT EXISTS idx_currency_exchange_sets_history
  ON currency_exchange_rate_sets(campaign_id, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS currency_exchange_rates (
  id TEXT PRIMARY KEY,
  rate_set_id TEXT NOT NULL,
  from_item_definition_id TEXT NOT NULL,
  to_item_definition_id TEXT NOT NULL,
  from_quantity INTEGER NOT NULL CHECK (from_quantity > 0),
  to_quantity INTEGER NOT NULL CHECK (to_quantity > 0),
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (rate_set_id) REFERENCES currency_exchange_rate_sets(id) ON DELETE CASCADE,
  FOREIGN KEY (from_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
  UNIQUE (rate_set_id, from_item_definition_id, to_item_definition_id)
);
CREATE INDEX IF NOT EXISTS idx_currency_exchange_rates_set
  ON currency_exchange_rates(rate_set_id, sort_order, id);

CREATE TABLE IF NOT EXISTS currency_exchange_transactions (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  character_id TEXT NOT NULL,
  rate_set_id TEXT NOT NULL,
  rate_id TEXT NOT NULL,
  from_item_definition_id TEXT NOT NULL,
  from_quantity_total INTEGER NOT NULL CHECK (from_quantity_total > 0),
  to_item_definition_id TEXT NOT NULL,
  to_quantity_total INTEGER NOT NULL CHECK (to_quantity_total > 0),
  quoted_from_quantity INTEGER NOT NULL CHECK (quoted_from_quantity > 0),
  quoted_to_quantity INTEGER NOT NULL CHECK (quoted_to_quantity > 0),
  exchange_units INTEGER NOT NULL CHECK (exchange_units > 0),
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  metadata TEXT NOT NULL DEFAULT '{}',
  FOREIGN KEY (character_id) REFERENCES characters(id) ON DELETE RESTRICT,
  FOREIGN KEY (rate_set_id) REFERENCES currency_exchange_rate_sets(id) ON DELETE RESTRICT,
  FOREIGN KEY (rate_id) REFERENCES currency_exchange_rates(id) ON DELETE RESTRICT,
  FOREIGN KEY (from_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (to_item_definition_id) REFERENCES item_definitions(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS idx_currency_exchange_transactions_character
  ON currency_exchange_transactions(character_id, created_at DESC);

CREATE TABLE IF NOT EXISTS currency_exchange_admin_log (
  id TEXT PRIMARY KEY,
  campaign_id TEXT NOT NULL,
  action_type TEXT NOT NULL,
  rate_set_id TEXT,
  actor_user_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (rate_set_id) REFERENCES currency_exchange_rate_sets(id) ON DELETE SET NULL,
  FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE RESTRICT
);

-- One visible stack per Character/denomination. Coin stacks are inserted lazily
-- for a Character by the Worker because the base schema has no global Character
-- creation trigger shared by all historical environments.
CREATE UNIQUE INDEX IF NOT EXISTS idx_character_inventory_currency_stack
  ON character_inventory(character_id, item_definition_id)
  WHERE item_definition_id IN ('coin_bronze','coin_silver','coin_gold');

DROP TRIGGER IF EXISTS trg_currency_exchange_apply;
CREATE TRIGGER trg_currency_exchange_apply
BEFORE INSERT ON currency_exchange_transactions
BEGIN
  -- Re-read the ACTIVE quote in the same authoritative statement. A quote that
  -- changed after the Player opened the dialog is rejected before any balance
  -- mutation can persist.
  SELECT RAISE(ABORT, 'CURRENCY_RATE_STALE')
  WHERE NOT EXISTS (
    SELECT 1
    FROM currency_exchange_rates r
    JOIN currency_exchange_rate_sets s ON s.id = r.rate_set_id
    WHERE r.id = NEW.rate_id
      AND r.rate_set_id = NEW.rate_set_id
      AND s.campaign_id = NEW.campaign_id
      AND s.status = 'ACTIVE'
      AND r.enabled = 1
      AND r.from_item_definition_id = NEW.from_item_definition_id
      AND r.to_item_definition_id = NEW.to_item_definition_id
      AND r.from_quantity = NEW.quoted_from_quantity
      AND r.to_quantity = NEW.quoted_to_quantity
  );

  SELECT RAISE(ABORT, 'CURRENCY_BUNDLE_INVALID')
  WHERE NEW.from_quantity_total != NEW.quoted_from_quantity * NEW.exchange_units
     OR NEW.to_quantity_total != NEW.quoted_to_quantity * NEW.exchange_units;

  UPDATE character_inventory
  SET quantity = quantity - NEW.from_quantity_total,
      qty = quantity - NEW.from_quantity_total,
      revision = revision + 1
  WHERE character_id = NEW.character_id
    AND item_definition_id = NEW.from_item_definition_id
    AND quantity >= NEW.from_quantity_total;

  SELECT RAISE(ABORT, 'CURRENCY_INSUFFICIENT_FUNDS') WHERE changes() != 1;

  UPDATE character_inventory
  SET quantity = quantity + NEW.to_quantity_total,
      qty = quantity + NEW.to_quantity_total,
      revision = revision + 1
  WHERE character_id = NEW.character_id
    AND item_definition_id = NEW.to_item_definition_id;

  SELECT RAISE(ABORT, 'CURRENCY_DESTINATION_STACK_MISSING') WHERE changes() != 1;

  INSERT INTO character_inventory_log (
    id, character_id, inventory_id, item_definition_id, change_type,
    from_quantity, to_quantity, from_equipped, to_equipped,
    actor_user_id, actor_role, created_at
  )
  SELECT NEW.id || ':out', NEW.character_id, ci.id, NEW.from_item_definition_id,
         'currency_exchange_out', ci.quantity + NEW.from_quantity_total, ci.quantity,
         0, 0, NEW.created_by_user_id, 'player', NEW.created_at
  FROM character_inventory ci
  WHERE ci.character_id = NEW.character_id
    AND ci.item_definition_id = NEW.from_item_definition_id;

  INSERT INTO character_inventory_log (
    id, character_id, inventory_id, item_definition_id, change_type,
    from_quantity, to_quantity, from_equipped, to_equipped,
    actor_user_id, actor_role, created_at
  )
  SELECT NEW.id || ':in', NEW.character_id, ci.id, NEW.to_item_definition_id,
         'currency_exchange_in', ci.quantity - NEW.to_quantity_total, ci.quantity,
         0, 0, NEW.created_by_user_id, 'player', NEW.created_at
  FROM character_inventory ci
  WHERE ci.character_id = NEW.character_id
    AND ci.item_definition_id = NEW.to_item_definition_id;
END;
