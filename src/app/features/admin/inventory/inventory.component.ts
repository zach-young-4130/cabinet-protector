import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import Swal from 'sweetalert2';
import { NavbarComponent } from '../../../shared/components/navbar.component';
import { FooterComponent } from '../../../shared/components/footer.component';
import { AdminNavComponent } from '../admin-nav.component';
import { AdminService, StockColor } from '../../../core/services/admin.service';
import { CustomerOrder } from '../../../core/models/order.model';
import { PAINT_BRANDS, DEFAULT_PAINT_BRAND_ID, findPaintBrand } from '../../../shared/constants/paint-brands';

const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

@Component({
  selector: 'app-admin-inventory',
  standalone: true,
  imports: [CommonModule, RouterLink, ReactiveFormsModule, NavbarComponent, FooterComponent, AdminNavComponent],
  templateUrl: './inventory.component.html'
})
export class AdminInventoryComponent {
  private adminService = inject(AdminService);
  private fb = inject(FormBuilder);

  colors = signal<StockColor[] | null>(null);
  colorsError = signal<string | null>(null);
  // The manufacturing work queue: paid orders waiting to ship.
  queue = signal<CustomerOrder[] | null>(null);
  queueError = signal<string | null>(null);
  busy = signal(false);
  editingId = signal<string | null>(null);

  readonly paintBrands = PAINT_BRANDS;
  brandName = (brandId: string) => findPaintBrand(brandId).name;

  addForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    hex: ['#f5f1e8', [Validators.required, Validators.pattern(HEX_PATTERN)]],
    brand: this.fb.nonNullable.control<string>(DEFAULT_PAINT_BRAND_ID, Validators.required)
  });
  editForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(60)]],
    hex: ['#000000', [Validators.required, Validators.pattern(HEX_PATTERN)]],
    brand: this.fb.nonNullable.control<string>(DEFAULT_PAINT_BRAND_ID, Validators.required)
  });

  constructor() {
    this.adminService.getStockColors().subscribe({
      next: colors => this.colors.set(colors),
      error: () => this.colorsError.set('We could not load stock colors.')
    });
    this.adminService.getOrders('paid').subscribe({
      next: orders => this.queue.set(orders),
      error: () => this.queueError.set('We could not load the fulfillment queue.')
    });
  }

  addColor() {
    if (this.addForm.invalid) {
      this.addForm.markAllAsTouched();
      return;
    }
    const { name, hex, brand } = this.addForm.getRawValue();
    this.busy.set(true);
    this.adminService.createStockColor(name.trim(), hex, brand).subscribe({
      next: color => {
        this.colors.update(list => (list ? [...list, color] : [color]));
        this.addForm.reset({ name: '', hex: '#f5f1e8', brand: DEFAULT_PAINT_BRAND_ID });
        this.busy.set(false);
      },
      error: err => this.fail(err)
    });
  }

  startEdit(color: StockColor) {
    this.editForm.setValue({ name: color.name, hex: color.hex, brand: color.brand });
    this.editingId.set(color.id);
  }

  cancelEdit() {
    this.editingId.set(null);
  }

  saveEdit() {
    const id = this.editingId();
    if (!id || this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }
    const { name, hex, brand } = this.editForm.getRawValue();
    this.busy.set(true);
    this.adminService.updateStockColor(id, { name: name.trim(), hex, brand }).subscribe({
      next: updated => {
        this.colors.update(list => list?.map(c => (c.id === updated.id ? updated : c)) ?? list);
        this.editingId.set(null);
        this.busy.set(false);
      },
      error: err => this.fail(err)
    });
  }

  async removeColor(color: StockColor) {
    const result = await Swal.fire({
      title: `Remove ${color.name}?`,
      text: 'New orders can no longer select it. Past orders are unaffected.',
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Remove color'
    });
    if (!result.isConfirmed) {
      return;
    }
    this.busy.set(true);
    this.adminService.deleteStockColor(color.id).subscribe({
      next: () => {
        this.colors.update(list => list?.filter(c => c.id !== color.id) ?? list);
        this.busy.set(false);
      },
      error: err => this.fail(err)
    });
  }

  async markShipped(order: CustomerOrder) {
    const result = await Swal.fire({
      title: `Mark order ${order.id.slice(0, 8).toUpperCase()} as shipped?`,
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Mark shipped'
    });
    if (!result.isConfirmed) {
      return;
    }
    this.busy.set(true);
    this.adminService.updateOrderStatus(order.id, 'shipped').subscribe({
      next: () => {
        this.queue.update(list => list?.filter(o => o.id !== order.id) ?? list);
        this.busy.set(false);
      },
      error: err => this.fail(err)
    });
  }

  private fail(err: { error?: { message?: string } }) {
    this.busy.set(false);
    void Swal.fire({
      title: 'Action failed',
      text: err?.error?.message ?? 'Please try again.',
      icon: 'error'
    });
  }
}
