import Hapi from '@hapi/hapi';
import Joi from 'joi';
import { randomUUID } from 'node:crypto';
import {
  PAINT_MATCH_FEE,
  WIDTH_RANGE,
  HEIGHT_RANGE,
  SW_CODE_PATTERN
} from './data.js';
import {
  pool,
  getProducts,
  getProduct,
  getStockColors,
  getStockColor,
  insertOrder
} from './db.js';

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
    paintCode: Joi.string().pattern(SW_CODE_PATTERN).required()
  })
);

const orderSchema = Joi.object({
  customer: Joi.object({
    fullName: Joi.string().min(1).max(200).required(),
    email: Joi.string().email().required(),
    address: Joi.string().min(1).max(1000).required(),
    phoneNumber: Joi.string().min(7).max(30).required()
  }).required(),
  items: Joi.array().items(
    Joi.object({
      productId: Joi.string().required(),
      quantity: Joi.number().integer().min(1).max(500).required(),
      size: sizeSchema.required(),
      finish: finishSchema.required()
    })
  ).min(1).required()
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
  const swNumber = finish.paintCode.replace(/\D/g, '');
  return {
    kind: 'paint-match',
    label: `Paint match — SW ${swNumber}`,
    paintCode: `SW ${swNumber}`,
    surcharge: PAINT_MATCH_FEE
  };
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
    path: '/api/orders',
    options: {
      validate: { payload: orderSchema }
    },
    handler: async (request, h) => {
      const { customer, items } = request.payload;

      const lines = [];
      for (const item of items) {
        const product = await getProduct(item.productId);
        if (!product) {
          return h.response({ message: `Unknown product "${item.productId}"` }).code(400);
        }
        const size = resolveSize(product, item.size);
        if (!size) {
          return h.response({
            message: `Unknown size "${item.size.sizeId}" for product "${product.id}"`
          }).code(400);
        }
        const finish = await resolveFinish(item.finish);
        if (!finish) {
          return h.response({ message: `Unknown stock color "${item.finish.colorId}"` }).code(400);
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

      const order = await insertOrder({
        id: randomUUID(),
        customer,
        lines,
        total: lines.reduce((sum, line) => sum + line.lineTotal, 0)
      });

      return h.response(order).code(201);
    }
  });

  return server;
}
