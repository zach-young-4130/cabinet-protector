import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom, tap } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  emailVerified: boolean;
  hasPassword: boolean;
  createdAt: string;
}

// What the API actually returns. The privilege flags are deliberately absent
// from AuthUser: they are held in a memory-only signal and stripped before
// anything is persisted, so localStorage never contains (or is trusted for)
// admin status.
interface ServerUser extends AuthUser {
  isAdmin?: boolean;
  isBanned?: boolean;
}

interface ServerSession {
  token: string;
  user: ServerUser;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
}

const AUTH_STORAGE_KEY = 'protect-vinyl.auth.v1';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private _session = signal<AuthSession | null>(this.loadFromStorage());
  // Memory-only, populated exclusively from server responses. Never persisted.
  private _isAdmin = signal(false);

  public user = computed(() => this._session()?.user ?? null);
  public isLoggedIn = computed(() => this._session() !== null);
  public isAdmin = this._isAdmin.asReadonly();
  public firstName = computed(() => this.user()?.fullName.trim().split(/\s+/)[0] ?? '');

  constructor() {
    // Persist auth state across refreshes, same pattern as CartService.
    effect(() => {
      this.saveToStorage(this._session());
    });
    // Deferred a tick: the request runs the auth interceptor, which injects
    // this service — injecting it mid-construction would be circular.
    if (this._session()) {
      queueMicrotask(() => this.refreshUser());
    }
  }

  token(): string | null {
    return this._session()?.token ?? null;
  }

  signup(payload: { fullName: string; email: string; password: string }) {
    return this.http
      .post<ServerSession>(`${environment.apiUrl}/auth/signup`, payload)
      .pipe(tap(session => this.applySession(session)));
  }

  login(email: string, password: string) {
    return this.http
      .post<ServerSession>(`${environment.apiUrl}/auth/login`, { email, password })
      .pipe(tap(session => this.applySession(session)));
  }

  verifyEmail(token: string) {
    return this.http
      .post<ServerSession>(`${environment.apiUrl}/auth/verify-email`, { token })
      .pipe(tap(session => this.applySession(session)));
  }

  resetPassword(token: string, password: string) {
    return this.http
      .post<ServerSession>(`${environment.apiUrl}/auth/reset-password`, { token, password })
      .pipe(tap(session => this.applySession(session)));
  }

  setPassword(password: string) {
    return this.http
      .post<{ user: ServerUser }>(`${environment.apiUrl}/auth/password`, { password })
      .pipe(tap(({ user }) => this.applyUser(user)));
  }

  logout(): void {
    if (this.token()) {
      // Dispatches synchronously while the token is still set, so the
      // interceptor attaches it and the server can revoke the session.
      this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({ error: () => {} });
    }
    this.clearSession();
  }

  // Re-validates the stored token on app boot; a 401 clears the session via
  // the interceptor, a network failure keeps the cached (non-privileged) user.
  refreshUser(): void {
    this.http.get<{ user: ServerUser }>(`${environment.apiUrl}/auth/me`).subscribe({
      next: ({ user }) => this.applyUser(user),
      error: () => {}
    });
  }

  // Admin gate for routing: always resolves a fresh server answer, never
  // client state. Anything but a confirmed "yes" is a no.
  async verifyAdmin(): Promise<boolean> {
    if (!this.token()) {
      return false;
    }
    try {
      const { user } = await firstValueFrom(
        this.http.get<{ user: ServerUser }>(`${environment.apiUrl}/auth/me`)
      );
      this.applyUser(user);
      return user.isAdmin === true;
    } catch {
      return false;
    }
  }

  clearSession(): void {
    this._session.set(null);
    this._isAdmin.set(false);
  }

  private applySession(session: ServerSession): void {
    this._isAdmin.set(session.user.isAdmin === true);
    this._session.set({ token: session.token, user: this.stripPrivileges(session.user) });
  }

  private applyUser(serverUser: ServerUser): void {
    this._isAdmin.set(serverUser.isAdmin === true);
    this._session.update(s => (s ? { ...s, user: this.stripPrivileges(serverUser) } : s));
  }

  private stripPrivileges(serverUser: ServerUser): AuthUser {
    const { isAdmin, isBanned, ...user } = serverUser;
    return user;
  }

  private loadFromStorage(): AuthSession | null {
    try {
      const raw = localStorage.getItem(AUTH_STORAGE_KEY);
      if (!raw) {
        return null;
      }
      const parsed = JSON.parse(raw) as unknown;
      if (!this.isAuthSession(parsed)) {
        return null;
      }
      // Drop any privilege keys someone hand-injected into the stored JSON.
      return { token: parsed.token, user: this.stripPrivileges(parsed.user) };
    } catch {
      return null;
    }
  }

  private saveToStorage(session: AuthSession | null): void {
    try {
      if (session) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
      } else {
        localStorage.removeItem(AUTH_STORAGE_KEY);
      }
    } catch {
      // Quota / private mode — auth still works in-memory for this session.
    }
  }

  private isAuthSession(value: unknown): value is AuthSession {
    if (!value || typeof value !== 'object') {
      return false;
    }
    const session = value as Partial<AuthSession>;
    const user = session.user as Partial<AuthUser> | undefined;
    return typeof session.token === 'string'
      && !!user
      && typeof user.id === 'string'
      && typeof user.email === 'string'
      && typeof user.fullName === 'string'
      && typeof user.emailVerified === 'boolean'
      && typeof user.hasPassword === 'boolean';
  }
}
