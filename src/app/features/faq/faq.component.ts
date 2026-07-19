import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { FooterComponent } from '../../shared/components/footer.component';
import { PAINT_BRANDS } from '../../shared/constants/paint-brands';

interface FaqLink {
  url: string;
  text: string;
}

type FaqCategory = 'product' | 'paint' | 'ordering' | 'care';

interface FaqItem {
  q: string;
  a: string;
  category: FaqCategory;
  links?: FaqLink[];
}

interface FaqCategoryOption {
  id: FaqCategory | 'all';
  label: string;
}

@Component({
  selector: 'app-faq',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './faq.component.html',
  styleUrls: ['./faq.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FaqComponent {
  readonly categories: FaqCategoryOption[] = [
    { id: 'all', label: 'All questions' },
    { id: 'product', label: 'Product & fit' },
    { id: 'paint', label: 'Paint & finish' },
    { id: 'ordering', label: 'Ordering & shipping' },
    { id: 'care', label: 'Care & support' }
  ];

  private readonly categoryLabels: Record<FaqCategory, string> = {
    product: 'Product & fit',
    paint: 'Paint & finish',
    ordering: 'Ordering & shipping',
    care: 'Care & support'
  };

  selectedCategory = signal<FaqCategory | 'all'>('all');

  faqs = signal<FaqItem[]>([
    {
      category: 'product',
      q: 'Why do the protectors only cover the bottom of the cabinet?',
      a: 'Because that\'s where the damage happens. On floor-length cabinets, wheelchair footrests, walker feet, vacuums, and shoes all strike the first few inches above the floor. A barrier strip across that zone stops chips and scuffs before they reach the door — without wrapping the whole cabinet in vinyl. Think of it as a kick plate you can paint.'
    },
    {
      category: 'paint',
      q: 'Can I paint the strips to match my cabinets?',
      a: 'Yes. Every strip ships with a factory-primed matte surface that accepts standard interior latex and enamel paints from any brand. Paint before installation for the cleanest finish — two thin coats with a foam roller gives a sprayed-on look — then peel and apply once dry.'
    },
    {
      category: 'paint',
      q: 'Do you sell pre-painted strips?',
      a: 'Yes. Our six most-requested colors — Alabaster White, Harbor Fog, Sagebrush, Midnight Navy, Clay Ridge, and Iron Ore — are pre-painted, in stock, and ready to ship. Choose the color under "Choose your finish" on any product page. Standard sizes in stock colors ship within 1 business day; pre-painted custom cuts follow the normal 3–5 day custom timeline.'
    },
    {
      category: 'paint',
      q: 'Can you paint-match my exact color?',
      a: 'Yes — for Sherwin-Williams, Benjamin Moore, and Behr colors. Choose "Paint match" under "Choose your finish", pick your brand, and enter the code from your paint can lid or swatch (e.g., SW 7008, OC-17, or M290-6). Don\'t have a can handy? Each brand\'s color-finding tool is linked below. We paint each strip to match before it ships for a $15-per-strip fee; paint-matched orders ship in 3–5 business days. For other paint brands, order primed and paint at home.',
      links: PAINT_BRANDS.map(brand => ({ url: brand.colorToolUrl, text: brand.colorToolLabel }))
    },
    {
      category: 'product',
      q: 'Will they fit my brand of cabinets?',
      a: 'We maintain base-width sizing charts for every major national cabinet supplier, so standard strips fit brands like KraftMaid, American Woodmark, and Merillat out of the box. Face-frame and frameless (Euro-style) cabinets are both supported.'
    },
    {
      category: 'product',
      q: 'What about custom or locally built cabinets?',
      a: 'Send us your base measurements — the width of the cabinet run and how high you want coverage, to the nearest 1/16 of an inch — and we cut each strip to order. There is no minimum quantity, and every custom order includes a printable measuring guide.'
    },
    {
      category: 'ordering',
      q: 'How do I enter custom measurements when ordering?',
      a: 'On any product page, choose "Custom measurements" instead of an available size, then enter the width (6"–96") and height (2"–24") in inches, down to 1/16". Measure width along the bottom edge of the cabinet run, and height from the floor to just above the highest strike point. The cut size appears on the cart line and in your order summary so you can double-check before placing the order.'
    },
    {
      category: 'care',
      q: 'Do they damage the cabinet finish when removed?',
      a: 'No. The low-tack adhesive is engineered to release cleanly from painted, laminate, and thermofoil surfaces without pulling finish or leaving residue, even after years of use.'
    },
    {
      category: 'product',
      q: 'How durable is the vinyl?',
      a: 'Standard Protect uses 20-mil vinyl for heavy repeated impact; Ultra-Thin Easy Grip uses a 10-mil low-profile sheet for tighter toe-kick and narrow-base installs. Both resist scratches, scuffs, moisture, and household cleaners, and carry a 10-year material warranty — the same grades used in commercial kitchen and healthcare casework.'
    },
    {
      category: 'care',
      q: 'How do I clean and maintain them?',
      a: 'Wipe with a damp cloth and any non-abrasive household cleaner. Painted strips can be cleaned the same way you clean painted trim. Avoid solvent-based cleaners, which can soften paint (on any surface, not just ours).'
    },
    {
      category: 'ordering',
      q: 'How fast do orders ship?',
      a: 'Standard sizes — primed or in any of the six in-stock colors — leave our facility within 1 business day. Custom cuts ship within 3–5 business days of measurement confirmation. We ship to all 48 contiguous states.'
    },
    {
      category: 'ordering',
      q: 'Do you take bulk or trade orders?',
      a: 'Yes. Property managers, builders, and cabinet shops get volume pricing and repeatable sizing profiles, so reorders for the same floor plan or cabinet line are one click. Reach out through checkout notes or your order confirmation email to set up a trade account.'
    },
    {
      category: 'care',
      q: 'What if a strip arrives with the wrong measurements?',
      a: 'If we cut it wrong, we recut and reship free. If a measurement was entered incorrectly, we offer a half-price recut — and our support team will help you re-measure so the second cut is right.'
    }
  ]);

  filteredFaqs = computed(() => {
    const selected = this.selectedCategory();
    const items = this.faqs();
    return selected === 'all' ? items : items.filter(item => item.category === selected);
  });

  groupedFaqs = computed(() => {
    const selected = this.selectedCategory();
    const items = this.filteredFaqs();

    if (selected !== 'all') {
      return [{
        id: selected,
        label: this.categoryLabels[selected],
        items
      }];
    }

    const order: FaqCategory[] = ['product', 'paint', 'ordering', 'care'];
    return order
      .map(id => ({
        id,
        label: this.categoryLabels[id],
        items: items.filter(item => item.category === id)
      }))
      .filter(group => group.items.length > 0);
  });

  selectCategory(category: FaqCategory | 'all'): void {
    this.selectedCategory.set(category);
  }

  itemId(groupId: string, index: number): string {
    return `${groupId}-${index}`;
  }
}
