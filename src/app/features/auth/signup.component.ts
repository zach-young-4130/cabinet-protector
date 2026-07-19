import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import Swal from 'sweetalert2';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { FooterComponent } from '../../shared/components/footer.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './signup.component.html'
})
export class SignupComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  form = this.fb.nonNullable.group({
    fullName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(100)]]
  });

  submitting = signal(false);
  error = signal<string | null>(null);

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.auth.signup(this.form.getRawValue()).subscribe({
      next: () => {
        void Swal.fire({
          title: 'Welcome to ProTectVinyl!',
          text: 'Your account is ready. We sent you an email — click the link inside to verify your address.',
          icon: 'success'
        });
        void this.router.navigateByUrl(this.route.snapshot.queryParamMap.get('returnUrl') || '/home');
      },
      error: err => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'Signup failed. Please try again.');
      }
    });
  }
}
