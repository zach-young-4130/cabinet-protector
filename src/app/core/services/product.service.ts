import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { FinishColor, VinylProtector } from '../models/product.model';
import { environment } from '../../../environments/environment';

export type ProductsStatus = 'loading' | 'loaded' | 'error';

@Injectable({
  providedIn: 'root'
})
export class ProductService {
  private http = inject(HttpClient);

  private _products = signal<VinylProtector[]>([]);
  readonly products = this._products.asReadonly();

  private _productsStatus = signal<ProductsStatus>('loading');
  readonly productsStatus = this._productsStatus.asReadonly();

  private _stockColors = signal<FinishColor[]>([]);
  readonly stockColors = this._stockColors.asReadonly();

  constructor() {
    this.http.get<FinishColor[]>(`${environment.apiUrl}/stock-colors`)
      .subscribe(colors => this._stockColors.set(colors));
  }

  // Called on every visit to /shop, and by the error state's retry button
  loadProducts() {
    this._productsStatus.set('loading');
    this.http.get<VinylProtector[]>(`${environment.apiUrl}/products`).subscribe({
      next: products => {
        this._products.set(products);
        this._productsStatus.set('loaded');
      },
      error: () => this._productsStatus.set('error')
    });
  }

  getProduct(id: string): Observable<VinylProtector> {
    return this.http.get<VinylProtector>(`${environment.apiUrl}/products/${id}`);
  }
}
