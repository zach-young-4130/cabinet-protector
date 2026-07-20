import pg from 'pg';

const { Pool } = pg;

// Connection: DATABASE_URL wins; POSTGRES_URL (the pooled Supavisor URL the
// Supabase↔Vercel integration injects) is next — transaction-mode pooling is
// what serverless runtime traffic should use; otherwise standard PG* env vars
// apply, defaulting to the local "protect_vinyl" database.
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
export const pool = new Pool(
  connectionString
    ? { connectionString }
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
  const { rows } = await pool.query('SELECT id, name, hex, brand FROM stock_colors ORDER BY sort_order');
  return rows;
}

export async function getStockColor(id) {
  const { rows } = await pool.query('SELECT id, name, hex, brand FROM stock_colors WHERE id = $1', [id]);
  return rows[0] ?? null;
}

const ORDER_SELECT = `
  id, customer, lines,
  subtotal::float AS subtotal,
  coupon_code AS "couponCode",
  discount_amount::float AS "discountAmount",
  total::float AS total,
  refund_amount::float AS "refundAmount",
  status,
  customer_id AS "customerId",
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

const CUSTOMER_SELECT = `
  id, email, full_name AS "fullName", phone,
  email_verified AS "emailVerified",
  (password_hash IS NOT NULL) AS "hasPassword",
  is_admin AS "isAdmin",
  is_banned AS "isBanned",
  created_at AS "createdAt"
`;

// Emails are stored and compared lowercased.
export async function insertCustomer({ id, email, fullName, phone, passwordHash }) {
  const { rows } = await pool.query(
    `INSERT INTO customers (id, email, full_name, phone, password_hash)
     VALUES ($1, lower($2), $3, $4, $5)
     RETURNING ${CUSTOMER_SELECT}`,
    [id, email, fullName ?? '', phone ?? '', passwordHash ?? null]
  );
  return rows[0];
}

export async function getCustomerByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${CUSTOMER_SELECT} FROM customers WHERE email = lower($1)`,
    [email]
  );
  return rows[0] ?? null;
}

// Login lookup — the only query that exposes the password hash.
export async function getCustomerAuthByEmail(email) {
  const { rows } = await pool.query(
    `SELECT ${CUSTOMER_SELECT}, password_hash AS "passwordHash"
     FROM customers WHERE email = lower($1)`,
    [email]
  );
  return rows[0] ?? null;
}

// Set-only: refuses to overwrite an existing password (that path would need
// the current password or an email-based reset, neither of which exists yet).
export async function setCustomerPassword(id, passwordHash) {
  const { rows } = await pool.query(
    `UPDATE customers SET password_hash = $2
     WHERE id = $1 AND password_hash IS NULL
     RETURNING ${CUSTOMER_SELECT}`,
    [id, passwordHash]
  );
  return rows[0] ?? null;
}

export async function markCustomerVerified(id) {
  const { rows } = await pool.query(
    `UPDATE customers SET email_verified = true WHERE id = $1 RETURNING ${CUSTOMER_SELECT}`,
    [id]
  );
  return rows[0] ?? null;
}

export async function insertSession(tokenHash, customerId, expiresAt) {
  await pool.query(
    'INSERT INTO sessions (token_hash, customer_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, customerId, expiresAt]
  );
}

