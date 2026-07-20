import 'dotenv/config';
import { buildServer } from './server.js';
import { pool } from './db.js';

// Keep PASS/FAIL output readable — override with LOG_LEVEL=info (etc.) for
// verbose per-request logs while debugging a failing smoke run.
process.env.LOG_LEVEL ??= 'silent';

const server = await buildServer();
await server.initialize();

let failures = 0;

async function check(name, options, expectedStatus, assert) {
  const res = await server.inject(options);
  const payload = res.payload ? JSON.parse(res.payload) : null;
  let ok = res.statusCode === expectedStatus;
  let detail = `status ${res.statusCode}`;
  if (ok && assert) {
    const message = assert(payload);
    if (message) {
      ok = false;
      detail = message;
    }
  }
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} (${detail})`);
  if (!ok) {
    failures++;
  }
  return payload;
}

await check('health', { method: 'GET', url: '/api/health' }, 200,
  p => p.status === 'ok' ? null : 'unexpected payload');

await check('list products', { method: 'GET', url: '/api/products' }, 200,
  p => p.length === 2 ? null : `expected 2 products, got ${p.length}`);

await check('get product', { method: 'GET', url: '/api/products/1' }, 200,
  p => p.name.includes('Standard Protect') ? null : 'wrong product');

await check('missing product 404', { method: 'GET', url: '/api/products/999' }, 404);

await check('stock colors', { method: 'GET', url: '/api/stock-colors' }, 200,
  p => p.length === 6 ? null : `expected 6 colors, got ${p.length}`);

// Line-item validation runs before /api/checkout/session ever calls Stripe,
// so these are safe to run without STRIPE_SECRET_KEY configured.

await check('reject unknown paint brand', {
  method: 'POST',
  url: '/api/checkout/session',
  payload: {
    items: [{
      productId: '1',
      quantity: 1,
      size: { kind: 'standard', sizeId: 's1' },
      finish: { kind: 'paint-match', paintBrand: 'valspar', paintCode: 'X123' }
    }]
  }
}, 400);

await check('reject garbage paint code', {
  method: 'POST',
  url: '/api/checkout/session',
  payload: {
    items: [{
      productId: '1',
      quantity: 1,
      size: { kind: 'standard', sizeId: 's1' },
      finish: { kind: 'paint-match', paintBrand: 'sherwin-williams', paintCode: '<script>' }
    }]
  }
}, 400);

await check('reject out-of-range custom height', {
  method: 'POST',
  url: '/api/checkout/session',
  payload: {
    items: [{
      productId: '1',
      quantity: 1,
      size: { kind: 'custom', widthInches: 30, heightInches: 40 },
      finish: { kind: 'primed' }
    }]
  }
}, 400);

await check('reject unknown standard size for product', {
  method: 'POST',
  url: '/api/checkout/session',
  payload: {
    items: [{
      productId: '2',
      quantity: 1,
      size: { kind: 'standard', sizeId: 's1' },
      finish: { kind: 'primed' }
    }]
  }
}, 400);

await check('reject unknown product', {
  method: 'POST',
  url: '/api/checkout/session',
  payload: {
    items: [{
      productId: '999',
      quantity: 1,
      size: { kind: 'standard', sizeId: 's1' },
      finish: { kind: 'primed' }
    }]
  }
}, 400);

await check('checkout session rejects empty cart', {
  method: 'POST',
  url: '/api/checkout/session',
  payload: { items: [] }
}, 400);

await check('confirm malformed order id rejected', {
  method: 'POST',
  url: '/api/checkout/does-not-exist/confirm'
}, 400);

await check('confirm unknown (but well-formed) order id 404', {
  method: 'POST',
  url: '/api/checkout/00000000-0000-0000-0000-000000000000/confirm'
}, 404);

// --- Auth & orders ---------------------------------------------------------
// Each run signs up a fresh throwaway customer (unique email), mirroring how
// the order checks leave pending orders behind.

const email = `smoke+${Date.now()}@example.com`;
const password = 'smoke-test-password';

await check('signup rejects weak password', {
  method: 'POST',
  url: '/api/auth/signup',
  payload: { fullName: 'Smoke Tester', email, password: 'short' }
}, 400);

const signup = await check('signup', {
  method: 'POST',
  url: '/api/auth/signup',
  payload: { fullName: 'Smoke Tester', email, password }
}, 201, p => {
  if (!p.token) return 'missing token';
  if (p.user?.email !== email) return `wrong email: ${p.user?.email}`;
  if (p.user?.emailVerified !== false) return 'expected emailVerified false';
  if (p.user?.hasPassword !== true) return 'expected hasPassword true';
  if (p.user?.passwordHash || p.user?.password_hash) return 'password hash leaked';
  return null;
});

await check('duplicate signup 409', {
  method: 'POST',
  url: '/api/auth/signup',
  payload: { fullName: 'Smoke Tester', email, password }
}, 409);

await check('login with wrong password 401', {
  method: 'POST',
  url: '/api/auth/login',
  payload: { email, password: 'wrong-password' }
}, 401);

const login = await check('login', {
  method: 'POST',
  url: '/api/auth/login',
  payload: { email, password }
}, 200, p => (p.token && p.user?.email === email ? null : 'missing token or wrong user'));

const authHeaders = { authorization: `Bearer ${login?.token}` };

await check('me without token 401', { method: 'GET', url: '/api/auth/me' }, 401);

await check('me', { method: 'GET', url: '/api/auth/me', headers: authHeaders }, 200,
  p => (p.user?.email === email ? null : 'wrong user'));

await check('set password when one exists 409', {
  method: 'POST',
  url: '/api/auth/password',
  headers: authHeaders,
  payload: { password: 'another-password' }
}, 409);

await check('orders without token 401', { method: 'GET', url: '/api/orders' }, 401);

await check('orders list (empty for new customer)', {
  method: 'GET', url: '/api/orders', headers: authHeaders
}, 200, p => (Array.isArray(p) && p.length === 0 ? null : `expected [], got ${JSON.stringify(p)}`));

await check('order detail not owned 404', {
  method: 'GET',
  url: '/api/orders/00000000-0000-0000-0000-000000000000',
  headers: authHeaders
}, 404);

await check('verify-email with bogus token 400', {
  method: 'POST',
  url: '/api/auth/verify-email',
  payload: { token: 'not-a-real-token' }
}, 400);

await check('logout', {
  method: 'POST', url: '/api/auth/logout', headers: { authorization: `Bearer ${signup?.token}` }
}, 204);

await check('me after logout 401', {
  method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${signup?.token}` }
}, 401);

