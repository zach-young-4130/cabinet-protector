import Hapi from '@hapi/hapi';
import Joi from 'joi';
import { randomUUID } from 'node:crypto';
import {
  PAINT_MATCH_FEE,
  WIDTH_RANGE,
  HEIGHT_RANGE,
  PAINT_BRANDS
} from './data.js';
import {
  pool,
  getProducts,
  getProduct,
  getStockColors,
  getStockColor,
  insertOrder,
  getOrder,
  finalizePaidOrder
} from './db.js';
import {
  createCheckoutSession,
  retrieveCheckoutSession,
  customerFromCheckoutSession,
  discountFromCheckoutSession
} from './stripe.js';

class OrderValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'OrderValidationError';
  }
}

const sizeSchema = Joi.alternatives().try(
  Joi.object({
    kind: Joi.string().valid('standard').required(),
    sizeId: Joi.string().required()
  }),
  Joi.object({
    kind: Joi.string().valid('custom').required(),
    widthInches: Joi.number().min(WIDTH_RANGE.min).max(WIDTH_RANGE.max).required(),
    heightInches: Joi.number().min(HEIGHT_RANGE.min).max(HEIGHT_RANGE.max).required()
  })
);

const finishSchema = Joi.alternatives().try(
  Joi.object({
    kind: Joi.string().valid('primed').required()
  }),
  Joi.object({
    kind: Joi.string().valid('stock').required(),
    colorId: Joi.string().required()
  }),
  Joi.object({
    kind: Joi.string().valid('paint-match').required(),
    paintBrand: Joi.string().valid(...Object.keys(PAINT_BRANDS)).required(),
    paintCode: Joi.string().trim().min(2).max(24).pattern(/^[A-Za-z0-9\s-]+$/).required()
  })
);

const itemsSchema = Joi.array().items(
  Joi.object({
    productId: Joi.string().required(),
    quantity: Joi.number().integer().min(1).max(500).required(),
    size: sizeSchema.required(),
    finish: finishSchema.required()
  })
).min(1).required();

// Customer details are collected by Stripe Elements (Contact + Address), so the
// session create payload only needs the cart lines.
const checkoutSessionSchema = Joi.object({
  items: itemsSchema
});

function resolveSize(product, size) {
  if (size.kind === 'standard') {
    const standard = product.availableSizes.find(s => s.id === size.sizeId);
    if (!standard) {
      return null;
    }
    return {
      kind: 'standard',
      label: standard.label,
      widthInches: standard.widthInches,
      heightInches: standard.heightInches
    };
  }
  return {
    kind: 'custom',
    label: `Custom — ${size.widthInches}" × ${size.heightInches}"`,
    widthInches: size.widthInches,
    heightInches: size.heightInches
  };
}

async function resolveFinish(finish) {
  if (finish.kind === 'primed') {
    return { kind: 'primed', label: 'Primed white (paint-ready)', surcharge: 0 };
  }
  if (finish.kind === 'stock') {
    const color = await getStockColor(finish.colorId);
    if (!color) {
      return null;
    }
    return { kind: 'stock', label: color.name, colorId: color.id, surcharge: 0 };
  }
  const brand = PAINT_BRANDS[finish.paintBrand];
  if (!brand) {
    return null;
  }
  const code = finish.paintCode.trim();
  return {
    kind: 'paint-match',
    label: `Paint match — ${brand.name} ${code}`,
    paintBrand: finish.paintBrand,
    paintCode: code,
    surcharge: PAINT_MATCH_FEE
  };
}

// Shared pricing — resolves every cart line against the live catalog.
// Client-sent prices are never trusted.
async function buildOrderLines(items) {
  const lines = [];
  for (const item of items) {
    const product = await getProduct(item.productId);
    if (!product) {
      throw new OrderValidationError(`Unknown product "${item.productId}"`);
    }
    const size = resolveSize(product, item.size);
    if (!size) {
      throw new OrderValidationError(`Unknown size "${item.size.sizeId}" for product "${product.id}"`);
    }
    const finish = await resolveFinish(item.finish);
    if (!finish) {
      const detail = item.finish.kind === 'stock'
        ? `Unknown stock color "${item.finish.colorId}"`
        : `Unknown paint brand "${item.finish.paintBrand}"`;
      throw new OrderValidationError(detail);
    }
    const unitPrice = product.price + finish.surcharge;
    lines.push({
      productId: product.id,
      productName: product.name,
      size,
      finish,
      quantity: item.quantity,
      unitPrice,
      lineTotal: unitPrice * item.quantity
    });
  }
  const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0);
  return { lines, subtotal };
}

