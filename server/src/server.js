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
  finalizePaidOrder,
  insertCustomer,
  getCustomerByEmail,
  getCustomerAuthByEmail,
  setCustomerPassword,
  markCustomerVerified,
  insertSession,
  getCustomerBySession,
  deleteSession,
  insertEmailVerification,
  consumeEmailVerification,
  setOrderCustomer,
  claimOrdersForCustomer,
  getOrdersForCustomer,
  getCustomerOrder,
  getAllCustomers,
  getCustomerById,
  setCustomerBanned,
  deleteCustomer,
  updateCustomerEmail,
  resetCustomerPassword,
  deleteSessionsForCustomer,
  insertPasswordReset,
  consumePasswordReset,
  getAllOrders,
  addOrderRefund,
  setOrderStatus,
  updateOrderShippingAddress,
  insertStockColor,
  updateStockColor,
  deleteStockColor
} from './db.js';
import {
  createCheckoutSession,
  retrieveCheckoutSession,
  customerFromCheckoutSession,
  discountFromCheckoutSession,
  createRefund
} from './stripe.js';
import {
  hashPassword,
  verifyPassword,
  mintToken,
  hashToken,
  SESSION_TTL_MS,
  VERIFICATION_TTL_MS,
  PASSWORD_RESET_TTL_MS
} from './auth.js';
import {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  verificationUrl,
  passwordResetUrl
} from './email.js';

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

const passwordSchema = Joi.string().min(8).max(100);

