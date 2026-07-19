import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import Swal from 'sweetalert2';
import { NavbarComponent } from '../../../../shared/components/navbar.component';
import { FooterComponent } from '../../../../shared/components/footer.component';
import { AdminNavComponent } from '../../admin-nav.component';
import { AdminService, AdminUser } from '../../../../core/services/admin.service';
import { AuthService } from '../../../../core/services/auth.service';

@Component({
  selector: 'app-admin-user-list',
  standalone: true,
  imports: [CommonModule, NavbarComponent, FooterComponent, AdminNavComponent],
  templateUrl: './user-list.component.html'
})
export class AdminUserListComponent {
  private adminService = inject(AdminService);

  me = inject(AuthService).user;
  users = signal<AdminUser[] | null>(null);
  error = signal<string | null>(null);
  busyId = signal<string | null>(null);

  constructor() {
    this.adminService.getUsers().subscribe({
      next: users => this.users.set(users),
      error: () => this.error.set('We could not load users. Please try again.')
    });
  }

  isSelf(user: AdminUser): boolean {
    return user.id === this.me()?.id;
  }

  async toggleBan(user: AdminUser) {
    const banning = !user.isBanned;
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: banning
        ? `This will ban ${user.email}. They will be logged out everywhere immediately and unable to log in.`
        : `This will unban ${user.email}. They will be able to log in again.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) {
      return;
    }
    this.busyId.set(user.id);
    this.adminService.setBanned(user.id, banning).subscribe({
      next: ({ user: updated }) => {
        this.replace(updated);
        this.busyId.set(null);
      },
      error: err => this.fail(err, user.id)
    });
  }

  async changeEmail(user: AdminUser) {
    const result = await Swal.fire({
      title: 'Change email address',
      text: `Current: ${user.email}. The new address starts unverified and receives a verification email.`,
      input: 'email',
      inputLabel: 'New email address',
      inputValue: user.email,
      showCancelButton: true,
      confirmButtonText: 'Change email'
    });
    if (!result.isConfirmed || !result.value || result.value === user.email) {
      return;
    }
    this.busyId.set(user.id);
    this.adminService.changeEmail(user.id, result.value).subscribe({
      next: ({ user: updated }) => {
        this.replace(updated);
        this.busyId.set(null);
        void Swal.fire({
          title: 'Email updated',
          text: `A verification email was sent to ${updated.email}.`,
          icon: 'success'
        });
      },
      error: err => this.fail(err, user.id)
    });
  }

  async sendReset(user: AdminUser) {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `This will send a password reset link to ${user.email}. The link works once and expires in 1 hour.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) {
      return;
    }
    this.busyId.set(user.id);
    this.adminService.sendPasswordReset(user.id).subscribe({
      next: () => {
        this.busyId.set(null);
        void Swal.fire({ title: 'Reset link sent', text: `Sent to ${user.email}.`, icon: 'success' });
      },
      error: err => this.fail(err, user.id)
    });
  }

  async deleteUser(user: AdminUser) {
    const result = await Swal.fire({
      title: 'Are you sure?',
      text: `This will permanently delete ${user.email}. Their orders are kept for records but unlinked from any account. This cannot be undone.`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Confirm',
      cancelButtonText: 'Cancel'
    });
    if (!result.isConfirmed) {
      return;
    }
    this.busyId.set(user.id);
    this.adminService.deleteUser(user.id).subscribe({
      next: () => {
        this.users.update(list => list?.filter(u => u.id !== user.id) ?? list);
        this.busyId.set(null);
      },
      error: err => this.fail(err, user.id)
    });
  }

  private replace(updated: AdminUser) {
    this.users.update(list => list?.map(u => (u.id === updated.id ? updated : u)) ?? list);
  }

  private fail(err: { error?: { message?: string } }, userId: string) {
    if (this.busyId() === userId) {
      this.busyId.set(null);
    }
    void Swal.fire({
      title: 'Action failed',
      text: err?.error?.message ?? 'Please try again.',
      icon: 'error'
    });
  }
}