// Banned customers resolve to no session — existing tokens die instantly.
export async function getCustomerBySession(tokenHash) {
  const { rows } = await pool.query(
    `SELECT c.id, c.email, c.full_name AS "fullName", c.phone,
            c.email_verified AS "emailVerified",
            (c.password_hash IS NOT NULL) AS "hasPassword",
            c.is_admin AS "isAdmin",
            c.is_banned AS "isBanned",
            c.created_at AS "createdAt"
     FROM sessions s JOIN customers c ON c.id = s.customer_id
     WHERE s.token_hash = $1 AND s.expires_at > now() AND c.is_banned = false`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function deleteSession(tokenHash) {
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [tokenHash]);
}

export async function insertEmailVerification(tokenHash, customerId, expiresAt) {
  await pool.query(
    'INSERT INTO email_verifications (token_hash, customer_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, customerId, expiresAt]
  );
}

// Single-use: the row is deleted as it is read.
export async function consumeEmailVerification(tokenHash) {
  const { rows } = await pool.query(
    `DELETE FROM email_verifications
     WHERE token_hash = $1 AND expires_at > now()
     RETURNING customer_id AS "customerId"`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function setOrderCustomer(orderId, customerId) {
  await pool.query('UPDATE orders SET customer_id = $2 WHERE id = $1', [orderId, customerId]);
}

// Attaches unowned guest orders matching the customer's email. Only called
// after email verification — see the ownership note in docs/implementation-plan.md.
export async function claimOrdersForCustomer(customerId, email) {
  await pool.query(
    `UPDATE orders SET customer_id = $1
     WHERE customer_id IS NULL AND lower(customer->>'email') = lower($2)`,
    [customerId, email]
  );
}

export async function getOrdersForCustomer(customerId) {
  const { rows } = await pool.query(
    `SELECT ${ORDER_SELECT} FROM orders WHERE customer_id = $1 ORDER BY created_at DESC`,
    [customerId]
  );
  return rows;
}

export async function getCustomerOrder(id, customerId) {
  const { rows } = await pool.query(
    `SELECT ${ORDER_SELECT} FROM orders WHERE id = $1 AND customer_id = $2`,
    [id, customerId]
  );
  return rows[0] ?? null;
}

// --- Admin ------------------------------------------------------------------

export async function getAllCustomers() {
  const { rows } = await pool.query(
    `SELECT ${CUSTOMER_SELECT} FROM customers ORDER BY created_at DESC`
  );
  return rows;
}

export async function setCustomerBanned(id, banned) {
  const { rows } = await pool.query(
    `UPDATE customers SET is_banned = $2 WHERE id = $1 RETURNING ${CUSTOMER_SELECT}`,
    [id, banned]
  );
  return rows[0] ?? null;
}

// Orders survive with customer_id nulled (FK ON DELETE SET NULL);
// sessions, verifications, and resets cascade away.
export async function deleteCustomer(id) {
  const { rowCount } = await pool.query('DELETE FROM customers WHERE id = $1', [id]);
  return rowCount > 0;
}

export async function updateCustomerEmail(id, email) {
  const { rows } = await pool.query(
    `UPDATE customers SET email = lower($2), email_verified = false
     WHERE id = $1 RETURNING ${CUSTOMER_SELECT}`,
    [id, email]
  );
  return rows[0] ?? null;
}

// Unlike setCustomerPassword, this overwrites — the reset token proved
// mailbox ownership.
export async function resetCustomerPassword(id, passwordHash) {
  const { rows } = await pool.query(
    `UPDATE customers SET password_hash = $2 WHERE id = $1 RETURNING ${CUSTOMER_SELECT}`,
    [id, passwordHash]
  );
  return rows[0] ?? null;
}

export async function getCustomerById(id) {
  const { rows } = await pool.query(
    `SELECT ${CUSTOMER_SELECT} FROM customers WHERE id = $1`,
    [id]
  );
  return rows[0] ?? null;
}

export async function deleteSessionsForCustomer(customerId) {
  await pool.query('DELETE FROM sessions WHERE customer_id = $1', [customerId]);
}

export async function insertPasswordReset(tokenHash, customerId, expiresAt) {
  await pool.query(
    'INSERT INTO password_resets (token_hash, customer_id, expires_at) VALUES ($1, $2, $3)',
    [tokenHash, customerId, expiresAt]
  );
}

export async function consumePasswordReset(tokenHash) {
  const { rows } = await pool.query(
    `DELETE FROM password_resets
     WHERE token_hash = $1 AND expires_at > now()
     RETURNING customer_id AS "customerId"`,
    [tokenHash]
  );
  return rows[0] ?? null;
}

export async function getAllOrders(status) {
  const { rows } = status
    ? await pool.query(
        `SELECT ${ORDER_SELECT} FROM orders WHERE status = $1 ORDER BY created_at DESC`,
        [status]
      )
    : await pool.query(`SELECT ${ORDER_SELECT} FROM orders ORDER BY created_at DESC`);
  return rows;
}

// Refunds accumulate and are capped at the total in SQL — a concurrent or
// over-large refund returns null instead of over-refunding.
export async function addOrderRefund(id, amount) {
  const { rows } = await pool.query(
    `UPDATE orders SET refund_amount = refund_amount + $2
     WHERE id = $1 AND refund_amount + $2 <= total
     RETURNING ${ORDER_SELECT}`,
    [id, amount]
  );
  return rows[0] ?? null;
}

// Transition guard lives in SQL: only succeeds from an allowed current status.
export async function setOrderStatus(id, status, allowedFrom) {
  const { rows } = await pool.query(
    `UPDATE orders SET status = $2
     WHERE id = $1 AND status = ANY($3)
     RETURNING ${ORDER_SELECT}`,
    [id, status, allowedFrom]
  );
  return rows[0] ?? null;
}

export async function updateOrderShippingAddress(id, address) {
  const { rows } = await pool.query(
    `UPDATE orders SET customer = jsonb_set(customer, '{address}', to_jsonb($2::text))
     WHERE id = $1 RETURNING ${ORDER_SELECT}`,
    [id, address]
  );
  return rows[0] ?? null;
}

export async function insertStockColor({ id, name, hex, brand }) {
  const { rows } = await pool.query(
    `INSERT INTO stock_colors (id, name, hex, brand, sort_order)
     VALUES ($1, $2, $3, $4, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM stock_colors))
     RETURNING id, name, hex, brand`,
    [id, name, hex, brand]
  );
  return rows[0];
}

export async function updateStockColor(id, { name, hex, brand }) {
  const { rows } = await pool.query(
    `UPDATE stock_colors SET
       name = COALESCE($2, name),
       hex = COALESCE($3, hex),
       brand = COALESCE($4, brand)
     WHERE id = $1 RETURNING id, name, hex, brand`,
    [id, name ?? null, hex ?? null, brand ?? null]
  );
  return rows[0] ?? null;
}

export async function deleteStockColor(id) {
  const { rowCount } = await pool.query('DELETE FROM stock_colors WHERE id = $1', [id]);
  return rowCount > 0;
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
