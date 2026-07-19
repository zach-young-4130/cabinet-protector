import pg from 'pg';

const { Pool } = pg;

// Connection: DATABASE_URL wins; otherwise standard PG* env vars apply,
// defaulting to the local "protect_vinyl" database.
export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : { database: process.env.PGDATABASE || 'protect_vinyl' }
);

const PRODUCT_SELECT = `
  SELECT p.id, p.name, p.description, p.price::float AS price,
         p.thickness_mils AS "thicknessMils",
         p.is_paintable AS "isPaintable",
         p.is_removable AS "isRemovable",
         p.is_cuttable AS "isCuttable",
         COALESCE(
           json_agg(
             json_build_object(
               'id', s.id,
               'label', s.label,
               'widthInches', s.width_inches::float,
               'heightInches', s.height_inches::float
             ) ORDER BY s.sort_order
           ) FILTER (WHERE s.id IS NOT NULL),
           '[]'
         ) AS "availableSizes"
  FROM products p
  LEFT JOIN product_sizes s ON s.product_id = p.id
`;

export async function getProducts() {
  const { rows } = await pool.query(`${PRODUCT_SELECT} GROUP BY p.id ORDER BY p.id`);
  return rows;
}

export async function getProduct(id) {
  const { rows } = await pool.query(`${PRODUCT_SELECT} WHERE p.id = $1 GROUP BY p.id`, [id]);
  return rows[0] ?? null;
}

export async function getStockColors() {
  const { rows } = await pool.query('SELECT id, name, hex FROM stock_colors ORDER BY sort_order');
  return rows;
}

export async function getStockColor(id) {
  const { rows } = await pool.query('SELECT id, name, hex FROM stock_colors WHERE id = $1', [id]);
  return rows[0] ?? null;
}

const ORDER_SELECT = `
  id, customer, lines,
  subtotal::float AS subtotal,
  coupon_code AS "couponCode",
  discount_amount::float AS "discountAmount",
  total::float AS total,
  status,
  stripe_payment_intent_id AS "stripePaymentIntentId",
  stripe_checkout_session_id AS "stripeCheckoutSessionId",
  created_at AS "createdAt"
`;

// Orders start as 'pending' when a Checkout Session is created, and flip to
// 'paid' only after Stripe reports the session as paid (see finalizePaidOrder).
export async function insertOrder(order) {
  const { rows } = await pool.query(
    `INSERT INTO orders (
       id, customer, lines, subtotal, coupon_code, discount_amount, total,
       status, stripe_payment_intent_id, stripe_checkout_session_id
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     RETURNING ${ORDER_SELECT}`,
    [
      order.id,
      JSON.stringify(order.customer),
      JSON.stringify(order.lines),
      order.subtotal,
      order.couponCode ?? null,
      order.discountAmount ?? 0,
      order.total,
      order.status ?? 'pending',
      order.stripePaymentIntentId ?? null,
      order.stripeCheckoutSessionId ?? null
    ]
  );
  return rows[0];
}

export async function getOrder(id) {
  const { rows } = await pool.query(`SELECT ${ORDER_SELECT} FROM orders WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

// Copies Stripe-collected customer/discount totals onto the order and marks it
// paid. Returns null if the order was missing or already resolved.
export async function finalizePaidOrder(id, updates) {
  const { rows } = await pool.query(
    `UPDATE orders SET
       status = 'paid',
       customer = $2,
       coupon_code = $3,
       discount_amount = $4,
       total = $5,
       stripe_payment_intent_id = COALESCE($6, stripe_payment_intent_id)
     WHERE id = $1 AND status = 'pending'
     RETURNING ${ORDER_SELECT}`,
    [
      id,
      JSON.stringify(updates.customer),
      updates.couponCode ?? null,
      updates.discountAmount ?? 0,
      updates.total,
      updates.stripePaymentIntentId ?? null
    ]
  );
  return rows[0] ?? null;
}
