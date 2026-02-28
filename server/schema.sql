-- Hemp Life Farmers — Neon Postgres Schema
-- Run this against your Neon database to initialize all tables.

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- MEMBERS
-- ============================================================
CREATE TABLE members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name     TEXT NOT NULL,
  business_name TEXT NOT NULL,
  business_type TEXT,
  license_number TEXT,
  ein           TEXT,
  email         TEXT UNIQUE NOT NULL,
  phone         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  -- Address
  street        TEXT NOT NULL,
  city          TEXT NOT NULL,
  state         CHAR(2) NOT NULL,
  zip           TEXT NOT NULL,
  -- Shipping (if different)
  ship_street   TEXT,
  ship_city     TEXT,
  ship_state    CHAR(2),
  ship_zip      TEXT,
  -- Invitation
  invite_code_used TEXT NOT NULL,
  invited_by       TEXT,
  how_heard        TEXT,
  -- Status
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','active','suspended','denied','canceled')),
  app_fee_paid  BOOLEAN DEFAULT FALSE,
  monthly_active BOOLEAN DEFAULT FALSE,
  -- Payment
  payment_method TEXT DEFAULT 'ACH',
  -- Referral
  personal_ref_code TEXT UNIQUE,
  -- Timestamps
  applied_at    TIMESTAMPTZ DEFAULT NOW(),
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_members_email ON members(email);
CREATE INDEX idx_members_status ON members(status);
CREATE INDEX idx_members_invite ON members(invite_code_used);

-- ============================================================
-- INVITE CODES
-- ============================================================
CREATE TABLE invite_codes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        TEXT UNIQUE NOT NULL,
  created_by  UUID REFERENCES members(id) ON DELETE SET NULL,
  created_by_admin BOOLEAN DEFAULT FALSE,
  used_by     UUID REFERENCES members(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'available'
              CHECK (status IN ('available','used','revoked')),
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  used_at     TIMESTAMPTZ
);

CREATE INDEX idx_invite_codes_code ON invite_codes(code);
CREATE INDEX idx_invite_codes_status ON invite_codes(status);

