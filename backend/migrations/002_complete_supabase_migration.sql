-- =============================================================================
-- Phase 2: Complete Supabase Migration Schema
-- Ensures all persistent data structures exist in Supabase
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ADMIN AUTH (Local Admin credentials in Supabase)
-- =============================================================================

CREATE TABLE IF NOT EXISTS admin_auth (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username    TEXT        NOT NULL UNIQUE DEFAULT 'admin',
  password    TEXT        NOT NULL DEFAULT '20262026',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- USERS (Staff & Admin Accounts)
-- =============================================================================

-- =============================================================================
-- CATEGORIES (Ensuring sorting and unique constraints)
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
CREATE INDEX IF NOT EXISTS today_session_history_open_date_idx ON today_session_history(cafe_id, open_date);

-- =============================================================================
-- TABLE SESSIONS (inUse table selection sessions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS table_sessions (
  id         TEXT        NOT NULL,
  cafe_id    UUID        NOT NULL REFERENCES cafes(id) ON DELETE CASCADE,
  table_id   TEXT        NOT NULL,
  status     TEXT        NOT NULL DEFAULT 'in_use',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  PRIMARY KEY(id, cafe_id)
);

CREATE INDEX IF NOT EXISTS table_sessions_cafe_table_idx ON table_sessions(cafe_id, table_id);

-- =============================================================================
-- ARCHIVE ORDERS
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

-- Unique constraint helper additions
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'admin_auth_username_key') THEN
        ALTER TABLE admin_auth ADD CONSTRAINT admin_auth_username_key UNIQUE (username);
    END IF;
END $$;
