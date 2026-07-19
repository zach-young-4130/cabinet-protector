import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { NavbarComponent } from '../../shared/components/navbar.component';
import { FooterComponent } from '../../shared/components/footer.component';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, NavbarComponent, FooterComponent],
  templateUrl: './reset-password.component.html'
})
export class ResetPasswordComponent {
  private auth = inject(AuthService);
  private token = inject(ActivatedRoute).snapshot.queryParamMap.get('token');

  missingToken = !this.token;
  passwordControl = inject(FormBuilder).nonNullable.control('', [
    Validators.required,
    Validators.minLength(8),
    Validators.maxLength(100)
  ]);
  submitting = signal(false);
  done = signal(false);
  error = signal<string | null>(null);

  submit() {
    if (this.passwordControl.invalid || !this.token) {
      this.passwordControl.markAsTouched();
      return;
    }
    this.submitting.set(true);
    this.error.set(null);
    this.auth.resetPassword(this.token, this.passwordControl.value).subscribe({
      next: () => {
        this.submitting.set(false);
        this.done.set(true);
      },
      error: err => {
        this.submitting.set(false);
        this.error.set(err?.error?.message ?? 'We could not reset your password. Please try again.');
      }
    });
  }
}
