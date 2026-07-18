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

const customer = {
  fullName: 'Test Person',
  email: 'test@example.com',
  address: '1 Main St, Columbus OH',
  phoneNumber: '+1 555 000 0000'
};

await check('create order (standard + stock, custom + paint match)', {
  method: 'POST',
  url: '/api/orders',
  payload: {
    customer,
    items: [
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
        finish: { kind: 'paint-match', paintCode: 'SW 7008' }
      }
    ]
  }
}, 201, p => {
  // 2 × $45 + 1 × ($38 + $15 paint match) = $143
  if (p.total !== 143) return `expected total 143, got ${p.total}`;
  if (p.lines[1].finish.label !== 'Paint match — SW 7008') return `bad finish label: ${p.lines[1].finish.label}`;
  if (p.lines[1].size.label !== 'Custom — 33.5" × 6"') return `bad size label: ${p.lines[1].size.label}`;
  return null;
});

await check('reject bad SW code', {
  method: 'POST',
  url: '/api/orders',
  payload: {
    customer,
    items: [{
      productId: '1',
      quantity: 1,
      size: { kind: 'standard', sizeId: 's1' },
      finish: { kind: 'paint-match', paintCode: 'BM OC-17' }
    }]
  }
}, 400);

await check('reject out-of-range custom height', {
  method: 'POST',
  url: '/api/orders',
  payload: {
    customer,
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
  url: '/api/orders',
  payload: {
    customer,
    items: [{
      productId: '2',
      quantity: 1,
      size: { kind: 'standard', sizeId: 's1' },
      finish: { kind: 'primed' }
    }]
  }
}, 400);

await server.stop();

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log('All smoke checks passed');
