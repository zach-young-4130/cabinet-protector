import 'dotenv/config';
import { pool } from './db.js';
import { products, stockColors } from './data.js';

await pool.query(`
  CREATE TABLE IF NOT EXISTS products (
    id text PRIMARY KEY,
    name text NOT NULL,
    description text NOT NULL,
    price numeric(10,2) NOT NULL,
    thickness_mils integer NOT NULL DEFAULT 20,
    is_paintable boolean NOT NULL DEFAULT true,
    is_removable boolean NOT NULL DEFAULT true,
    is_cuttable boolean NOT NULL DEFAULT true
  );

  ALTER TABLE products
    ADD COLUMN IF NOT EXISTS thickness_mils integer NOT NULL DEFAULT 20;

  CREATE TABLE IF NOT EXISTS product_sizes (
    id text PRIMARY KEY,
    product_id text NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    label text NOT NULL,
    width_inches numeric(6,4) NOT NULL,
    height_inches numeric(6,4) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS stock_colors (
    id text PRIMARY KEY,
    name text NOT NULL,
    hex text NOT NULL,
    brand text NOT NULL DEFAULT 'sherwin-williams',
    sort_order integer NOT NULL DEFAULT 0
  );

  ALTER TABLE stock_colors ADD COLUMN IF NOT EXISTS brand text NOT NULL DEFAULT 'sherwin-williams';

  CREATE TABLE IF NOT EXISTS orders (
    id uuid PRIMARY KEY,
    created_at timestamptz NOT NULL DEFAULT now(),
    customer jsonb NOT NULL,
    lines jsonb NOT NULL,
    subtotal numeric(10,2) NOT NULL DEFAULT 0,
    coupon_code text,
    discount_amount numeric(10,2) NOT NULL DEFAULT 0,
    total numeric(10,2) NOT NULL,
    status text NOT NULL DEFAULT 'pending',
    stripe_payment_intent_id text
  );

  ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal numeric(10,2) NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount numeric(10,2) NOT NULL DEFAULT 0;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending';
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS stripe_checkout_session_id text;

  CREATE TABLE IF NOT EXISTS customers (
    id uuid PRIMARY KEY,
    email text NOT NULL UNIQUE,
    full_name text NOT NULL DEFAULT '',
    phone text NOT NULL DEFAULT '',
    password_hash text,
    email_verified boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash text PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );

  CREATE TABLE IF NOT EXISTS email_verifications (
    token_hash text PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );

  ALTER TABLE orders ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id);

  ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;
  ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_banned boolean NOT NULL DEFAULT false;
  ALTER TABLE orders ADD COLUMN IF NOT EXISTS refund_amount numeric(10,2) NOT NULL DEFAULT 0;

  CREATE TABLE IF NOT EXISTS password_resets (
    token_hash text PRIMARY KEY,
    customer_id uuid NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    expires_at timestamptz NOT NULL
  );

  -- Deleting a customer keeps their orders for financial records, unlinked.
  ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_customer_id_fkey;
  ALTER TABLE orders ADD CONSTRAINT orders_customer_id_fkey
    FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL;

  -- Supabase exposes the public schema through its auto-generated REST API
  -- (PostgREST) using the shareable anon key. This app only ever talks to
  -- Postgres directly from its own server, so that surface is pure liability:
  -- enable RLS on every table (with no policies, non-owner roles get nothing;
  -- the server connects as the table owner, which bypasses RLS, so app
  -- queries are unaffected) and drop the API roles' grants outright. The DO
  -- block makes this a no-op on local Postgres, where Supabase's roles
  -- don't exist.
  ALTER TABLE products ENABLE ROW LEVEL SECURITY;
  ALTER TABLE product_sizes ENABLE ROW LEVEL SECURITY;
  ALTER TABLE stock_colors ENABLE ROW LEVEL SECURITY;
  ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
  ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
  ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
  ALTER TABLE email_verifications ENABLE ROW LEVEL SECURITY;
  ALTER TABLE password_resets ENABLE ROW LEVEL SECURITY;

  DO $$
  BEGIN
    IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon, authenticated;
    END IF;
  END $$;
`);

for (const product of products) {
  await pool.query(
    `INSERT INTO products (id, name, description, price, thickness_mils, is_paintable, is_removable, is_cuttable)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       price = EXCLUDED.price,
       thickness_mils = EXCLUDED.thickness_mils,
       is_paintable = EXCLUDED.is_paintable,
       is_removable = EXCLUDED.is_removable,
       is_cuttable = EXCLUDED.is_cuttable`,
    [product.id, product.name, product.description, product.price, product.thicknessMils,
     product.isPaintable, product.isRemovable, product.isCuttable]
  );

  for (const [index, size] of product.availableSizes.entries()) {
    await pool.query(
      `INSERT INTO product_sizes (id, product_id, label, width_inches, height_inches, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         product_id = EXCLUDED.product_id,
         label = EXCLUDED.label,
         width_inches = EXCLUDED.width_inches,
         height_inches = EXCLUDED.height_inches,
         sort_order = EXCLUDED.sort_order`,
      [size.id, product.id, size.label, size.widthInches, size.heightInches, index]
    );
  }
}

for (const [index, color] of stockColors.entries()) {
  await pool.query(
    `INSERT INTO stock_colors (id, name, hex, brand, sort_order)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (id) DO UPDATE SET
       name = EXCLUDED.name,
       hex = EXCLUDED.hex,
       brand = EXCLUDED.brand,
       sort_order = EXCLUDED.sort_order`,
    [color.id, color.name, color.hex, color.brand, index]
  );
}

const counts = await pool.query(`
  SELECT
    (SELECT count(*) FROM products) AS products,
    (SELECT count(*) FROM product_sizes) AS sizes,
    (SELECT count(*) FROM stock_colors) AS colors
`);
console.log('Database ready:', counts.rows[0]);

await pool.end();
