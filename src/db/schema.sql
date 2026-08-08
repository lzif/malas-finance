-- MalasFinance v3 — PostgreSQL schema (spec §5.1).
-- Single-user. Money is whole rupiah stored as INTEGER, never fractional.
-- Integrity is enforced here (CHECK constraints) AND at the repository layer
-- (spec §5.2) — the repo is the only write path, but the DB is the last line.

CREATE TABLE IF NOT EXISTS wallets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('spendable', 'reserve')),
  initial_balance INTEGER NOT NULL DEFAULT 0,
  archived    BOOLEAN NOT NULL DEFAULT false,
  "order"     INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  parent_id   UUID REFERENCES categories(id),
  is_seed     BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(name, parent_id)
);

CREATE TABLE IF NOT EXISTS commitments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT NOT NULL,
  amount      INTEGER NOT NULL CHECK (amount > 0),
  kind        TEXT NOT NULL CHECK (kind IN ('bill', 'saving')),
  due_day     INTEGER NOT NULL CHECK (due_day BETWEEN 1 AND 31),
  wallet_id   UUID REFERENCES wallets(id),
  active      BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS transactions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            TEXT NOT NULL CHECK (kind IN ('out', 'in', 'move')),
  amount          INTEGER NOT NULL CHECK (amount > 0),
  intent          TEXT CHECK (intent IN ('planned', 'routine', 'impulse', 'emergency')),
  category_id     UUID REFERENCES categories(id),
  note            TEXT,
  wallet_id       UUID NOT NULL REFERENCES wallets(id),
  to_wallet_id    UUID REFERENCES wallets(id),
  commitment_id   UUID REFERENCES commitments(id),
  at              TIMESTAMPTZ NOT NULL,
  day_key         TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,

  -- intent is present iff the transaction is an expense (spec §5.2).
  CHECK (kind = 'out' OR intent IS NULL),
  -- to_wallet_id is present iff this is a transfer (spec §5.2).
  CHECK (kind = 'move' OR to_wallet_id IS NULL),
  -- a transfer never targets its own source wallet (spec §5.2).
  CHECK (wallet_id != to_wallet_id OR to_wallet_id IS NULL)
);

CREATE TABLE IF NOT EXISTS settings (
  key                  TEXT PRIMARY KEY DEFAULT 'settings',
  cycle_mode           TEXT NOT NULL DEFAULT 'monthly-day',
  cycle_anchor_day     INTEGER NOT NULL DEFAULT 1,
  cycle_manual_end     TEXT,
  end_buffer           INTEGER NOT NULL DEFAULT 0,
  day_start_hour       INTEGER NOT NULL DEFAULT 0 CHECK (day_start_hour BETWEEN 0 AND 6),
  seed_daily_spend     INTEGER NOT NULL DEFAULT 0,
  started_at           TEXT,
  nightly_summary_hour INTEGER NOT NULL DEFAULT 21,
  weekly_audit_day     INTEGER NOT NULL DEFAULT 0,
  weekly_audit_hour    INTEGER NOT NULL DEFAULT 22,
  telegram_chat_id     BIGINT,
  schema_version       INTEGER NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS idx_tx_day_key      ON transactions(day_key);
CREATE INDEX IF NOT EXISTS idx_tx_wallet       ON transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_to_wallet    ON transactions(to_wallet_id);
CREATE INDEX IF NOT EXISTS idx_tx_commitment   ON transactions(commitment_id);
CREATE INDEX IF NOT EXISTS idx_tx_deleted      ON transactions(deleted_at);
CREATE INDEX IF NOT EXISTS idx_tx_kind_intent  ON transactions(kind, intent);
CREATE INDEX IF NOT EXISTS idx_cat_parent      ON categories(parent_id);
