import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import {
  loadStripe,
  Stripe,
  StripeCheckoutElementsSdk,
  StripeCheckoutLoadActionsSuccess,
  StripeCheckoutSession
} from '@stripe/stripe-js';
import { environment } from '../../../environments/environment';

export type CheckoutItemSize =
  | { kind: 'standard'; sizeId: string }
  | { kind: 'custom'; widthInches: number; heightInches: number };

export type CheckoutItemFinish =
  | { kind: 'primed' }
  | { kind: 'stock'; colorId: string }
  | { kind: 'paint-match'; paintBrand: string; paintCode: string };

export interface CheckoutItemPayload {
  productId: string;
  quantity: number;
  size: CheckoutItemSize;
  finish: CheckoutItemFinish;
}

export interface CheckoutSessionResponse {
  orderId: string;
  clientSecret: string;
  subtotal: number;
  total: number;
}

export interface ConfirmedOrder {
  id: string;
  status: string;
  total: number;
  couponCode?: string | null;
  discountAmount?: number;
  accountCreated?: boolean;
}

export interface CheckoutTotals {
  subtotal: number;
  discountAmount: number;
  total: number;
  /** Stripe-formatted total string (e.g. "$45.00") — must be shown before confirm(). */
  totalLabel: string;
  couponCode: string | null;
  couponDescription: string | null;
  canConfirm: boolean;
}

// Wrapper around Stripe.js Checkout Elements SDK + the session/confirm APIs.
@Injectable({ providedIn: 'root' })
export class CheckoutService {
  private http = inject(HttpClient);
  private stripePromise: Promise<Stripe | null> | null = null;

  loadStripe(): Promise<Stripe | null> {
    if (!this.stripePromise) {
      this.stripePromise = loadStripe(environment.stripePublishableKey);
    }
    return this.stripePromise;
  }

  createSession(items: CheckoutItemPayload[]) {
    return this.http.post<CheckoutSessionResponse>(`${environment.apiUrl}/checkout/session`, { items });
  }

  // Optional password: sets up an account for the Stripe-collected email.
  confirmOrder(orderId: string, password?: string) {
    return this.http.post<ConfirmedOrder>(
      `${environment.apiUrl}/checkout/${orderId}/confirm`,
      password ? { password } : {}
    );
  }

  async initCheckoutElements(clientSecret: string): Promise<{
    stripe: Stripe;
    checkout: StripeCheckoutElementsSdk;
    actions: StripeCheckoutLoadActionsSuccess;
  }> {
    const stripe = await this.loadStripe();
    if (!stripe) {
      throw new Error('Stripe.js failed to load');
    }

    const checkout = stripe.initCheckoutElementsSdk({
      clientSecret,
      elementsOptions: {
        appearance: {
          theme: 'stripe',
          variables: {
            colorPrimary: '#1f3a5f',
            borderRadius: '6px'
          }
        },
        syncAddressCheckbox: 'billing'
      }
    });

    const result = await checkout.loadActions();
    if (result.type === 'error') {
      throw new Error(result.error.message || 'Could not initialize checkout');
    }

    return { stripe, checkout, actions: result.actions };
  }

  totalsFromSession(session: StripeCheckoutSession): CheckoutTotals {
    const discount = session.discountAmounts?.[0] ?? null;
    // Read amount + currency fields Stripe requires before actions.confirm().
    const totalLabel = session.total.total.amount;
    void session.currency;
    void session.total.total.minorUnitsAmount;
    void session.minorUnitsAmountDivisor;
    return {
      subtotal: session.total.subtotal.minorUnitsAmount / session.minorUnitsAmountDivisor,
      discountAmount: session.total.discount.minorUnitsAmount / session.minorUnitsAmountDivisor,
      total: session.total.total.minorUnitsAmount / session.minorUnitsAmountDivisor,
      totalLabel,
      couponCode: discount?.promotionCode ?? null,
      couponDescription: discount?.displayName ?? null,
      canConfirm: session.canConfirm
    };
  }
}
