import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { CustomerOrder } from '../models/order.model';
import { AuthUser } from './auth.service';

export interface AdminUser extends AuthUser {
  isAdmin: boolean;
  isBanned: boolean;
}

export interface StockColor {
  id: string;
  name: string;
  hex: string;
  brand: string;
}

// Every route this calls re-verifies is_admin server-side.
@Injectable({ providedIn: 'root' })
export class AdminService {
  private http = inject(HttpClient);
  private base = `${environment.apiUrl}/admin`;

  // Public catalog endpoint — fetched here so the inventory page owns a
  // refreshable copy independent of ProductService's one-shot signal.
  getStockColors() {
    return this.http.get<StockColor[]>(`${environment.apiUrl}/stock-colors`);
  }

  getOrders(status?: string) {
    return this.http.get<CustomerOrder[]>(`${this.base}/orders`, {
      params: status ? { status } : {}
    });
  }

  getOrder(id: string) {
    return this.http.get<CustomerOrder>(`${this.base}/orders/${id}`);
  }

  // Omit amount to refund everything remaining on the order.
  refundOrder(id: string, amount?: number) {
    return this.http.post<CustomerOrder>(`${this.base}/orders/${id}/refund`, amount ? { amount } : {});
  }

  cancelOrder(id: string) {
    return this.http.post<CustomerOrder>(`${this.base}/orders/${id}/cancel`, {});
  }

  updateOrderStatus(id: string, status: 'shipped' | 'delivered') {
    return this.http.patch<CustomerOrder>(`${this.base}/orders/${id}/status`, { status });
  }

  updateShippingAddress(id: string, address: string) {
    return this.http.patch<CustomerOrder>(`${this.base}/orders/${id}/shipping-address`, { address });
  }

  getUsers() {
    return this.http.get<AdminUser[]>(`${this.base}/users`);
  }

  setBanned(id: string, banned: boolean) {
    return this.http.patch<{ user: AdminUser }>(`${this.base}/users/${id}/ban`, { banned });
  }

  deleteUser(id: string) {
    return this.http.delete<void>(`${this.base}/users/${id}`);
  }

  changeEmail(id: string, email: string) {
    return this.http.patch<{ user: AdminUser }>(`${this.base}/users/${id}/email`, { email });
  }

  sendPasswordReset(id: string) {
    return this.http.post<void>(`${this.base}/users/${id}/password-reset`, {});
  }

  createStockColor(name: string, hex: string, brand: string) {
    return this.http.post<StockColor>(`${this.base}/stock-colors`, { name, hex, brand });
  }

  updateStockColor(id: string, changes: { name?: string; hex?: string; brand?: string }) {
    return this.http.patch<StockColor>(`${this.base}/stock-colors/${id}`, changes);
  }

  deleteStockColor(id: string) {
    return this.http.delete<void>(`${this.base}/stock-colors/${id}`);
  }
}
