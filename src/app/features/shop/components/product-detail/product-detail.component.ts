import { Component, inject, signal, OnInit } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ProductService } from '../../../../core/services/product.service';
import { VinylProtector } from '../../../../core/models/product.model';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { FooterComponent } from '../../../../shared/components/footer.component';
import { CartService, CartItemSize, CartItemFinish } from '../../../../core/services/cart.service';
import { PAINT_BRANDS, DEFAULT_PAINT_BRAND_ID, findPaintBrand, PaintBrandId } from '../../../../shared/constants/paint-brands';
import Swal from 'sweetalert2';

export const PRIMED_FINISH: CartItemFinish = {
  id: 'primed',
  kind: 'primed',
  label: 'Primed white (paint-ready)',
  hex: '#F4F1EA',
  surcharge: 0
};

export const PAINT_MATCH_FEE = 15;

const WIDTH_RANGE = { min: 6, max: 96 };
const HEIGHT_RANGE = { min: 2, max: 24 };

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, NavbarComponent, FooterComponent, RouterLink],
  templateUrl: './product-detail.component.html',
  styleUrls: ['./product-detail.component.scss']
})
export class ProductDetailComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private productService = inject(ProductService);
  private cartService = inject(CartService);
  private fb = inject(FormBuilder);

  product = signal<VinylProtector | undefined>(undefined);
  notFound = signal(false);

  readonly widthRange = WIDTH_RANGE;
  readonly heightRange = HEIGHT_RANGE;
  readonly primedFinish = PRIMED_FINISH;
  readonly paintMatchFee = PAINT_MATCH_FEE;
  readonly paintBrands = PAINT_BRANDS;

  stockColors = this.productService.stockColors;

  sizeForm = this.fb.group({
    mode: this.fb.nonNullable.control<'standard' | 'custom'>('standard'),
    standardSizeId: ['', Validators.required],
    customWidth: [null as number | null],
    customHeight: [null as number | null],
    finishId: this.fb.nonNullable.control('primed', Validators.required),
    paintBrand: this.fb.nonNullable.control<PaintBrandId>(DEFAULT_PAINT_BRAND_ID),
    paintCode: ['']
  });

  constructor() {
    this.sizeForm.controls.mode.valueChanges.subscribe(mode => this.applyModeValidators(mode));
    this.sizeForm.controls.finishId.valueChanges.subscribe(() => this.applyFinishValidators());
    this.sizeForm.controls.paintBrand.valueChanges.subscribe(() => this.applyFinishValidators());
  }

  ngOnInit(): void {
    this.route.params.subscribe(params => {
      const id = params['id'];
      if (id) {
        this.notFound.set(false);
        this.productService.getProduct(id).subscribe({
          next: product => {
            this.product.set(product);
            this.sizeForm.patchValue({ standardSizeId: product.availableSizes[0]?.id ?? '' });
          },
          error: () => {
            this.product.set(undefined);
            this.notFound.set(true);
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

  get selectedPaintBrand() {
    return findPaintBrand(this.sizeForm.controls.paintBrand.value);
  }

  brandName(brandId: string): string {
    return findPaintBrand(brandId).name;
  }

  addToCart() {
    const product = this.product();
    if (!product) {
      return;
    }
    if (this.sizeForm.invalid) {
      this.sizeForm.markAllAsTouched();
      return;
    }

    const size = this.selectedSize();
    const finish = this.selectedFinish();
    this.cartService.addToCart(product, size, finish);
    Swal.fire({
      title: 'Added to cart',
      text: `${product.name} (${size.label}, ${finish.label}) has been added to your cart.`,
      icon: 'success',
      showCancelButton: true,
      confirmButtonText: 'Go to cart',
      cancelButtonText: 'Continue shopping'
    }).then(result => {
      if (result.isConfirmed) {
        void this.router.navigate(['/cart']);
      }
    });
  }

  // Public: the template uses it to live-preview the selected finish color
  selectedFinish(): CartItemFinish {
    const { finishId, paintBrand, paintCode } = this.sizeForm.getRawValue();
    if (finishId === 'primed') {
      return PRIMED_FINISH;
    }
    if (finishId === 'paint-match') {
      const brand = findPaintBrand(paintBrand);
      const code = (paintCode ?? '').trim();
      return {
        id: `${brand.id}-${code}`,
        kind: 'paint-match',
        paintBrand: brand.id,
        paintCode: code,
        label: `Paint match — ${brand.name} ${code}`,
        hex: PRIMED_FINISH.hex,
        surcharge: PAINT_MATCH_FEE
      };
    }
    const color = this.stockColors().find(c => c.id === finishId)!;
    return { id: color.id, kind: 'stock', label: color.name, hex: color.hex, surcharge: 0 };
  }

  private applyFinishValidators() {
    const { finishId, paintCode } = this.sizeForm.controls;
    if (finishId.value === 'paint-match') {
      paintCode.setValidators([Validators.required, Validators.pattern(this.selectedPaintBrand.codePattern)]);
    } else {
      paintCode.clearValidators();
    }
    paintCode.updateValueAndValidity();
  }

  private selectedSize(): CartItemSize {
    const value = this.sizeForm.getRawValue();
    if (value.mode === 'standard') {
      const standard = this.product()!.availableSizes.find(s => s.id === value.standardSizeId)!;
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