// --- Admin -----------------------------------------------------------------
// The smoke user is promoted via SQL mid-run — the only way admin is granted.

await check('admin orders anon 401', { method: 'GET', url: '/api/admin/orders' }, 401);

await check('admin orders non-admin 403', {
  method: 'GET', url: '/api/admin/orders', headers: authHeaders
}, 403);

await pool.query('UPDATE customers SET is_admin = true WHERE email = $1', [email]);

await check('admin orders list', {
  method: 'GET', url: '/api/admin/orders', headers: authHeaders
}, 200, p => (Array.isArray(p) ? null : 'expected an array'));

await check('admin orders bad status filter 400', {
  method: 'GET', url: '/api/admin/orders?status=nope', headers: authHeaders
}, 400);

await check('admin users list includes smoke user', {
  method: 'GET', url: '/api/admin/users', headers: authHeaders
}, 200, p => (p.some(u => u.email === email) ? null : 'smoke user missing'));

await check('admin refund unknown order 404', {
  method: 'POST',
  url: '/api/admin/orders/00000000-0000-0000-0000-000000000000/refund',
  headers: authHeaders
}, 404);

await check('admin cannot ban self', {
  method: 'PATCH',
  url: `/api/admin/users/${login?.user?.id}/ban`,
  headers: authHeaders,
  payload: { banned: true }
}, 400);

const email2 = `smoke2+${Date.now()}@example.com`;
const second = await check('second signup (ban target)', {
  method: 'POST',
  url: '/api/auth/signup',
  payload: { fullName: 'Ban Target', email: email2, password }
}, 201, p => (p.user?.id ? null : 'missing user id'));

