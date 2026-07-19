import { Injectable, computed, effect, signal } from '@angular/core';
import { VinylProtector } from '../models/product.model';

export interface CartItemSize {
  kind: 'standard' | 'custom';
  sizeId?: string;
  label: string;
  widthInches: number;
  heightInches: number;
}

export interface CartItemFinish {
  id: string;
  kind: 'primed' | 'stock' | 'paint-match';
  paintBrand?: string;
  paintCode?: string;
  label: string;
  hex: string;
  surcharge: number;
}

export interface CartItem {
  key: string;
  product: VinylProtector;
  size: CartItemSize;
  finish: CartItemFinish;
  quantity: number;
}

const CART_STORAGE_KEY = 'protect-vinyl.cart.v1';

@Injectable({
  providedIn: 'root'
})
export class CartService {
  private _items = signal<CartItem[]>(this.loadFromStorage());

  // Expose as a read-only signal
  public items = this._items.asReadonly();

  // Total number of units across all cart items
  public totalCount = computed(() =>
    this._items().reduce((sum, item) => sum + item.quantity, 0)
  );

  // Total price across all cart items, including per-strip finish surcharges
  public totalAmount = computed(() =>
    this._items().reduce((sum, item) => sum + this.unitPrice(item) * item.quantity, 0)
  );

  constructor() {
    // Persist cart (including embedded product snapshots) across refreshes.
    effect(() => {
      this.saveToStorage(this._items());
    });
  }

  // Price for one strip: product price plus any finish surcharge (e.g. paint match)
  unitPrice(item: CartItem): number {
    return item.product.price + item.finish.surcharge;
  }

  addToCart(product: VinylProtector, size: CartItemSize, finish: CartItemFinish) {
    const key = this.lineKey(product.id, size, finish);
    this._items.update(current => {
      const existing = current.find(item => item.key === key);
      if (existing) {
        return current.map(item =>
          item.key === key
            ? { ...item, quantity: item.quantity + 1 }
            : item
        );
      }
      // Snapshot the product onto the line so refresh survives catalog reloads.
      return [...current, { key, product: structuredClone(product), size, finish, quantity: 1 }];
    });
  }

  updateQuantity(key: string, amount: number) {
    this._items.update(current =>
      current.map(item =>
        item.key === key
          ? { ...item, quantity: Math.max(1, item.quantity + amount) }
          : item
      )
    );
  }

  removeFromCart(key: string) {
    this._items.update(current =>
      current.filter(item => item.key !== key)
    );
  }

  clearCart() {
    this._items.set([]);
  }

  // Same product in two sizes or finishes is two distinct cart lines
  private lineKey(productId: string, size: CartItemSize, finish: CartItemFinish): string {
    return `${productId}|${size.kind}|${size.widthInches}x${size.heightInches}|${finish.id}`;
  }

  private loadFromStorage(): CartItem[] {
    try {
      const raw = localStorage.getItem(CART_STORAGE_KEY);
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!Array.isArray(parsed)) {
        return [];
      }
      return parsed.filter((item): item is CartItem => this.isCartItem(item));
    } catch {
      return [];
    }
  }

  private saveToStorage(items: CartItem[]): void {
    try {
      localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Quota / private mode — cart still works in-memory for this session.
    }
  }

  private isCartItem(value: unknown): value is CartItem {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const item = value as Partial<CartItem>;
    return typeof item.key === 'string'
      && typeof item.quantity === 'number'
      && item.quantity >= 1
      && !!item.product
      && typeof item.product.id === 'string'
      && typeof item.product.name === 'string'
      && typeof item.product.price === 'number'
      && !!item.size
      && (item.size.kind === 'standard' || item.size.kind === 'custom')
      && typeof item.size.label === 'string'
      && typeof item.size.widthInches === 'number'
      && typeof item.size.heightInches === 'number'
      && !!item.finish
      && typeof item.finish.id === 'string'
      && (item.finish.kind === 'primed' || item.finish.kind === 'stock' || item.finish.kind === 'paint-match')
      && typeof item.finish.label === 'string'
      && typeof item.finish.hex === 'string'
      && typeof item.finish.surcharge === 'number';
  }
}
