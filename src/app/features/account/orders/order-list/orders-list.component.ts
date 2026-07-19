import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { FooterComponent } from '../../../../shared/components/footer.component';
import { OrderService } from '../../../../core/services/order.service';
import { CustomerOrder } from '../../../../core/models/order.model';
import { orderItemCount, orderStatusClass } from '../../../../shared/order-status';

@Component({
  selector: 'app-orders-list',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './orders-list.component.html'
})
export class OrdersListComponent {
  orders = signal<CustomerOrder[] | null>(null);
  error = signal<string | null>(null);

  constructor() {
    inject(OrderService).getOrders().subscribe({
      next: orders => this.orders.set(orders),
      error: () => this.error.set('We could not load your orders. Please try again.')
    });
  }

  itemCount = orderItemCount;
  statusClass = orderStatusClass;
}
