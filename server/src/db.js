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

export async function insertOrder(order) {
  const { rows } = await pool.query(
    `INSERT INTO orders (id, customer, lines, total)
     VALUES ($1, $2, $3, $4)
     RETURNING created_at AS "createdAt"`,
    [order.id, JSON.stringify(order.customer), JSON.stringify(order.lines), order.total]
  );
  return { ...order, createdAt: rows[0].createdAt };
}
