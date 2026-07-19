import Stripe from 'stripe';

let client = null;

// Lazily constructed so routes that don't touch payments (health, products, ...)
// keep working even if STRIPE_SECRET_KEY hasn't been configured yet.
function getStripeClient() {
  if (client) {
    return client;
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw Object.assign(new Error('STRIPE_SECRET_KEY is not configured'), { code: 'STRIPE_NOT_CONFIGURED' });
  }
  client = new Stripe(key);
  return client;
}

// Builds a Checkout Session for the Elements UI mode. Coupons are applied
// later client-side via Checkout Elements `actions.applyPromotionCode`.
export async function createCheckoutSession({ lineItems, orderId, returnUrl }) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.create({
    ui_mode: 'elements',
    mode: 'payment',
    line_items: lineItems,
    return_url: returnUrl,
    billing_address_collection: 'required',
    shipping_address_collection: {
      // Contiguous US + DC; Alaska/Hawaii excluded to match current shipping policy.
      allowed_countries: [
        'US'
      ]
    },
    phone_number_collection: { enabled: true },
    // First-class individual name — Contact Details Element only collects email.
    // Client must call updateIndividualName() / confirm with the name.
    name_collection: {
      individual: { enabled: true }
    },
    metadata: { orderId }
  });
}

export async function retrieveCheckoutSession(sessionId) {
  const stripe = getStripeClient();
  return stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent', 'total_details.breakdown.discounts.discount']
  });
}

// Formats a Stripe Address into a single shipping string for our order record.
export function formatStripeAddress(address) {
  if (!address) {
    return '';
  }
  return [
    address.line1,
    address.line2,
    [address.city, address.state, address.postal_code].filter(Boolean).join(', '),
    address.country
  ].filter(Boolean).join('\n');
}

export function customerFromCheckoutSession(session) {
  const details = session.customer_details ?? {};
  const shipping = session.collected_information?.shipping_details
    ?? session.shipping_details
    ?? null;
  const address = shipping?.address ?? details.address ?? null;
  return {
    fullName:
      details.individual_name
      || shipping?.name
      || details.name
      || '',
    email: details.email || '',
    address: formatStripeAddress(address),
    phoneNumber: details.phone || shipping?.phone || ''
  };
}

export function discountFromCheckoutSession(session) {
  const totalDetails = session.total_details ?? {};
  const discountCents = totalDetails.amount_discount ?? 0;
  const breakdown = totalDetails.breakdown?.discounts?.[0];
  const promotionCode = breakdown?.discount?.promotion_code
    ?? breakdown?.discount?.coupon?.name
    ?? null;
  return {
    discountAmount: discountCents / 100,
    couponCode: typeof promotionCode === 'string' ? promotionCode : null
  };
}
