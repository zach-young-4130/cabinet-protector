import 'dotenv/config';
import { buildServer } from './server.js';

const server = buildServer();
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

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log('\nAll smoke checks passed');
