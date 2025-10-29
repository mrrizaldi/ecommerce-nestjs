-- PostgreSQL schema for e-commerce (text-based statuses, tuned indexes)
-- Fixed: remove unsupported "IF NOT EXISTS" from ADD CONSTRAINT, and reorder FKs
-- Run inside a transaction for safety
BEGIN;

-- 0) Extensions (UUID generator)
CREATE EXTENSION IF NOT EXISTS pgcrypto; -- for gen_random_uuid()

-- 1) Generic trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

/* =========================
   USERS
   ========================= */
CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email         TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  phone         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- unique email (case-insensitive)
CREATE UNIQUE INDEX uniq_users_email_ci ON users (LOWER(email));

CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* =========================
   ADDRESSES
   ========================= */
CREATE TABLE addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) ON UPDATE CASCADE ON DELETE SET NULL,
  label        TEXT,
  recipient    TEXT,
  phone        TEXT,
  line1        TEXT,
  line2        TEXT,
  city         TEXT,
  province     TEXT,
  postal_code  TEXT,
  country_code CHAR(2),
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_addresses_user_default ON addresses(user_id, is_default);
-- Optional: enforce max 1 default per user
-- CREATE UNIQUE INDEX uniq_addresses_user_default_true ON addresses(user_id) WHERE is_default;

CREATE TRIGGER trg_addresses_updated_at
BEFORE UPDATE ON addresses
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* =========================
   CATEGORIES (self-referencing)
   ========================= */
CREATE TABLE categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  slug       TEXT NOT NULL,
  parent_id  UUID REFERENCES categories(id) ON UPDATE CASCADE ON DELETE SET NULL
);

CREATE UNIQUE INDEX uniq_categories_slug ON categories(slug);
CREATE INDEX idx_categories_parent ON categories(parent_id);

/* =========================
   PRODUCTS & VARIANTS
   ========================= */
