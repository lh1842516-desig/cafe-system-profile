-- =============================================================================
-- Phase 1: Initial SaaS Schema Migration
-- Cafe Management System → Multi-tenant Supabase PostgreSQL
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- TENANTS
-- =============================================================================

CREATE TABLE IF NOT EXISTS cafes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL DEFAULT 'My Cafe',
  slug          TEXT        UNIQUE,
  logo_url      TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cafe_settings (
  cafe_id                            UUID        PRIMARY KEY REFERENCES cafes(id) ON DELETE CASCADE,
  require_cashier_kitchen_approval   BOOLEAN     NOT NULL DEFAULT TRUE,
  max_tables                         INTEGER     NOT NULL DEFAULT 20,
  updated_at                         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- MENU
-- =============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id     UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL,
  image_url   TEXT,
  sort_order  INTEGER     NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cafe_id, name)
);

CREATE INDEX IF NOT EXISTS categories_cafe_id_idx ON categories(cafe_id);

CREATE TABLE IF NOT EXISTS menu_items (
  id           TEXT        NOT NULL,
  cafe_id      UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  price        NUMERIC(12,2) NOT NULL DEFAULT 0,
  category     TEXT,
  is_available BOOLEAN     NOT NULL DEFAULT TRUE,
  image_url    TEXT,
  ingredients  TEXT,
  options      JSONB       NOT NULL DEFAULT '[]',
  sort_order   INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(id, cafe_id)
);

CREATE INDEX IF NOT EXISTS menu_items_cafe_id_idx ON menu_items(cafe_id);

-- =============================================================================
-- TABLES (Physical cafe tables)
-- =============================================================================

CREATE TABLE IF NOT EXISTS cafe_tables (
  id       TEXT NOT NULL,
  cafe_id  UUID NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  label    TEXT NOT NULL,
  PRIMARY KEY(id, cafe_id)
);

CREATE INDEX IF NOT EXISTS cafe_tables_cafe_id_idx ON cafe_tables(cafe_id);

