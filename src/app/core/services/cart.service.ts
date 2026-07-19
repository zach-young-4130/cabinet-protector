import { Injectable, computed, signal } from '@angular/core';
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

@Injectable({
  providedIn: 'root'
})
export class CartService {
  // The list of items in the cart
  private _items = signal<CartItem[]>([]);

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
      return [...current, { key, product, size, finish, quantity: 1 }];
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
}