CREATE TABLE products (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL,
  description TEXT,
  brand       TEXT,
  status      TEXT NOT NULL DEFAULT 'ACTIVE',  -- was enum, now TEXT
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_products_slug ON products(slug);
CREATE INDEX idx_products_status_created ON products(status, created_at);
-- Optional search helpers (uncomment if you enable pg_trgm):
-- CREATE EXTENSION IF NOT EXISTS pg_trgm;
-- CREATE INDEX idx_products_title_trgm ON products USING GIN (title gin_trgm_ops);

CREATE TRIGGER trg_products_updated_at
BEFORE UPDATE ON products
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE product_variants (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  sku           TEXT NOT NULL,
  title         TEXT,
  price         NUMERIC(12,2) NOT NULL,
  currency      CHAR(3) NOT NULL,
  weight_grams  INT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uniq_variants_sku ON product_variants(sku);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TRIGGER trg_variants_updated_at
BEFORE UPDATE ON product_variants
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* =========================
   PRODUCT CATEGORIES (M2M)
   ========================= */
CREATE TABLE product_categories (
  product_id  UUID NOT NULL REFERENCES products(id) ON UPDATE CASCADE ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES categories(id) ON UPDATE CASCADE ON DELETE CASCADE,
  PRIMARY KEY (product_id, category_id)
);

CREATE INDEX idx_category_product ON product_categories(category_id, product_id);

/* =========================
   INVENTORY
   ========================= */
CREATE TABLE inventory_stock (
  variant_id  UUID PRIMARY KEY REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  quantity    INT NOT NULL DEFAULT 0,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_inventory_stock_qty_nonneg CHECK (quantity >= 0)
);

CREATE INDEX idx_stock_variant ON inventory_stock(variant_id);

CREATE TRIGGER trg_inventory_stock_updated_at
BEFORE UPDATE ON inventory_stock
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE inventory_movements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE CASCADE,
  delta      INT NOT NULL,
  reason     TEXT NOT NULL, -- was enum, now TEXT
  order_id   UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_movements_variant_time ON inventory_movements(variant_id, created_at);
CREATE INDEX idx_movements_order ON inventory_movements(order_id);

/* =========================
   CARTS & ITEMS
   ========================= */
CREATE TABLE carts (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              UUID NOT NULL REFERENCES users(id) ON UPDATE CASCADE ON DELETE CASCADE,
  is_checked_out       BOOLEAN NOT NULL DEFAULT FALSE,
  checked_out_order_id UUID, -- FK added after orders exist
  currency             CHAR(3),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_carts_user ON carts(user_id);
-- One active cart per user (partial unique)
CREATE UNIQUE INDEX uniq_carts_user_active ON carts(user_id) WHERE is_checked_out = FALSE;

CREATE TRIGGER trg_carts_updated_at
BEFORE UPDATE ON carts
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE cart_items (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id    UUID NOT NULL REFERENCES carts(id) ON UPDATE CASCADE ON DELETE CASCADE,
  variant_id UUID NOT NULL REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  quantity   INT NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX uniq_cart_variant ON cart_items(cart_id, variant_id);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

/* =========================
   ORDERS & ORDER ITEMS
   ========================= */
CREATE TABLE orders (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 TEXT NOT NULL,
  user_id              UUID,
  status               TEXT NOT NULL DEFAULT 'PENDING_PAYMENT', -- was enum, now TEXT
  cart_id              UUID,
  billing_address_id   UUID,
  shipping_address_id  UUID,
  currency             CHAR(3) NOT NULL,
  subtotal_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  shipping_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  discount_amount      NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_amount         NUMERIC(12,2) NOT NULL DEFAULT 0,
  placed_at            TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_orders_amounts CHECK (
    total_amount = subtotal_amount + shipping_amount - discount_amount
  )
);

CREATE UNIQUE INDEX uniq_orders_code ON orders(code);
CREATE INDEX idx_orders_user_status_created ON orders(user_id, status, created_at);
CREATE INDEX idx_orders_placed_at ON orders(placed_at);

-- FKs after table exists
ALTER TABLE orders
  ADD CONSTRAINT fk_orders_user           FOREIGN KEY (user_id)             REFERENCES users(id)     ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT fk_orders_cart           FOREIGN KEY (cart_id)             REFERENCES carts(id)     ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT fk_orders_billing_addr   FOREIGN KEY (billing_address_id)  REFERENCES addresses(id) ON UPDATE CASCADE ON DELETE SET NULL,
  ADD CONSTRAINT fk_orders_shipping_addr  FOREIGN KEY (shipping_address_id) REFERENCES addresses(id) ON UPDATE CASCADE ON DELETE SET NULL;

-- Now that orders exist, tie carts.checked_out_order_id → orders.id
ALTER TABLE carts
  ADD CONSTRAINT fk_carts_checkedout_order FOREIGN KEY (checked_out_order_id) REFERENCES orders(id) ON UPDATE CASCADE ON DELETE SET NULL;

CREATE TRIGGER trg_orders_updated_at
BEFORE UPDATE ON orders
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE order_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      UUID NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE CASCADE,
  variant_id    UUID NOT NULL REFERENCES product_variants(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  sku           TEXT NOT NULL,
  product_title TEXT,
  variant_title TEXT,
  price         NUMERIC(12,2) NOT NULL,
  quantity      INT NOT NULL,
  total         NUMERIC(12,2) NOT NULL,
  CONSTRAINT chk_order_items_total CHECK (total = price * quantity)
);

CREATE INDEX idx_order_items_order ON order_items(order_id);
CREATE INDEX idx_order_items_variant_order ON order_items(variant_id, order_id);

/* =========================
   PAYMENTS
   ========================= */
CREATE TABLE payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  provider        TEXT,
  status          TEXT NOT NULL, -- was enum, now TEXT
  amount          NUMERIC(12,2) NOT NULL,
  currency        CHAR(3) NOT NULL,
  transaction_id  TEXT UNIQUE,
  idempotency_key TEXT UNIQUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_payments_order ON payments(order_id);
CREATE UNIQUE INDEX uniq_payments_txid ON payments(transaction_id);
CREATE UNIQUE INDEX uniq_payments_idemp ON payments(idempotency_key);

CREATE TRIGGER trg_payments_updated_at
BEFORE UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* =========================
   SHIPMENTS
   ========================= */
CREATE TABLE shipments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        UUID NOT NULL REFERENCES orders(id) ON UPDATE CASCADE ON DELETE RESTRICT,
  status          TEXT NOT NULL DEFAULT 'READY', -- was enum, now TEXT
  courier         TEXT,
  tracking_number TEXT,
  shipped_at      TIMESTAMPTZ
);

CREATE INDEX idx_shipments_order ON shipments(order_id);
CREATE INDEX idx_shipments_tracking ON shipments(tracking_number);

/* =========================
   IDEMPOTENCY KEYS (no FKs by design)
   ========================= */
CREATE TABLE idempotency_keys (
  key          TEXT PRIMARY KEY,
  scope        TEXT NOT NULL,       -- e.g., 'ORDER_CREATE','PAYMENT_CAPTURE'
  request_hash TEXT NOT NULL,
  response     JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_idem_created ON idempotency_keys(created_at);
-- Optional helper to trace without hard FK
-- ALTER TABLE idempotency_keys ADD COLUMN target_type TEXT, ADD COLUMN target_id UUID;
-- CREATE INDEX idx_idem_target ON idempotency_keys(target_type, target_id);

-- Late FK: inventory_movements.order_id → orders.id (placed here so orders exists)
ALTER TABLE inventory_movements
  ADD CONSTRAINT fk_inv_mov_orders FOREIGN KEY (order_id) REFERENCES orders(id)
  ON UPDATE CASCADE ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED;

COMMIT;