function bearerToken(request) {
  const header = request.headers.authorization;
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

// Resolves the caller's customer from the Authorization header, or null.
async function customerFromRequest(request) {
  const token = bearerToken(request);
  return token ? getCustomerBySession(hashToken(token)) : null;
}

async function issueSession(customerId) {
  const { token, tokenHash } = mintToken();
  await insertSession(tokenHash, customerId, new Date(Date.now() + SESSION_TTL_MS));
  return token;
}

// hapi route `pre` guarding every /api/admin/* route: resolves the caller and
// takes over the response (401/403) unless they are a non-banned admin.
// The database is the only source of truth — nothing client-side is trusted.
const requireAdmin = {
  method: async (request, h) => {
    const admin = await customerFromRequest(request);
    if (!admin) {
      return h.response({ message: 'Not authenticated' }).code(401).takeover();
    }
    if (!admin.isAdmin) {
      return h.response({ message: 'Admin access required' }).code(403).takeover();
    }
    return admin;
  },
  assign: 'admin'
};

async function createCustomerWithWelcome({ email, fullName, phone, passwordHash }) {
  const customer = await insertCustomer({
    id: randomUUID(),
    email,
    fullName,
    phone,
    passwordHash
  });
  const { token, tokenHash } = mintToken();
  await insertEmailVerification(tokenHash, customer.id, new Date(Date.now() + VERIFICATION_TTL_MS));
  await sendWelcomeEmail({
    to: customer.email,
    fullName: customer.fullName,
    verifyUrl: verificationUrl(token)
  });
  return customer;
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

  server.route({
    method: 'POST',
    path: '/api/auth/signup',
    options: {
      validate: {
        payload: Joi.object({
          fullName: Joi.string().trim().min(2).max(100).required(),
          email: Joi.string().trim().email().max(254).required(),
          password: passwordSchema.required()
        })
      }
    },
    handler: async (request, h) => {
      const { fullName, email, password } = request.payload;
      try {
        const customer = await createCustomerWithWelcome({
          email,
          fullName,
          phone: '',
          passwordHash: await hashPassword(password)
        });
        const token = await issueSession(customer.id);
        return h.response({ token, user: customer }).code(201);
      } catch (err) {
        if (err?.code === '23505') {
          return h.response({ message: 'An account with this email already exists.' }).code(409);
        }
        throw err;
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/api/auth/login',
    options: {
      validate: {
        payload: Joi.object({
          email: Joi.string().trim().email().max(254).required(),
          password: Joi.string().max(100).required()
        })
      }
    },
    handler: async (request, h) => {
      const { email, password } = request.payload;
      const record = await getCustomerAuthByEmail(email);
      // Same message for unknown email and wrong password.
      if (!record || !(await verifyPassword(password, record.passwordHash))) {
        return h.response({ message: 'Invalid email or password.' }).code(401);
      }
      if (record.isBanned) {
        return h.response({ message: 'This account has been disabled.' }).code(403);
      }
      const { passwordHash, ...user } = record;
      const token = await issueSession(user.id);
      return { token, user };
    }
  });

  server.route({
    method: 'POST',
    path: '/api/auth/logout',
    handler: async (request, h) => {
      const token = bearerToken(request);
      if (token) {
        await deleteSession(hashToken(token));
      }
      return h.response().code(204);
    }
  });

  server.route({
    method: 'GET',
    path: '/api/auth/me',
    handler: async (request, h) => {
      const customer = await customerFromRequest(request);
      if (!customer) {
        return h.response({ message: 'Not authenticated' }).code(401);
      }
      return { user: customer };
    }
  });

  // Consuming the token verifies the email, claims matching guest orders, and
  // signs the customer in (the emailed link must work in a fresh browser).
  server.route({
    method: 'POST',
    path: '/api/auth/verify-email',
    options: {
      validate: {
        payload: Joi.object({ token: Joi.string().max(128).required() })
      }
    },
    handler: async (request, h) => {
      const verification = await consumeEmailVerification(hashToken(request.payload.token));
      if (!verification) {
        return h.response({ message: 'This verification link is invalid or has expired.' }).code(400);
      }
      const customer = await markCustomerVerified(verification.customerId);
      await claimOrdersForCustomer(customer.id, customer.email);
      const token = await issueSession(customer.id);
      return { token, user: customer };
    }
  });

  // Set-only (accounts created at checkout without a password). Changing an
  // existing password is out of scope until a reset flow exists.
  server.route({
    method: 'POST',
    path: '/api/auth/password',
    options: {
      validate: {
        payload: Joi.object({ password: passwordSchema.required() })
      }
    },
    handler: async (request, h) => {
      const customer = await customerFromRequest(request);
      if (!customer) {
        return h.response({ message: 'Not authenticated' }).code(401);
      }
      const updated = await setCustomerPassword(customer.id, await hashPassword(request.payload.password));
      if (!updated) {
        return h.response({ message: 'A password is already set for this account.' }).code(409);
      }
      return { user: updated };
    }
  });

  // Public: consumes an emailed reset token (single-use, 1h). Overwrites the
  // password, revokes every session, and signs the customer in fresh.
  server.route({
    method: 'POST',
    path: '/api/auth/reset-password',
    options: {
      validate: {
        payload: Joi.object({
          token: Joi.string().max(128).required(),
          password: passwordSchema.required()
        })
      }
    },
    handler: async (request, h) => {
      const reset = await consumePasswordReset(hashToken(request.payload.token));
      if (!reset) {
        return h.response({ message: 'This reset link is invalid or has expired.' }).code(400);
      }
      const existing = await getCustomerById(reset.customerId);
      if (!existing || existing.isBanned) {
        return h.response({ message: 'This reset link is invalid or has expired.' }).code(400);
      }
      const customer = await resetCustomerPassword(existing.id, await hashPassword(request.payload.password));
      await deleteSessionsForCustomer(customer.id);
      const token = await issueSession(customer.id);
      return { token, user: customer };
    }
  });

  server.route({
    method: 'GET',
    path: '/api/orders',
    handler: async (request, h) => {
      const customer = await customerFromRequest(request);
      if (!customer) {
        return h.response({ message: 'Not authenticated' }).code(401);
      }
      return getOrdersForCustomer(customer.id);
    }
  });

  server.route({
    method: 'GET',
    path: '/api/orders/{id}',
    options: {
      validate: {
        params: Joi.object({ id: Joi.string().guid().required() })
      }
    },
    handler: async (request, h) => {
      const customer = await customerFromRequest(request);
      if (!customer) {
        return h.response({ message: 'Not authenticated' }).code(401);
      }
      // 404 (not 403) for orders that exist but belong to someone else.
      const order = await getCustomerOrder(request.params.id, customer.id);
      if (!order) {
        return h.response({ message: 'Order not found' }).code(404);
      }
      return order;
    }
  });

  // --- Admin ---------------------------------------------------------------

  const orderIdParams = Joi.object({ id: Joi.string().guid().required() });

  server.route({
    method: 'GET',
    path: '/api/admin/orders',
    options: {
      pre: [requireAdmin],
      validate: {
        query: Joi.object({
          status: Joi.string().valid('pending', 'paid', 'shipped', 'delivered', 'canceled')
        })
      }
    },
    handler: request => getAllOrders(request.query.status)
  });

  server.route({
    method: 'GET',
    path: '/api/admin/orders/{id}',
    options: { pre: [requireAdmin], validate: { params: orderIdParams } },
    handler: async (request, h) => {
      const order = await getOrder(request.params.id);
      return order ?? h.response({ message: 'Order not found' }).code(404);
    }
  });

  // Refunds move money through Stripe and never change the fulfillment status —
  // an order can be shipped/delivered and (partially) refunded at once.
  server.route({
    method: 'POST',
    path: '/api/admin/orders/{id}/refund',
    options: {
      pre: [requireAdmin],
      validate: {
        params: orderIdParams,
        payload: Joi.object({
          amount: Joi.number().positive().precision(2)
        }).allow(null)
      }
    },
    handler: async (request, h) => {
      const order = await getOrder(request.params.id);
      if (!order) {
        return h.response({ message: 'Order not found' }).code(404);
      }
      if (!order.stripePaymentIntentId) {
        return h.response({ message: 'This order has no captured payment to refund.' }).code(409);
      }
      const remaining = Math.round((order.total - order.refundAmount) * 100) / 100;
      if (remaining <= 0) {
        return h.response({ message: 'This order is already fully refunded.' }).code(409);
      }
      const amount = request.payload?.amount ?? remaining;
      if (amount > remaining) {
        return h.response({
          message: `Refund exceeds the remaining $${remaining.toFixed(2)} on this order.`
        }).code(400);
      }

      try {
        await createRefund(order.stripePaymentIntentId, Math.round(amount * 100));
      } catch (err) {
        if (err?.code === 'STRIPE_NOT_CONFIGURED') {
          return h.response({ message: 'Payments are not configured on this server yet.' }).code(500);
        }
        if (typeof err?.type === 'string' && err.type.startsWith('Stripe')) {
          return h.response({ message: err.message }).code(400);
        }
        throw err;
      }

      const updated = await addOrderRefund(order.id, amount);
      // Stripe accepted the refund; a null here means a concurrent refund won —
      // surface the current order state either way.
      return updated ?? getOrder(order.id);
    }
  });

  // Cancel halts fulfillment only (before shipment) — money moves via refund.
  server.route({
    method: 'POST',
    path: '/api/admin/orders/{id}/cancel',
    options: { pre: [requireAdmin], validate: { params: orderIdParams } },
    handler: async (request, h) => {
      const order = await setOrderStatus(request.params.id, 'canceled', ['pending', 'paid']);
      if (!order) {
        const exists = await getOrder(request.params.id);
        if (!exists) {
          return h.response({ message: 'Order not found' }).code(404);
        }
        return h.response({ message: `Orders cannot be canceled once ${exists.status}.` }).code(409);
      }
      return order;
    }
  });

  server.route({
    method: 'PATCH',
    path: '/api/admin/orders/{id}/status',
    options: {
      pre: [requireAdmin],
      validate: {
        params: orderIdParams,
        payload: Joi.object({
          status: Joi.string().valid('shipped', 'delivered').required()
        })
      }
    },
    handler: async (request, h) => {
      const { status } = request.payload;
      const allowedFrom = status === 'shipped' ? ['paid'] : ['paid', 'shipped'];
      const order = await setOrderStatus(request.params.id, status, allowedFrom);
      if (!order) {
        const exists = await getOrder(request.params.id);
        if (!exists) {
          return h.response({ message: 'Order not found' }).code(404);
        }
        return h.response({
          message: `Orders can only be marked ${status} from ${allowedFrom.join(' or ')} (currently ${exists.status}).`
        }).code(409);
      }
      return order;
    }
  });

  server.route({
    method: 'PATCH',
    path: '/api/admin/orders/{id}/shipping-address',
    options: {
      pre: [requireAdmin],
      validate: {
        params: orderIdParams,
        payload: Joi.object({
          address: Joi.string().trim().min(4).max(500).required()
        })
      }
    },
    handler: async (request, h) => {
      const order = await updateOrderShippingAddress(request.params.id, request.payload.address);
      return order ?? h.response({ message: 'Order not found' }).code(404);
    }
  });

  const userIdParams = Joi.object({ id: Joi.string().guid().required() });

  server.route({
    method: 'GET',
    path: '/api/admin/users',
    options: { pre: [requireAdmin] },
    handler: () => getAllCustomers()
  });

  server.route({
    method: 'PATCH',
    path: '/api/admin/users/{id}/ban',
    options: {
      pre: [requireAdmin],
      validate: {
        params: userIdParams,
        payload: Joi.object({ banned: Joi.boolean().required() })
      }
    },
    handler: async (request, h) => {
      if (request.params.id === request.pre.admin.id) {
        return h.response({ message: 'You cannot ban your own account.' }).code(400);
      }
      const user = await setCustomerBanned(request.params.id, request.payload.banned);
      if (!user) {
        return h.response({ message: 'User not found' }).code(404);
      }
      if (user.isBanned) {
        await deleteSessionsForCustomer(user.id);
      }
      return { user };
    }
  });

  server.route({
    method: 'DELETE',
    path: '/api/admin/users/{id}',
    options: { pre: [requireAdmin], validate: { params: userIdParams } },
    handler: async (request, h) => {
      if (request.params.id === request.pre.admin.id) {
        return h.response({ message: 'You cannot delete your own account.' }).code(400);
      }
      const deleted = await deleteCustomer(request.params.id);
      if (!deleted) {
        return h.response({ message: 'User not found' }).code(404);
      }
      return h.response().code(204);
    }
  });

  server.route({
    method: 'PATCH',
    path: '/api/admin/users/{id}/email',
    options: {
      pre: [requireAdmin],
      validate: {
        params: userIdParams,
        payload: Joi.object({
          email: Joi.string().trim().email().max(254).required()
        })
      }
    },
    handler: async (request, h) => {
      try {
        const user = await updateCustomerEmail(request.params.id, request.payload.email);
        if (!user) {
          return h.response({ message: 'User not found' }).code(404);
        }
        // The new address is unverified until its owner clicks the fresh link.
        const { token, tokenHash } = mintToken();
        await insertEmailVerification(tokenHash, user.id, new Date(Date.now() + VERIFICATION_TTL_MS));
        await sendWelcomeEmail({ to: user.email, fullName: user.fullName, verifyUrl: verificationUrl(token) });
        return { user };
      } catch (err) {
        if (err?.code === '23505') {
          return h.response({ message: 'Another account already uses this email.' }).code(409);
        }
        throw err;
      }
    }
  });

  server.route({
    method: 'POST',
    path: '/api/admin/users/{id}/password-reset',
    options: { pre: [requireAdmin], validate: { params: userIdParams } },
    handler: async (request, h) => {
      const user = await getCustomerById(request.params.id);
      if (!user) {
        return h.response({ message: 'User not found' }).code(404);
      }
      const { token, tokenHash } = mintToken();
      await insertPasswordReset(tokenHash, user.id, new Date(Date.now() + PASSWORD_RESET_TTL_MS));
      await sendPasswordResetEmail({ to: user.email, fullName: user.fullName, resetUrl: passwordResetUrl(token) });
      return h.response().code(204);
    }
  });

  const hexSchema = Joi.string().pattern(/^#[0-9a-fA-F]{6}$/).message('Hex color must look like #a1b2c3');
  const stockColorBrandSchema = Joi.string().valid(...Object.keys(PAINT_BRANDS));

  server.route({
    method: 'POST',
    path: '/api/admin/stock-colors',
    options: {
      pre: [requireAdmin],
      validate: {
        payload: Joi.object({
          name: Joi.string().trim().min(2).max(60).required(),
          hex: hexSchema.required(),
          brand: stockColorBrandSchema.required()
        })
      }
    },
    handler: async (request, h) => {
      const { name, hex, brand } = request.payload;
      const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      try {
        const color = await insertStockColor({ id, name, hex, brand });
        return h.response(color).code(201);
      } catch (err) {
        if (err?.code === '23505') {
          return h.response({ message: `A stock color named "${name}" already exists.` }).code(409);
        }
        throw err;
      }
    }
  });

  server.route({
    method: 'PATCH',
    path: '/api/admin/stock-colors/{id}',
    options: {
      pre: [requireAdmin],
      validate: {
        params: Joi.object({ id: Joi.string().required() }),
        payload: Joi.object({
          name: Joi.string().trim().min(2).max(60),
          hex: hexSchema,
          brand: stockColorBrandSchema
        }).min(1)
      }
    },
    handler: async (request, h) => {
      const color = await updateStockColor(request.params.id, request.payload);
      return color ?? h.response({ message: 'Stock color not found' }).code(404);
    }
  });

  server.route({
    method: 'DELETE',
    path: '/api/admin/stock-colors/{id}',
    options: {
      pre: [requireAdmin],
      validate: { params: Joi.object({ id: Joi.string().required() }) }
    },
    handler: async (request, h) => {
      const deleted = await deleteStockColor(request.params.id);
      if (!deleted) {
        return h.response({ message: 'Stock color not found' }).code(404);
      }
      return h.response().code(204);
    }
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
        params: Joi.object({ orderId: Joi.string().guid().required() }),
        payload: Joi.object({ password: passwordSchema }).allow(null)
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
        const finalOrder = paidOrder ?? order;

        // Every paid order gets an owner: the logged-in caller, an existing
        // account matching the Stripe email, or a brand-new customer (with the
        // optional checkout password) who gets the welcome/verification email.
        // A supplied password never touches an existing account.
        let accountCreated = false;
        let owner = await customerFromRequest(request);
        if (!owner && customer.email) {
          owner = await getCustomerByEmail(customer.email);
          if (!owner) {
            const password = request.payload?.password;
            owner = await createCustomerWithWelcome({
              email: customer.email,
              fullName: customer.fullName,
              phone: customer.phoneNumber,
              passwordHash: password ? await hashPassword(password) : null
            });
            accountCreated = true;
          }
        }
        if (owner) {
          await setOrderCustomer(finalOrder.id, owner.id);
        }

        return { ...finalOrder, accountCreated };
      } catch (err) {
        return handleCheckoutError(h, err);
      }
    }
  });

  return server;
}
