import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NavbarComponent } from '../../../shared/components/navbar.component';
import { FooterComponent } from '../../../shared/components/footer.component';
import { CartItem, CartService } from '../../../core/services/cart.service';
import { environment } from '../../../../environments/environment';
import Swal from 'sweetalert2';

@Component({
  selector: 'app-checkout',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavbarComponent, FooterComponent],
  templateUrl: './checkout.component.html',
  styleUrls: ['./checkout.component.scss']
})
export class CheckoutComponent {
  private cartService = inject(CartService);
  private fb = inject(FormBuilder);
  private http = inject(HttpClient);

  items = this.cartService.items;
  totalAmount = this.cartService.totalAmount;

  unitPrice(item: CartItem): number {
    return this.cartService.unitPrice(item);
  }

  // Simple form for capturing shipping info
  checkoutForm = this.fb.group({
    fullName: ['', [Validators.required]],
    email: ['', [Validators.required, Validators.email]],
    address: ['', [Validators.required]],
    phoneNumber: ['', [Validators.required]]
  });

  constructor() {}

  submitOrder() {
    if (this.checkoutForm.invalid || this.items().length === 0) {
      return;
    }

    const payload = {
      customer: this.checkoutForm.getRawValue(),
      items: this.items().map(item => ({
        productId: item.product.id,
        quantity: item.quantity,
        size: item.size.kind === 'standard'
          ? { kind: 'standard', sizeId: item.size.sizeId }
          : { kind: 'custom', widthInches: item.size.widthInches, heightInches: item.size.heightInches },
        finish: item.finish.kind === 'primed'
          ? { kind: 'primed' }
          : item.finish.kind === 'stock'
            ? { kind: 'stock', colorId: item.finish.id }
            : { kind: 'paint-match', paintBrand: item.finish.paintBrand, paintCode: item.finish.paintCode }
      }))
    };

    this.http.post<{ id: string; total: number }>(`${environment.apiUrl}/orders`, payload).subscribe({
      next: order => {
        Swal.fire({
          title: 'Thank you for your order!',
          text: `Order ${order.id} is confirmed for $${order.total.toFixed(2)}. We will contact you via email to confirm shipping details.`,
          icon: 'success'
        });
        this.cartService.clearCart();
        this.checkoutForm.reset();
      },
      error: () => {
        Swal.fire({
          title: 'Something went wrong',
          text: 'We could not place your order. Please try again in a moment.',
          icon: 'error'
        });
      }
    });
  }
}
