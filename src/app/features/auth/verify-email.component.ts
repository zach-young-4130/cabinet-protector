import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { FooterComponent } from '../../shared/components/footer.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-verify-email',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './verify-email.component.html'
})
export class VerifyEmailComponent {
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private fb = inject(FormBuilder);

  status = signal<'verifying' | 'success' | 'error'>('verifying');
  error = signal<string | null>(null);

  // Accounts created at checkout without a password finish setup here.
  needsPassword = computed(() => this.auth.user()?.hasPassword === false);
  passwordControl = this.fb.nonNullable.control('', [
    Validators.required,
    Validators.minLength(8),
    Validators.maxLength(100)
  ]);
  savingPassword = signal(false);
  passwordSaved = signal(false);
  passwordError = signal<string | null>(null);

  constructor() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.status.set('error');
      this.error.set('This verification link is missing its token.');
      return;
    }
    this.auth.verifyEmail(token).subscribe({
      next: () => this.status.set('success'),
      error: err => {
        this.status.set('error');
        this.error.set(err?.error?.message ?? 'We could not verify your email. Please try again.');
      }
    });
  }

  savePassword() {
    if (this.passwordControl.invalid) {
      this.passwordControl.markAsTouched();
      return;
    }
    this.savingPassword.set(true);
    this.passwordError.set(null);
    this.auth.setPassword(this.passwordControl.value).subscribe({
      next: () => {
        this.savingPassword.set(false);
        this.passwordSaved.set(true);
      },
      error: err => {
        this.savingPassword.set(false);
        this.passwordError.set(err?.error?.message ?? 'We could not save your password. Please try again.');
      }
    });
  }
}