-- =============================================================================
-- TILL (Cash Drawer Sessions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS till_sessions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id          UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'open',
  opened_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at        TIMESTAMPTZ,
  opened_by        TEXT        NOT NULL DEFAULT '',
  closed_by        TEXT,
  opening_balance  NUMERIC(12,2) NOT NULL DEFAULT 0,
  open_date        TEXT        NOT NULL,
  note             TEXT        NOT NULL DEFAULT '',
  expenses         JSONB       NOT NULL DEFAULT '[]',
  withdrawals      JSONB       NOT NULL DEFAULT '[]',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS till_sessions_cafe_status_idx ON till_sessions(cafe_id, status);
CREATE INDEX IF NOT EXISTS till_sessions_cafe_open_date_idx ON till_sessions(cafe_id, open_date);

-- =============================================================================
-- ORDERS
-- =============================================================================

CREATE TABLE IF NOT EXISTS order_sequences (
  cafe_id        UUID    NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  open_date      TEXT    NOT NULL,
  last_sequence  INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(cafe_id, open_date)
);

CREATE TABLE IF NOT EXISTS orders (
  id                     TEXT        NOT NULL,
  cafe_id                UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id               TEXT,
  order_type             TEXT        NOT NULL DEFAULT 'DINE_IN',
  items                  JSONB       NOT NULL DEFAULT '[]',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  open_date              TEXT,
  cash_session_id        TEXT,
  till_session_uuid      UUID        REFERENCES till_sessions(id),
  till_opened_at         TIMESTAMPTZ,
  closed                 BOOLEAN     NOT NULL DEFAULT FALSE,
  closed_at              TIMESTAMPTZ,
  payment_method         TEXT,
  customer_name          TEXT,
  customer_session_id    TEXT,
  kitchen_batch_id       TEXT,
  bundled_customer_names JSONB       NOT NULL DEFAULT '[]',
  service_meta           JSONB,
  rejected_by_cashier    BOOLEAN     DEFAULT FALSE,
  cancel_reason          TEXT,
  PRIMARY KEY(id, cafe_id)
);

CREATE INDEX IF NOT EXISTS orders_cafe_id_idx        ON orders(cafe_id);
CREATE INDEX IF NOT EXISTS orders_cafe_closed_idx    ON orders(cafe_id, closed);
CREATE INDEX IF NOT EXISTS orders_cafe_table_idx     ON orders(cafe_id, table_id);
CREATE INDEX IF NOT EXISTS orders_cafe_session_idx   ON orders(cafe_id, cash_session_id);
CREATE INDEX IF NOT EXISTS orders_cafe_open_date_idx ON orders(cafe_id, open_date);

-- =============================================================================
-- KITCHEN
-- =============================================================================

CREATE TABLE IF NOT EXISTS kitchen_state (
  order_id   TEXT        NOT NULL,
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  status     TEXT        NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(order_id, cafe_id)
);

CREATE INDEX IF NOT EXISTS kitchen_state_cafe_id_idx ON kitchen_state(cafe_id);

-- =============================================================================
-- CLOSINGS (Daily cash closing records)
-- =============================================================================

CREATE TABLE IF NOT EXISTS closings (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id           UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  till_session_id   UUID        REFERENCES till_sessions(id),
  date              TEXT        NOT NULL,
  open_date         TEXT        NOT NULL,
  open_time         TEXT,
  close_time        TEXT,
  time              TEXT,
  opened_at         TIMESTAMPTZ,
  opened_by         TEXT        DEFAULT '',
  closed_at         TIMESTAMPTZ,
  closed_by         TEXT        DEFAULT '',
  opening_balance   NUMERIC(12,2) NOT NULL DEFAULT 0,
  sales_cash        NUMERIC(12,2) NOT NULL DEFAULT 0,
  sales_card        NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_sales       NUMERIC(12,2) NOT NULL DEFAULT 0,
  expenses          JSONB       NOT NULL DEFAULT '[]',
  total_expenses    NUMERIC(12,2) NOT NULL DEFAULT 0,
  withdrawals       JSONB       NOT NULL DEFAULT '[]',
  total_withdrawals NUMERIC(12,2) NOT NULL DEFAULT 0,
  net               NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_total         NUMERIC(12,2) NOT NULL DEFAULT 0,
  note              TEXT        NOT NULL DEFAULT '',
  order_count       INTEGER     NOT NULL DEFAULT 0,
  status            TEXT        NOT NULL DEFAULT 'closed',
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS closings_cafe_id_idx       ON closings(cafe_id);
CREATE INDEX IF NOT EXISTS closings_cafe_open_date_idx ON closings(cafe_id, open_date);

-- =============================================================================
-- ARCHIVE (Historical closed orders)
-- =============================================================================

CREATE TABLE IF NOT EXISTS archive_orders (
  id             TEXT        NOT NULL,
  cafe_id        UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id       TEXT,
  order_type     TEXT        NOT NULL DEFAULT 'DINE_IN',
  items          JSONB       NOT NULL DEFAULT '[]',
  open_date      TEXT,
  closed_at      TIMESTAMPTZ,
  archived_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payment_method TEXT,
  customer_name  TEXT,
  service_meta   JSONB,
  total          NUMERIC(12,2) NOT NULL DEFAULT 0,
  PRIMARY KEY(id, cafe_id)
);

CREATE INDEX IF NOT EXISTS archive_orders_cafe_date_idx ON archive_orders(cafe_id, open_date);

-- =============================================================================
-- TODAY SESSION HISTORY
-- =============================================================================

CREATE TABLE IF NOT EXISTS today_session_history (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id         UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  session_key     TEXT        NOT NULL,
  till_session_id UUID        REFERENCES till_sessions(id),
  cash_session_id TEXT,
  open_date       TEXT,
  data            JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(cafe_id, session_key)
);

CREATE INDEX IF NOT EXISTS today_session_history_cafe_idx ON today_session_history(cafe_id);

-- =============================================================================
-- CUSTOMER SESSIONS (ephemeral, QR-based)
-- =============================================================================

CREATE TABLE IF NOT EXISTS table_sessions (
  id         TEXT        NOT NULL,
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id   TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY(id, cafe_id)
);

CREATE TABLE IF NOT EXISTS customer_sessions (
  id               TEXT        NOT NULL,
  cafe_id          UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id         TEXT        NOT NULL,
  table_session_id TEXT,
  customer_name    TEXT,
  status           TEXT        NOT NULL DEFAULT 'active',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(id, cafe_id)
);

CREATE TABLE IF NOT EXISTS customer_carts (
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id   TEXT        NOT NULL,
  session_id TEXT        NOT NULL,
  items      JSONB       NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(cafe_id, table_id, session_id)
);

CREATE TABLE IF NOT EXISTS customer_device_sessions (
  device_id       TEXT        NOT NULL,
  cafe_id         UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  customer_id     TEXT,
  peer_session_id TEXT,
  table_id        TEXT,
  status          TEXT        NOT NULL DEFAULT 'active',
  suspended_at    TIMESTAMPTZ,
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(device_id, cafe_id)
);

CREATE TABLE IF NOT EXISTS customer_persistent_sessions (
  peer_session_id TEXT        NOT NULL,
  cafe_id         UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  customer_name   TEXT,
  table_id        TEXT,
  active_order_id TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(peer_session_id, cafe_id)
);

CREATE TABLE IF NOT EXISTS device_table_links (
  device_id  TEXT        NOT NULL,
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id   TEXT,
  session_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(device_id, cafe_id)
);

CREATE TABLE IF NOT EXISTS ios_kitchen_recovery_sessions (
  id         TEXT        NOT NULL,
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY(id, cafe_id)
);

-- =============================================================================
-- TABLE COORDINATION
-- =============================================================================

CREATE TABLE IF NOT EXISTS table_bill_requests (
  cafe_id      UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id     TEXT        NOT NULL,
  session_id   TEXT,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  PRIMARY KEY(cafe_id, table_id)
);

CREATE TABLE IF NOT EXISTS group_cart_sessions (
  id         TEXT        NOT NULL,
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(id, cafe_id)
);

CREATE TABLE IF NOT EXISTS table_shared_carts (
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(cafe_id, table_id)
);

CREATE TABLE IF NOT EXISTS table_ready_pending (
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id   TEXT        NOT NULL,
  data       JSONB       NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY(cafe_id, table_id)
);

-- =============================================================================
-- USERS (Staff & Admin Accounts)
-- =============================================================================

CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id       UUID        REFERENCES cafes(id) ON DELETE CASCADE,
  full_name     TEXT        NOT NULL,
  email         TEXT        UNIQUE NOT NULL,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'active',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS users_cafe_id_idx ON users(cafe_id);

-- =============================================================================
-- ALTERATIONS FOR STEP 3D: Platform Management Columns
-- =============================================================================
ALTER TABLE cafes ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE cafes ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE cafes ADD COLUMN IF NOT EXISTS subscription_status TEXT NOT NULL DEFAULT 'active';

