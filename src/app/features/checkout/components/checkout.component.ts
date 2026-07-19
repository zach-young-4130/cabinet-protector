import {
  Component,
  DestroyRef,
  ElementRef,
  NgZone,
  OnDestroy,
  computed,
  effect,
  inject,
  signal,
  untracked,
  viewChild
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import type {
  StripeCheckoutElementsSdk,
  StripeCheckoutLoadActionsSuccess,
  StripeCheckoutExpressCheckoutElement,
  StripeExpressCheckoutElementConfirmEvent,
  StripePaymentElement,
  StripeAddressElement,
  StripeContactDetailsElement
} from '@stripe/stripe-js';
import { NavbarComponent } from '../../../shared/components/navbar.component';
import { FooterComponent } from '../../../shared/components/footer.component';
import { CartItem, CartService } from '../../../core/services/cart.service';
import {
  CheckoutItemPayload,
  CheckoutService,
  CheckoutTotals
} from '../../../core/services/checkout.service';
import { AuthService } from '../../../core/services/auth.service';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavbarComponent, FooterComponent],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent implements OnDestroy {
  private cartService = inject(CartService);
  private checkoutService = inject(CheckoutService);
  private auth = inject(AuthService);
  private fb = inject(FormBuilder);
  private zone = inject(NgZone);
  private destroyRef = inject(DestroyRef);

  items = this.cartService.items;
  cartSubtotal = this.cartService.totalAmount;
  isLoggedIn = this.auth.isLoggedIn;

  // Optional account creation for guests — see accountPassword().
  accountPasswordControl = this.fb.control('', {
    nonNullable: true,
    validators: [Validators.minLength(8), Validators.maxLength(100)]
  });
  showAccountPassword = signal(false);

  couponCodeControl = this.fb.control('', { nonNullable: true });
  // Contact Details Element only collects email. Name + phone are first-class
  // session fields (name_collection / phone_number_collection) with no Element —
  // submit via updateIndividualName() / updatePhoneNumber() before confirm().
  individualNameControl = this.fb.control('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2), Validators.maxLength(100)]
  });
  phoneControl = this.fb.control('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(7), Validators.maxLength(30)]
  });
  individualNameValid = signal(false);
  phoneValid = signal(false);
  couponStatus = signal<'idle' | 'checking' | 'applied' | 'error'>('idle');
  couponError = signal<string | null>(null);

  sessionLoading = signal(false);
  sessionError = signal<string | null>(null);
  elementsReady = signal(false);
  actionsReady = signal(false);

  orderId = signal<string | null>(null);
  clientSecret = signal<string | null>(null);

  processingPayment = signal(false);
  paymentError = signal<string | null>(null);

  totals = signal<CheckoutTotals | null>(null);

  // Don't gate on Stripe's canConfirm — it can stay false even when confirm()
  // would succeed. Elements validate on confirm and surface field errors.
  canPay = computed(() =>
    this.elementsReady() &&
    this.actionsReady() &&
    this.individualNameValid() &&
    this.phoneValid() &&
    !this.sessionLoading() &&
    !this.processingPayment()
  );

  expressCheckoutContainer = viewChild<ElementRef<HTMLDivElement>>('expressCheckoutContainer');
  contactDetailsContainer = viewChild<ElementRef<HTMLDivElement>>('contactDetailsContainer');
  shippingAddressContainer = viewChild<ElementRef<HTMLDivElement>>('shippingAddressContainer');
  billingAddressContainer = viewChild<ElementRef<HTMLDivElement>>('billingAddressContainer');
  paymentElementContainer = viewChild<ElementRef<HTMLDivElement>>('paymentElementContainer');

  private checkout: StripeCheckoutElementsSdk | null = null;
  // updateIndividualName exists at runtime; installed @stripe/stripe-js typings lag.
  private actions: (StripeCheckoutLoadActionsSuccess & {
    updateIndividualName: (individualName: string | null) => Promise<unknown>;
  }) | null = null;
  private expressCheckout: StripeCheckoutExpressCheckoutElement | null = null;
  private contactDetails: StripeContactDetailsElement | null = null;
  private shippingAddress: StripeAddressElement | null = null;
  private billingAddress: StripeAddressElement | null = null;
  private paymentElement: StripePaymentElement | null = null;
  private mountedSecret: string | null = null;
  private destroyed = false;

  // Only recreate a Checkout Session when the cart contents actually change.
  private activeCartKey: string | null = null;
  private sessionSub: Subscription | null = null;

  constructor() {
    this.individualNameControl.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.individualNameValid.set(this.individualNameControl.valid);
      });
    this.individualNameControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        void this.syncIndividualName(value);
      });
    this.phoneControl.statusChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.phoneValid.set(this.phoneControl.valid);
      });
    this.phoneControl.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(value => {
        void this.syncPhoneNumber(value);
      });

    effect(() => {
      const items = this.items();
      if (items.length === 0) {
        this.teardownSession();
        return;
      }

      // Redirect confirmation owns the page — don't open a fresh session.
      if (untracked(() => this.processingPayment())) {
        return;
      }

      const key = this.cartKey(items);
      if (key === this.activeCartKey) {
        return;
      }

      this.startSession(key, items);
    });

    effect(() => {
      const secret = this.clientSecret();
      const containersReady =
        !!this.expressCheckoutContainer() &&
        !!this.contactDetailsContainer() &&
        !!this.shippingAddressContainer() &&
        !!this.billingAddressContainer() &&
        !!this.paymentElementContainer();

      if (!secret || !containersReady || secret === this.mountedSecret) {
        return;
      }
      void this.mountElements(secret);
    });

    this.handleRedirectReturn();
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionSub?.unsubscribe();
    this.unmountElements();
  }

  unitPrice(item: CartItem): number {
    return this.cartService.unitPrice(item);
  }

  displaySubtotal(): number {
    return this.totals()?.subtotal ?? this.cartSubtotal();
  }

  displayDiscount(): number {
    return this.totals()?.discountAmount ?? 0;
  }

  displayTotal(): number {
    return this.totals()?.total ?? this.cartSubtotal();
  }

  displayTotalLabel(): string {
    return this.totals()?.totalLabel ?? `$${this.displayTotal().toFixed(2)}`;
  }

  displayCouponCode(): string | null {
    return this.totals()?.couponCode ?? null;
  }

  async applyCoupon() {
    const code = this.couponCodeControl.value.trim();
    if (!code || !this.actions || this.couponStatus() === 'checking') {
      return;
    }
    this.couponStatus.set('checking');
    this.couponError.set(null);

    const result = await this.actions.applyPromotionCode(code);
    if (result.type === 'error') {
      this.couponStatus.set('error');
      this.couponError.set(result.error.message || 'This coupon code could not be applied.');
      return;
    }

    this.syncTotals(result.session);
    this.couponStatus.set('applied');
  }

  async removeCoupon() {
    if (!this.actions) {
      return;
    }
    const result = await this.actions.removePromotionCode();
    if (result.type === 'success') {
      this.syncTotals(result.session);
    }
    this.couponStatus.set('idle');
    this.couponError.set(null);
    this.couponCodeControl.setValue('');
  }

  async pay(expressEvent?: StripeExpressCheckoutElementConfirmEvent) {
    if (!this.actions || this.processingPayment()) {
      return;
    }
    const orderId = this.orderId();
    if (!orderId) {
      return;
    }

    this.individualNameControl.markAsTouched();
    this.phoneControl.markAsTouched();
    if (this.individualNameControl.invalid) {
      this.paymentError.set('Please enter your full name.');
      return;
    }
    if (this.phoneControl.invalid) {
      this.paymentError.set('Please enter a valid phone number.');
      return;
    }
    if (!this.isLoggedIn() && this.accountPasswordControl.value && this.accountPasswordControl.invalid) {
      this.accountPasswordControl.markAsTouched();
      this.paymentError.set('Account password must be at least 8 characters — or clear it to check out as a guest.');
      return;
    }

    const individualName = this.individualNameControl.value.trim();
    const phoneNumber = this.phoneControl.value.trim();
    this.processingPayment.set(true);
    this.paymentError.set(null);

    try {
      // Stripe throws if confirm() is called without reading live totals first.
      this.syncTotals(this.actions.getSession());
      // First-class session fields (no Element) — must be set before confirm.
      await this.actions.updateIndividualName(individualName);
      await this.actions.updatePhoneNumber(phoneNumber);

      const validation = await this.actions.validateElements();
      if (validation.type === 'error') {
        this.zone.run(() => {
          this.processingPayment.set(false);
          const first = validation.error.validation_errors?.[0]?.message;
          this.paymentError.set(first || validation.error.message || 'Please complete all required fields.');
        });
        return;
      }

      // return_url is set on the Checkout Session — confirm() must not pass returnUrl again.
      const result = await this.actions.confirm({
        redirect: 'if_required',
        phoneNumber,
        ...(expressEvent ? { expressCheckoutConfirmEvent: expressEvent } : {})
      });

      this.zone.run(() => {
        if (result.type === 'error') {
          this.processingPayment.set(false);
          this.paymentError.set(result.error.message || 'Payment failed. Please check your details and try again.');
          return;
        }

        // Card payments resolve here; redirect methods navigate away.
        // Server re-verifies the Checkout Session before marking the order paid.
        if (result.session.status.type === 'complete') {
          this.finalizeOrder(orderId);
          return;
        }

        this.processingPayment.set(false);
        this.paymentError.set('Payment did not complete. Please try again.');
      });
    } catch (err) {
      this.zone.run(() => {
        this.processingPayment.set(false);
        this.paymentError.set(err instanceof Error ? err.message : 'Payment failed. Please try again.');
      });
    }
  }

  private async syncIndividualName(value: string) {
    if (!this.actions) {
      return;
    }
    const name = value.trim();
    if (name.length < 2) {
      return;
    }
    await this.actions.updateIndividualName(name);
  }

  private async syncPhoneNumber(value: string) {
    if (!this.actions) {
      return;
    }
    const phone = value.trim();
    if (phone.length < 7) {
      return;
    }
    await this.actions.updatePhoneNumber(phone);
  }

  private cartKey(items: CartItem[]): string {
    return items
      .map(item => `${item.key}:${item.quantity}`)
      .sort()
      .join('|');
  }

  private itemsPayload(items: CartItem[]): CheckoutItemPayload[] {
    return items.map(item => ({
      productId: item.product.id,
      quantity: item.quantity,
      size: item.size.kind === 'standard'
        ? { kind: 'standard' as const, sizeId: item.size.sizeId! }
        : { kind: 'custom' as const, widthInches: item.size.widthInches, heightInches: item.size.heightInches },
      finish: item.finish.kind === 'primed'
        ? { kind: 'primed' as const }
        : item.finish.kind === 'stock'
          ? { kind: 'stock' as const, colorId: item.finish.id }
          : { kind: 'paint-match' as const, paintBrand: item.finish.paintBrand!, paintCode: item.finish.paintCode! }
    }));
  }

  private startSession(key: string, items: CartItem[]) {
    this.activeCartKey = key;
    this.sessionSub?.unsubscribe();
    this.sessionLoading.set(true);
    this.sessionError.set(null);
    this.elementsReady.set(false);
    this.unmountElements();
    this.mountedSecret = null;
    this.clientSecret.set(null);
    this.orderId.set(null);

    this.sessionSub = this.checkoutService.createSession(this.itemsPayload(items)).subscribe({
      next: session => {
        if (this.destroyed || this.activeCartKey !== key) {
          return;
        }
        this.sessionLoading.set(false);
        this.orderId.set(session.orderId);
        this.clientSecret.set(session.clientSecret);
        this.totals.set({
          subtotal: session.subtotal,
          discountAmount: 0,
          total: session.total,
          totalLabel: `$${session.total.toFixed(2)}`,
          couponCode: null,
          couponDescription: null,
          canConfirm: false
        });
      },
      error: err => {
        if (this.destroyed || this.activeCartKey !== key) {
          return;
        }
        this.sessionLoading.set(false);
        this.activeCartKey = null;
        this.sessionError.set(err?.error?.message ?? 'We could not start checkout. Please try again.');
      }
    });
  }

  private teardownSession() {
    this.sessionSub?.unsubscribe();
    this.sessionSub = null;
    this.activeCartKey = null;
    this.sessionLoading.set(false);
    this.sessionError.set(null);
    this.orderId.set(null);
    this.clientSecret.set(null);
    this.totals.set(null);
    this.elementsReady.set(false);
    this.unmountElements();
    this.mountedSecret = null;
  }

  private async mountElements(clientSecret: string) {
    try {
      const { checkout, actions } = await this.checkoutService.initCheckoutElements(clientSecret);
      if (this.destroyed || this.clientSecret() !== clientSecret) {
        return;
      }

      this.checkout = checkout;
      this.actions = actions as NonNullable<typeof this.actions>;
      this.actionsReady.set(true);
      // Re-sync custom contact fields if the shopper typed them before Elements mounted.
      const pendingName = this.individualNameControl.value.trim();
      if (pendingName.length >= 2) {
        void this.actions.updateIndividualName(pendingName);
      }
      const pendingPhone = this.phoneControl.value.trim();
      if (pendingPhone.length >= 7) {
        void this.actions.updatePhoneNumber(pendingPhone);
      }
      this.syncTotals(actions.getSession());

      // Stripe fires outside Angular's zone — wrap so the template updates.
      checkout.on('change', session => {
        this.zone.run(() => this.syncTotals(session));
      });

      const expressCheckout = checkout.createExpressCheckoutElement();
      expressCheckout.on('confirm', event => {
        void this.pay(event);
      });
      expressCheckout.mount(this.expressCheckoutContainer()!.nativeElement);
      this.expressCheckout = expressCheckout;

      this.contactDetails = checkout.createContactDetailsElement();
      this.contactDetails.mount(this.contactDetailsContainer()!.nativeElement);

      // Checkout Elements Address Element does not accept `fields` options —
      // phone is collected via phone_number_collection on the Checkout Session.
      this.shippingAddress = checkout.createShippingAddressElement();
      this.shippingAddress.mount(this.shippingAddressContainer()!.nativeElement);

      this.billingAddress = checkout.createBillingAddressElement();
      this.billingAddress.mount(this.billingAddressContainer()!.nativeElement);

      this.paymentElement = checkout.createPaymentElement({
        layout: 'tabs'
      });
      this.paymentElement.mount(this.paymentElementContainer()!.nativeElement);

      this.mountedSecret = clientSecret;
      this.elementsReady.set(true);
    } catch (err) {
      this.sessionError.set(err instanceof Error ? err.message : 'Payments could not be loaded.');
      this.elementsReady.set(false);
    }
  }

  private syncTotals(session: Parameters<CheckoutService['totalsFromSession']>[0]) {
    const next = this.checkoutService.totalsFromSession(session);
    this.totals.set(next);
    if (next.couponCode) {
      this.couponStatus.set('applied');
    } else if (this.couponStatus() === 'applied') {
      this.couponStatus.set('idle');
    }
  }

  // Guest checkout account password. Empty (or invalid, or logged in) → undefined.
  // Redirect payments return here with a fresh component, so no password —
  // those customers set one from the verification email instead.
  private accountPassword(): string | undefined {
    const value = this.accountPasswordControl.value;
    return !this.isLoggedIn() && this.accountPasswordControl.valid && value ? value : undefined;
  }

  private finalizeOrder(orderId: string) {
    const password = this.accountPassword();
    this.checkoutService.confirmOrder(orderId, password).subscribe({
      next: order => {
        this.processingPayment.set(false);
        let text = `Order ${order.id} is confirmed for $${order.total.toFixed(2)}. We will contact you via email to confirm shipping details.`;
        if (order.accountCreated) {
          text += password
            ? ' We also created your ProTectVinyl account — check your email to verify your address.'
            : ' We also created your ProTectVinyl account — check your email to verify your address and set your password.';
        }
        Swal.fire({
          title: 'Thank you for your order!',
          text,
          icon: 'success'
        });
        this.cartService.clearCart();
        this.resetCheckout();
      },
      error: () => {
        this.processingPayment.set(false);
        Swal.fire({
          title: 'Payment received, order pending',
          text: `Your payment succeeded, but we could not finalize order ${orderId} automatically. Please contact support and reference this order ID.`,
          icon: 'warning'
        });
      }
    });
  }

  private handleRedirectReturn() {
    const params = new URLSearchParams(window.location.search);
    const orderId = params.get('orderId');
    const sessionId = params.get('session_id');
    const redirectStatus = params.get('redirect_status');
    // Stripe may return with session_id and/or redirect_status after auth.
    if (!orderId || (!sessionId && redirectStatus !== 'succeeded')) {
      return;
    }
    window.history.replaceState(null, '', window.location.pathname);
    this.processingPayment.set(true);
    this.finalizeOrder(orderId);
  }

  private unmountElements() {
    this.expressCheckout?.unmount();
    this.contactDetails?.unmount();
    this.shippingAddress?.unmount();
    this.billingAddress?.unmount();
    this.paymentElement?.unmount();
    this.expressCheckout = null;
    this.contactDetails = null;
    this.shippingAddress = null;
    this.billingAddress = null;
    this.paymentElement = null;
    this.checkout = null;
    this.actions = null;
    this.actionsReady.set(false);
  }

  private resetCheckout() {
    this.couponCodeControl.setValue('');
    this.individualNameControl.reset('');
    this.phoneControl.reset('');
    this.accountPasswordControl.reset('');
    this.showAccountPassword.set(false);
    this.individualNameValid.set(false);
    this.phoneValid.set(false);
    this.couponStatus.set('idle');
    this.couponError.set(null);
    this.teardownSession();
  }
}