function toStripeLineItems(lines) {
  return lines.map(line => ({
    quantity: line.quantity,
    price_data: {
      currency: 'usd',
      unit_amount: Math.round(line.unitPrice * 100),
      product_data: {
        name: `${line.productName} — ${line.size.label}`,
        description: line.finish.label,
        metadata: {
          productId: line.productId,
          sizeKind: line.size.kind
        }
      }
    }
  }));
}

function checkoutReturnUrl(orderId) {
  const base = (process.env.CHECKOUT_RETURN_URL || 'http://localhost:4200/checkout').replace(/\/$/, '');
  return `${base}?orderId=${orderId}&session_id={CHECKOUT_SESSION_ID}`;
}

function handleCheckoutError(h, err) {
  if (err instanceof OrderValidationError) {
    return h.response({ message: err.message }).code(400);
  }
  if (err?.code === 'STRIPE_NOT_CONFIGURED') {
    return h.response({ message: 'Payments are not configured on this server yet.' }).code(500);
  }
  throw err;
}

export function buildServer() {
  const server = Hapi.server({
    port: process.env.PORT || 3000,
    host: 'localhost',
    routes: {
      cors: true,
      validate: {
        failAction: (request, h, err) => {
          throw err;
        }
      }
    }
  });

  server.route({
    method: 'GET',
    path: '/api/health',
    handler: async () => {
      await pool.query('SELECT 1');
      return { status: 'ok', database: 'up' };
    }
  });

  server.route({
    method: 'GET',
    path: '/api/products',
    handler: () => getProducts()
  });

  server.route({
    method: 'GET',
    path: '/api/products/{id}',
    handler: async (request, h) => {
      const product = await getProduct(request.params.id);
      if (!product) {
        return h.response({ message: 'Product not found' }).code(404);
      }
      return product;
    }
  });

  server.route({
    method: 'GET',
    path: '/api/stock-colors',
    handler: () => getStockColors()
  });

  // Creates a pending order + Stripe Checkout Session (ui_mode: elements).
  // Contact, address, payment, and coupons are all collected by Stripe Elements.
  server.route({
    method: 'POST',
    path: '/api/checkout/session',
    options: { validate: { payload: checkoutSessionSchema } },
    handler: async (request, h) => {
      try {
        const { items } = request.payload;
        const { lines, subtotal } = await buildOrderLines(items);
        const subtotalCents = Math.round(subtotal * 100);
        if (subtotalCents < 50) {
          throw new OrderValidationError('Order total is too low to charge. Please adjust your cart.');
        }

        const orderId = randomUUID();
        const session = await createCheckoutSession({
          lineItems: toStripeLineItems(lines),
          orderId,
          returnUrl: checkoutReturnUrl(orderId)
        });

        const order = await insertOrder({
          id: orderId,
          // Filled in from Stripe Elements once the session is paid.
          customer: { fullName: '', email: '', address: '', phoneNumber: '' },
          lines,
          subtotal,
          discountAmount: 0,
          total: subtotal,
          status: 'pending',
          stripeCheckoutSessionId: session.id
        });

        return h.response({
          orderId: order.id,
          clientSecret: session.client_secret,
          subtotal: order.subtotal,
          total: order.total
        }).code(201);
      } catch (err) {
        return handleCheckoutError(h, err);
      }
    }
  });

  // Called after Checkout Elements confirm. We re-fetch the Checkout Session
  // from Stripe and only mark the order paid when payment_status is "paid".
  server.route({
    method: 'POST',
    path: '/api/checkout/{orderId}/confirm',
    options: {
      validate: {
        params: Joi.object({ orderId: Joi.string().guid().required() })
      }
    },
    handler: async (request, h) => {
      try {
        const order = await getOrder(request.params.orderId);
        if (!order) {
          return h.response({ message: 'Order not found' }).code(404);
        }
        if (order.status === 'paid') {
          return order;
        }
        if (!order.stripeCheckoutSessionId) {
          return h.response({ message: 'Order has no associated checkout session' }).code(409);
        }

        const session = await retrieveCheckoutSession(order.stripeCheckoutSessionId);
        if (session.status !== 'complete' || session.payment_status !== 'paid') {
          return h.response({
            message: 'Payment has not completed yet',
            status: session.status,
            paymentStatus: session.payment_status
          }).code(409);
        }

        const customer = customerFromCheckoutSession(session);
        const { discountAmount, couponCode } = discountFromCheckoutSession(session);
        const total = (session.amount_total ?? Math.round(order.subtotal * 100)) / 100;
        const paymentIntentId = typeof session.payment_intent === 'string'
          ? session.payment_intent
          : session.payment_intent?.id ?? null;

        const paidOrder = await finalizePaidOrder(order.id, {
          customer,
          couponCode,
          discountAmount,
          total,
          stripePaymentIntentId: paymentIntentId
        });
        return paidOrder ?? order;
      } catch (err) {
        return handleCheckoutError(h, err);
      }
    }
  });

  return server;
}
