import { Component, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../../../core/services/product.service';
import { VinylProtector } from '../../../../core/models/product.model';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { FooterComponent } from '../../../../shared/components/footer.component';

@Component({
  selector: 'app-product-list',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './product-list.component.html',
  styleUrls: ['./product-list.component.scss']
})
export class ProductListComponent implements OnInit {
  private productService = inject(ProductService);

  products = this.productService.products;
  productsStatus = this.productService.productsStatus;
  stockColors = this.productService.stockColors;

  ngOnInit(): void {
    this.productService.loadProducts();
  }

  retry(): void {
    this.productService.loadProducts();
  }

  // Vary the illustrated strip color per card, skipping the near-white swatches
  stripColor(index: number): string {
    const colors = this.stockColors();
    if (colors.length === 0) {
      return '#8a9a8b';
    }
    return colors[(index + 2) % colors.length].hex;
  }

  sizeSummary(product: VinylProtector): string {
    return product.availableSizes.map(s => s.label).join(' · ');
  }
}
