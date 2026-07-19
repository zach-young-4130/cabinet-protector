import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { FooterComponent } from '../../shared/components/footer.component';

@Component({
  selector: 'app-about',
  standalone: true,
  imports: [CommonModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './about.component.html',
  styleUrls: ['./about.component.scss']
})
export class AboutComponent {
  values = signal([
    { title: 'Fit first', desc: 'A barrier strip only works if it disappears into the door. Every standard size is tested against real cabinet lines, and every custom cut is measured twice before it ships.' },
    { title: 'Kitchens are lived in', desc: 'Wheelchairs, walkers, vacuums, kids, dogs. We build for the way homes actually get used, not showroom conditions.' },
    { title: 'No kitchen left out', desc: 'National-brand, locally built, or refaced — if it has a floor-length door, we can protect its base. Custom measurements are a first-class product, not a special order.' }
  ]);

  audiences = signal([
    { title: 'Homeowners', desc: 'Protect a new kitchen or an accessible remodel — standard sizes ship fast and install in minutes.' },
    { title: 'Property managers', desc: 'Keep accessible units turnover-ready. Bulk pricing and repeatable sizing across floor plans.' },
    { title: 'Cabinet suppliers & shops', desc: 'We maintain base-width sizing charts for national cabinet lines and cut to spec for custom shops, so your installs stay pristine.' }
  ]);
}
