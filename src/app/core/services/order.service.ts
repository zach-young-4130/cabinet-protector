import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CustomerOrder } from '../models/order.model';

@Injectable({ providedIn: 'root' })
export class OrderService {
  private http = inject(HttpClient);

  getOrders() {
    return this.http.get<CustomerOrder[]>(`${environment.apiUrl}/orders`);
  }

  getOrder(id: string) {
    return this.http.get<CustomerOrder>(`${environment.apiUrl}/orders/${id}`);
  }
}
