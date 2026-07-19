import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { FooterComponent } from '../../../../shared/components/footer.component';
import { AdminNavComponent } from '../../admin-nav.component';
import { AdminService } from '../../../../core/services/admin.service';
import { CustomerOrder } from '../../../../core/models/order.model';
import { orderItemCount, orderStatusClass, refundLabel } from '../../../../shared/order-status';

@Component({
  selector: 'app-admin-order-list',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, NavbarComponent, FooterComponent, AdminNavComponent],
  templateUrl: './order-list.component.html'
})
export class AdminOrderListComponent {
  private adminService = inject(AdminService);

  statusFilter = inject(FormBuilder).nonNullable.control('');
  orders = signal<CustomerOrder[] | null>(null);
  error = signal<string | null>(null);

  itemCount = orderItemCount;
  statusClass = orderStatusClass;
  refundLabel = refundLabel;

  constructor() {
    this.load();
    this.statusFilter.valueChanges
      .pipe(takeUntilDestroyed())
      .subscribe(() => this.load());
  }

  private load() {
    this.orders.set(null);
    this.error.set(null);
    this.adminService.getOrders(this.statusFilter.value || undefined).subscribe({
      next: orders => this.orders.set(orders),
      error: () => this.error.set('We could not load orders. Please try again.')
    });
  }
}