-- ============================================================
-- PRODUCTS
-- ============================================================
CREATE TABLE products (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                   TEXT UNIQUE NOT NULL,
  product_name          TEXT NOT NULL,
  product_type          TEXT NOT NULL,
  product_category      TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active'
                        CHECK (status IN ('active','inactive','out_of_stock')),
  -- Cultivation
  cultivation_method    TEXT,
  cultivation_location  TEXT,
  harvest_date          DATE,
  strain_name_internal  TEXT,
  -- Cannabinoids
  delta9_thc_pct        NUMERIC(5,2),
  thca_pct              NUMERIC(5,2),
  cbd_pct               NUMERIC(5,2),
  cbg_pct               NUMERIC(5,2),
  cbn_pct               NUMERIC(5,2),
  total_cannabinoids_pct NUMERIC(5,2),
  -- Terpenes
  terpene_1_name TEXT, terpene_1_pct NUMERIC(5,2),
  terpene_2_name TEXT, terpene_2_pct NUMERIC(5,2),
  terpene_3_name TEXT, terpene_3_pct NUMERIC(5,2),
  total_terpenes_pct    NUMERIC(5,2),
  -- Physical
  appearance            TEXT,
  aroma_profile         TEXT,
  moisture_content_pct  NUMERIC(5,2),
  trim_type             TEXT,
  density               TEXT,
  -- Lab / Compliance
  coa_batch_number      TEXT,
  coa_test_date         DATE,
  coa_lab_name          TEXT,
  coa_lab_accreditation TEXT,
  coa_pdf_filename      TEXT,
  heavy_metals_pass     BOOLEAN DEFAULT TRUE,
  pesticides_pass       BOOLEAN DEFAULT TRUE,
  microbials_pass       BOOLEAN DEFAULT TRUE,
  mycotoxins_pass       BOOLEAN DEFAULT TRUE,
  residual_solvents_pass BOOLEAN DEFAULT TRUE,
  foreign_matter_pass   BOOLEAN DEFAULT TRUE,
  farm_bill_compliant   BOOLEAN DEFAULT TRUE,
  -- Pricing
  price_per_lb          NUMERIC(10,2) NOT NULL,
  price_5lb             NUMERIC(10,2),
  price_10lb            NUMERIC(10,2),
  min_order_lbs         INTEGER DEFAULT 1,
  inventory_lbs         NUMERIC(10,2) DEFAULT 0,
  inventory_status      TEXT DEFAULT 'in_stock',
  -- Packaging
  packaging_type        TEXT,
  shelf_life_days       INTEGER,
  storage_requirements  TEXT,
  weight_per_unit_lbs   NUMERIC(10,2),
  ships_from_state      CHAR(2),
  -- Display
  display_order         INTEGER DEFAULT 0,
  featured              BOOLEAN DEFAULT FALSE,
  short_description     TEXT,
  long_description      TEXT,
  product_image_url     TEXT,
  compliance_statement  TEXT,
  -- Chain of Custody
  coc_cultivation_origin TEXT,
  coc_processor          TEXT,
  coc_handler            TEXT,
  coc_storage_facility   TEXT,
  coc_last_audit_date    DATE,
  -- Shipping
  restricted_states      TEXT, -- comma-separated state codes
  -- Tracking
  added_by               TEXT,
  notes_internal         TEXT,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_status ON products(status);
CREATE INDEX idx_products_featured ON products(featured);

-- ============================================================
-- ORDERS
-- ============================================================
CREATE TABLE orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number    TEXT UNIQUE NOT NULL,  -- e.g. HLF-0001
  member_id       UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- Status
  status          TEXT NOT NULL DEFAULT 'pending_review'
                  CHECK (status IN ('pending_review','approved','processing','shipped','delivered','canceled')),
  -- Payment
  payment_method  TEXT,
  payment_status  TEXT DEFAULT 'unpaid'
                  CHECK (payment_status IN ('unpaid','paid','refunded')),
  -- Totals
  subtotal        NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_cost   NUMERIC(10,2) DEFAULT 0,
  total           NUMERIC(12,2) NOT NULL DEFAULT 0,
  -- Shipping
  ship_state      CHAR(2),
  -- Notes
  notes           TEXT,
  admin_notes     TEXT,
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  approved_at     TIMESTAMPTZ,
  shipped_at      TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_orders_member ON orders(member_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_number ON orders(order_number);

-- ============================================================
-- ORDER ITEMS (line items for each order)
-- ============================================================
CREATE TABLE order_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id    UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id  UUID NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  sku         TEXT NOT NULL,
  product_name TEXT NOT NULL,
  quantity_lbs NUMERIC(10,2) NOT NULL,
  price_per_lb NUMERIC(10,2) NOT NULL,
  subtotal     NUMERIC(12,2) NOT NULL
);

CREATE INDEX idx_order_items_order ON order_items(order_id);

-- ============================================================
-- BILLING / PAYMENTS
-- ============================================================
CREATE TABLE payments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id     UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  order_id      UUID REFERENCES orders(id) ON DELETE SET NULL,
  type          TEXT NOT NULL
                CHECK (type IN ('application_fee','monthly_membership','order_payment')),
  amount        NUMERIC(10,2) NOT NULL,
  method        TEXT,
  reference     TEXT,
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','verified','failed','refunded')),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  verified_at   TIMESTAMPTZ
);

CREATE INDEX idx_payments_member ON payments(member_id);
CREATE INDEX idx_payments_type ON payments(type);

-- ============================================================
-- SESSIONS (for auth tokens)
-- ============================================================
CREATE TABLE sessions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id   UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  token       TEXT UNIQUE NOT NULL,
  is_admin    BOOLEAN DEFAULT FALSE,
  expires_at  TIMESTAMPTZ NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sessions_token ON sessions(token);
CREATE INDEX idx_sessions_member ON sessions(member_id);

-- ============================================================
-- ADMIN USERS (separate table for super admins)
-- ============================================================
CREATE TABLE admins (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name          TEXT NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- RESTRICTED STATES
-- ============================================================
CREATE TABLE restricted_states (
  state_code  CHAR(2) PRIMARY KEY,
  state_name  TEXT NOT NULL,
  reason      TEXT,
  added_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Seed restricted states
INSERT INTO restricted_states (state_code, state_name, reason) VALUES
  ('ID', 'Idaho', 'State-level hemp product restrictions'),
  ('OR', 'Oregon', 'State-level hemp product restrictions'),
  ('SD', 'South Dakota', 'State-level hemp product restrictions');

-- ============================================================
-- UPDATED_AT TRIGGER
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_members_updated BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_orders_updated BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION update_updated_at();
