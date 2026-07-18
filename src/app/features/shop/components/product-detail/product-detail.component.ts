import { Component, inject, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ProductService } from '../../../../core/services/product.service';
import { VinylProtector } from '../../../../core/models/product.model';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { CartService, CartItemSize, CartItemFinish } from '../../../../core/services/cart.service';
import Swal from 'sweetalert2';

export const PRIMED_FINISH: CartItemFinish = {
  id: 'primed',
  kind: 'primed',
  label: 'Primed white (paint-ready)',
  hex: '#F4F1EA',
  surcharge: 0
};

export const PAINT_MATCH_FEE = 15;

// e.g. "SW 7008", "sw7008", "7008"
const SW_CODE_PATTERN = /^(SW[\s-]?)?\d{4}$/i;

const WIDTH_RANGE = { min: 6, max: 96 };
const HEIGHT_RANGE = { min: 2, max: 24 };

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavbarComponent, RouterLink],
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss']
})
export class ProductDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private fb = inject(FormBuilder);

  product?: VinylProtector;
  notFound = false;

  readonly widthRange = WIDTH_RANGE;
  readonly heightRange = HEIGHT_RANGE;
  readonly primedFinish = PRIMED_FINISH;
  readonly paintMatchFee = PAINT_MATCH_FEE;

  stockColors = this.productService.stockColors;

  sizeForm = this.fb.group({
    mode: this.fb.nonNullable.control<'standard' | 'custom'>('standard'),
    standardSizeId: ['', Validators.required],
    customWidth: [null as number | null],
    customHeight: [null as number | null],
    finishId: this.fb.nonNullable.control('primed', Validators.required),
    paintCode: ['']
  });

  constructor() {
    this.sizeForm.controls.mode.valueChanges.subscribe(mode => this.applyModeValidators(mode));
    this.sizeForm.controls.finishId.valueChanges.subscribe(finishId => this.applyFinishValidators(finishId));
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.notFound = false;
        this.productService.getProduct(id).subscribe({
          next: product => {
            this.product = product;
            this.sizeForm.patchValue({ standardSizeId: product.availableSizes[0]?.id ?? '' });
          },
          error: () => {
            this.product = undefined;
            this.notFound = true;
          }
        });
      }
    });
  }

  get isCustomMode() {
    return this.sizeForm.controls.mode.value === 'custom';
  }

  get isPaintMatch() {
    return this.sizeForm.controls.finishId.value === 'paint-match';
  }

  addToCart() {
    if (!this.product) {
      return;
    }
    if (this.sizeForm.invalid) {
      this.sizeForm.markAllAsTouched();
      return;
    }

    const size = this.selectedSize();
    const finish = this.selectedFinish();
    this.cartService.addToCart(this.product, size, finish);
    Swal.fire({
      title: 'Added to cart',
      text: `${this.product.name} (${size.label}, ${finish.label}) has been added to your cart.`,
      icon: 'success',
      confirmButtonText: 'Continue shopping'
    });
  }

  // Public: the template uses it to live-preview the selected finish color
  selectedFinish(): CartItemFinish {
    const { finishId, paintCode } = this.sizeForm.getRawValue();
    if (finishId === 'primed') {
      return PRIMED_FINISH;
    }
    if (finishId === 'paint-match') {
      const swNumber = (paintCode ?? '').replace(/\D/g, '');
      return {
        id: `sw-${swNumber}`,
        kind: 'paint-match',
        paintCode: `SW ${swNumber}`,
        label: `Paint match — SW ${swNumber}`,
        hex: PRIMED_FINISH.hex,
        surcharge: PAINT_MATCH_FEE
      };
    }
    const color = this.stockColors().find(c => c.id === finishId)!;
    return { id: color.id, kind: 'stock', label: color.name, hex: color.hex, surcharge: 0 };
  }

  private applyFinishValidators(finishId: string) {
    const { paintCode } = this.sizeForm.controls;
    if (finishId === 'paint-match') {
      paintCode.setValidators([Validators.required, Validators.pattern(SW_CODE_PATTERN)]);
    } else {
      paintCode.clearValidators();
    }
    paintCode.updateValueAndValidity();
  }

  private selectedSize(): CartItemSize {
    const value = this.sizeForm.getRawValue();
    if (value.mode === 'standard') {
      const standard = this.product!.availableSizes.find(s => s.id === value.standardSizeId)!;
      return {
        kind: 'standard',
        sizeId: standard.id,
        label: standard.label,
        widthInches: standard.widthInches,
        heightInches: standard.heightInches
      };
    }
    return {
      kind: 'custom',
      label: `Custom — ${value.customWidth}" × ${value.customHeight}"`,
      widthInches: value.customWidth!,
      heightInches: value.customHeight!
    };
  }

  private applyModeValidators(mode: 'standard' | 'custom') {
    const { standardSizeId, customWidth, customHeight } = this.sizeForm.controls;
    if (mode === 'custom') {
      standardSizeId.clearValidators();
      customWidth.setValidators([
        Validators.required,
        Validators.min(WIDTH_RANGE.min),
        Validators.max(WIDTH_RANGE.max)
      ]);
      customHeight.setValidators([
        Validators.required,
        Validators.min(HEIGHT_RANGE.min),
        Validators.max(HEIGHT_RANGE.max)
      ]);
    } else {
      standardSizeId.setValidators(Validators.required);
      customWidth.clearValidators();
      customHeight.clearValidators();
    }
    standardSizeId.updateValueAndValidity();
    customWidth.updateValueAndValidity();
    customHeight.updateValueAndValidity();
  }
}
