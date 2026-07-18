import { Component, inject, signal }  from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { ProductService } from '../../core/services/product.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent],
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss']
})
export class HomeComponent {
  highlights = signal([
    { title: 'Paintable', desc: 'Primed vinyl surface accepts any interior latex or enamel paint, so the strip disappears into your existing finish.' },
    { title: 'Removable', desc: 'Peels away cleanly with no adhesive residue and no damage to the cabinet face underneath.' },
    { title: 'Customizable', desc: 'Cut-to-length at home with a utility knife, or order exact dimensions for a factory-cut fit to your cabinet run.' }
  ]);

  stats = signal([
    { value: '12,000+', label: 'Cabinet bases protected' },
    { value: '±1/16"', label: 'Custom-cut tolerance' },
    { value: '48 states', label: 'Shipped nationwide' },
    { value: '10 yr', label: 'Material warranty' }
  ]);

  stockColors = inject(ProductService).stockColors;

  steps = signal([
    { title: 'Measure', desc: 'Measure along the bottom of each cabinet run, and up from the floor to just above the strike zone. Our guide below shows exactly where to place the tape.' },
    { title: 'Choose your fit', desc: 'Pick a standard strip to trim at home, or send us your measurements for a custom cut to within 1/16 of an inch.' },
    { title: 'Paint', desc: 'Paint the primed strip to match your kitchen before it goes on — or leave the matte finish as-is.' },
    { title: 'Apply & enjoy', desc: 'Peel, align to the bottom edge of the cabinet, and smooth across. No tools required — swap or remove any time.' }
  ]);

  suppliers = signal([
    'KraftMaid', 'American Woodmark', 'Merillat', 'Aristokraft',
    'Diamond', 'Wellborn', 'Shenandoah', 'Thomasville'
  ]);

  testimonials = signal([
    {
      quote: 'We rolled these out across 40 accessible units. Wheelchair footrests were chipping every base cabinet within months — since the strips went on, our turnover punch lists dropped to zero cabinet repairs.',
      name: 'Dana M.',
      detail: 'Property renovation manager, Columbus OH'
    },
    {
      quote: 'Our cabinets are custom-built and run to the floor, so nothing off the shelf ever fits. I sent base measurements on Monday and had perfectly cut strips by Friday.',
      name: 'Priya S.',
      detail: 'Homeowner, Austin TX'
    },
    {
      quote: 'My chair\'s footrests used to catch the corner of every lower cabinet in the kitchen. A year with the strips on, and the doors underneath still look brand new.',
      name: 'Marcus T.',
      detail: 'Homeowner, Portland OR'
    }
  ]);

}
