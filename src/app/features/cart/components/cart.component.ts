import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../shared/components/navbar.component';
import { CartItem, CartService } from '../../../core/services/cart.service';

@Component({
  selector: 'app-cart',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent],
  templateUrl: './cart.component.html',
  styleUrls: ['./cart.component.scss']
})
export class CartComponent {
  private cartService = inject(CartService);

  items = this.cartService.items;
  totalAmount = this.cartService.totalAmount;

  increaseQuantity(key: string) {
    this.cartService.updateQuantity(key, 1);
  }

  decreaseQuantity(key: string) {
    this.cartService.updateQuantity(key, -1);
  }

  removeItem(key: string) {
    this.cartService.removeFromCart(key);
  }

  // Unique spoken description for a cart line (same product can differ by size or finish)
  itemLabel(item: CartItem): string {
    return `${item.product.name}, ${item.size.label}, ${item.finish.label}`;
  }

  unitPrice(item: CartItem): number {
    return this.cartService.unitPrice(item);
  }
}
