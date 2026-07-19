import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { FooterComponent } from '../../../../shared/components/footer.component';
import { OrderService } from '../../../../core/services/order.service';
import { CustomerOrder } from '../../../../core/models/order.model';
import { orderStatusClass } from '../../../../shared/order-status';

@Component({
  selector: 'app-order-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './order-detail.component.html'
})
export class OrderDetailComponent {
  order = signal<CustomerOrder | null>(null);
  error = signal<string | null>(null);

  constructor() {
    const id = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
    inject(OrderService).getOrder(id).subscribe({
      next: order => this.order.set(order),
      error: err => this.error.set(
        err?.status === 404
          ? 'We could not find that order.'
          : 'We could not load this order. Please try again.'
      )
    });
  }

  statusClass = orderStatusClass;
}
