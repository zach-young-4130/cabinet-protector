import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Observable } from 'rxjs';
import Swal from 'sweetalert2';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { FooterComponent } from '../../../../shared/components/footer.component';
import { AdminNavComponent } from '../../admin-nav.component';
import { AdminService } from '../../../../core/services/admin.service';
import { CustomerOrder } from '../../../../core/models/order.model';
import { orderStatusClass, refundLabel } from '../../../../shared/order-status';

@Component({
  selector: 'app-admin-order-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, NavbarComponent, FooterComponent, AdminNavComponent],
  templateUrl: './order-detail.component.html'
})
export class AdminOrderDetailComponent {
  private adminService = inject(AdminService);
  private fb = inject(FormBuilder);
  private orderId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';

  order = signal<CustomerOrder | null>(null);
  loadError = signal<string | null>(null);
  actionError = signal<string | null>(null);
  busy = signal(false);
  editingAddress = signal(false);

  refundAmountControl = this.fb.control<number | null>(null);
  addressControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.minLength(4),
    Validators.maxLength(500)
  ]);

  statusClass = orderStatusClass;
  refundLabel = refundLabel;

  constructor() {
    this.adminService.getOrder(this.orderId).subscribe({
      next: order => this.apply(order),
      error: err => this.loadError.set(
        err?.status === 404 ? 'Order not found.' : 'We could not load this order. Please try again.'
      )
    });
  }

  remaining(): number {
    const order = this.order();
    if (!order) {
      return 0;
    }
    return Math.round((order.total - order.refundAmount) * 100) / 100;
  }

  canCancel(): boolean {
    const status = this.order()?.status;
    return status === 'pending' || status === 'paid';
  }

  canShip(): boolean {
    return this.order()?.status === 'paid';
  }

  canDeliver(): boolean {
    const status = this.order()?.status;
    return status === 'paid' || status === 'shipped';
  }

  canRefund(): boolean {
    return this.order()?.status !== 'pending' && this.remaining() > 0;
  }

  async markStatus(status: 'shipped' | 'delivered') {
    const result = await Swal.fire({
      title: `Mark this order as ${status}?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: `Mark ${status}`
    });
    if (result.isConfirmed) {
      this.run(this.adminService.updateOrderStatus(this.orderId, status));
    }
  }

  async cancelOrder() {
    const result = await Swal.fire({
      title: 'Cancel this order?',
      text: 'This halts fulfillment. It does not refund the payment — use Refund for that.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Cancel order',
      cancelButtonText: 'Keep order'
    });
    if (result.isConfirmed) {
      this.run(this.adminService.cancelOrder(this.orderId));
    }
  }

  async refund() {
    const remaining = this.remaining();
    const raw = this.refundAmountControl.value;
    const amount = raw === null ? undefined : raw;
    if (amount !== undefined && (!(amount > 0) || amount > remaining)) {
      this.actionError.set(`Enter a refund between $0.01 and $${remaining.toFixed(2)}, or leave blank for the full remainder.`);
      return;
    }
    const result = await Swal.fire({
      title: `Refund $${(amount ?? remaining).toFixed(2)}?`,
      text: 'The refund is issued through Stripe and cannot be undone.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Issue refund'
    });
    if (result.isConfirmed) {
      this.run(this.adminService.refundOrder(this.orderId, amount), () => {
        this.refundAmountControl.setValue(null);
      });
    }
  }

  startEditAddress() {
    this.addressControl.setValue(this.order()?.customer?.address ?? '');
    this.editingAddress.set(true);
  }

  saveAddress() {
    if (this.addressControl.invalid) {
      this.addressControl.markAsTouched();
      return;
    }
    this.run(this.adminService.updateShippingAddress(this.orderId, this.addressControl.value.trim()), () => {
      this.editingAddress.set(false);
    });
  }

  cancelEditAddress() {
    this.editingAddress.set(false);
  }

  private apply(order: CustomerOrder) {
    this.order.set(order);
  }

  private run(action: Observable<CustomerOrder>, after?: () => void) {
    this.busy.set(true);
    this.actionError.set(null);
    action.subscribe({
      next: order => {
        this.apply(order);
        this.busy.set(false);
        after?.();
      },
      error: err => {
        this.busy.set(false);
        this.actionError.set(err?.error?.message ?? 'The action failed. Please try again.');
      }
    });
  }
}