if (second?.user?.id) {
  await check('ban second user', {
    method: 'PATCH',
    url: `/api/admin/users/${second.user.id}/ban`,
    headers: authHeaders,
    payload: { banned: true }
  }, 200, p => (p.user?.isBanned === true ? null : 'expected isBanned true'));

  await check('banned session dies immediately', {
    method: 'GET', url: '/api/auth/me', headers: { authorization: `Bearer ${second.token}` }
  }, 401);

  await check('banned login rejected', {
    method: 'POST', url: '/api/auth/login', payload: { email: email2, password }
  }, 403);

  await check('unban second user', {
    method: 'PATCH',
    url: `/api/admin/users/${second.user.id}/ban`,
    headers: authHeaders,
    payload: { banned: false }
  }, 200, p => (p.user?.isBanned === false ? null : 'expected isBanned false'));

  await check('change second user email', {
    method: 'PATCH',
    url: `/api/admin/users/${second.user.id}/email`,
    headers: authHeaders,
    payload: { email: `changed-${email2}` }
  }, 200, p => (
    p.user?.email === `changed-${email2}` && p.user?.emailVerified === false
      ? null
      : 'email not updated or still verified'
  ));

  await check('change email conflict 409', {
    method: 'PATCH',
    url: `/api/admin/users/${second.user.id}/email`,
    headers: authHeaders,
    payload: { email }
  }, 409);

  await check('send password reset link', {
    method: 'POST',
    url: `/api/admin/users/${second.user.id}/password-reset`,
    headers: authHeaders
  }, 204);

  await check('delete second user', {
    method: 'DELETE',
    url: `/api/admin/users/${second.user.id}`,
    headers: authHeaders
  }, 204);

  await check('deleted user gone from list', {
    method: 'GET', url: '/api/admin/users', headers: authHeaders
  }, 200, p => (p.some(u => u.id === second.user.id) ? 'user still present' : null));
}

await check('reset-password with bogus token 400', {
  method: 'POST',
  url: '/api/auth/reset-password',
  payload: { token: 'bogus', password: 'brand-new-password' }
}, 400);

const colorName = `Smoke Teal ${Date.now()}`;
const color = await check('create stock color', {
  method: 'POST',
  url: '/api/admin/stock-colors',
  headers: authHeaders,
  payload: { name: colorName, hex: '#118899', brand: 'sherwin-williams' }
}, 201, p => (p.id && p.brand === 'sherwin-williams' ? null : 'missing id or brand'));

await check('reject invalid hex', {
  method: 'POST',
  url: '/api/admin/stock-colors',
  headers: authHeaders,
  payload: { name: 'Bad Color', hex: 'teal', brand: 'sherwin-williams' }
}, 400);

await check('reject unknown brand', {
  method: 'POST',
  url: '/api/admin/stock-colors',
  headers: authHeaders,
  payload: { name: 'Bad Brand Color', hex: '#118899', brand: 'valspar' }
}, 400);

if (color?.id) {
  await check('update stock color', {
    method: 'PATCH',
    url: `/api/admin/stock-colors/${color.id}`,
    headers: authHeaders,
    payload: { hex: '#22aabb', brand: 'behr' }
  }, 200, p => (p.hex === '#22aabb' && p.brand === 'behr' ? null : 'hex or brand not updated'));

  await check('public stock colors includes new color', {
    method: 'GET', url: '/api/stock-colors'
  }, 200, p => (p.some(c => c.id === color.id) ? null : 'new color missing'));

  await check('delete stock color', {
    method: 'DELETE',
    url: `/api/admin/stock-colors/${color.id}`,
    headers: authHeaders
  }, 204);
}

// Leave the throwaway user unprivileged in case the database is reused.
await pool.query('UPDATE customers SET is_admin = false WHERE email = $1', [email]);

if (process.env.STRIPE_SECRET_KEY) {
  console.log('\nSTRIPE_SECRET_KEY set — running live Stripe Checkout Session checks...');

  const standardItems = [
    {
      productId: '1',
      quantity: 2,
      size: { kind: 'standard', sizeId: 's1' },
      finish: { kind: 'stock', colorId: 'sagebrush' }
    },
    {
      productId: '2',
      quantity: 1,
      size: { kind: 'custom', widthInches: 33.5, heightInches: 6 },
      finish: { kind: 'paint-match', paintBrand: 'sherwin-williams', paintCode: 'SW 7008' }
    }
  ];

  const session = await check('create checkout session (standard + stock, custom + SW paint match)', {
    method: 'POST',
    url: '/api/checkout/session',
    payload: { items: standardItems }
  }, 201, p => {
    // 2 × $45 + 1 × ($38 + $15 paint match) = $143
    if (p.total !== 143) return `expected total 143, got ${p.total}`;
    if (!p.clientSecret) return 'missing clientSecret';
    if (!p.orderId) return 'missing orderId';
    return null;
  });

  if (session?.orderId) {
    await check('confirm before payment rejected', {
      method: 'POST',
      url: `/api/checkout/${session.orderId}/confirm`
    }, 409);
  }
} else {
  console.log('\nSTRIPE_SECRET_KEY not set — skipping live Stripe Checkout Session checks.');
}

await server.stop();
await pool.end();

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');
