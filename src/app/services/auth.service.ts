import { Injectable, signal, computed, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { Observable } from 'rxjs';

export interface LoginResponse {
  name: string;
  email: string;
  roles: string[];
}

export interface User {
  name: string;
  email: string;
  roles: string[];
}

interface SessionData {
  expiry: number;
  user: User;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  http   = inject(HttpClient);
  router = inject(Router);

  user        = signal<User | null>(null);
  isLoggedIn  = computed(() => !!this.user());
  displayName = computed(() => {
    const prefix = this.user()?.email?.split('@')[0];
    if (!prefix) return null;
    return prefix.charAt(0).toUpperCase() + prefix.slice(1);
  });

  readonly apiBaseUrl = 'https://localhost:7251';

  private readonly SESSION_COOKIE      = 'tracksesh_session';
  private readonly SESSION_DURATION_MS = 15 * 60 * 1000; // 15 minutes

  private logoutTimer: ReturnType<typeof setTimeout> | null = null;
  private initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.initialize();
  }

  waitForInit(): Promise<boolean> {
    return this.initPromise.then(() => this.isLoggedIn());
  }

  login(email: string, password: string): Observable<LoginResponse> {
    return this.http.post<LoginResponse>(
      `${this.apiBaseUrl}/api/auth/login`,
      { email, password },
      { withCredentials: true }
    ).pipe(tap(res => this.setUser(res)));
  }

  register(email: string, password: string): Observable<void> {
    return this.http.post<void>(
      `${this.apiBaseUrl}/api/auth/register`,
      { email, password },
      { withCredentials: true }
    );
  }

  logout() {
    this.clearSession();
    this.http.post<void>(`${this.apiBaseUrl}/api/auth/logout`, {}, { withCredentials: true })
      .subscribe({ next: () => this.router.navigate(['/login']) });
  }

  setUser(updatedUser: User | null) {
    if (updatedUser) {
      const normalized: User = {
        name:  updatedUser.name,
        email: updatedUser.email,
        roles: updatedUser.roles.map(r => r.toLowerCase())
      };
      this.user.set(normalized);
      const expiry = Date.now() + this.SESSION_DURATION_MS;
      this.writeSession({ expiry, user: normalized });
      this.scheduleAutoLogout(expiry);
    } else {
      this.clearSession();
    }
  }

  // ── Session persistence ─────────────────────────────────────────────────────

  private initialize(): Promise<void> {
    const session = this.readSession();

    if (session && Date.now() < session.expiry) {
      this.user.set(session.user);
      this.scheduleAutoLogout(session.expiry);
    } else {
      this.eraseSessionCookie();
    }

    return Promise.resolve();
  }

  private scheduleAutoLogout(expiryMs: number) {
    if (this.logoutTimer !== null) clearTimeout(this.logoutTimer);
    const remaining = expiryMs - Date.now();
    this.logoutTimer = setTimeout(() => this.logout(), remaining > 0 ? remaining : 0);
  }

  private clearSession() {
    this.user.set(null);
    this.eraseSessionCookie();
    if (this.logoutTimer !== null) {
      clearTimeout(this.logoutTimer);
      this.logoutTimer = null;
    }
  }

  private writeSession(data: SessionData) {
    const expires = new Date(data.expiry).toUTCString();
    document.cookie =
      `${this.SESSION_COOKIE}=${encodeURIComponent(JSON.stringify(data))}; expires=${expires}; path=/; SameSite=Strict`;
  }

  private readSession(): SessionData | null {
    const match = document.cookie.match(new RegExp(`(?:^|; )${this.SESSION_COOKIE}=([^;]*)`));
    if (!match) return null;
    try { return JSON.parse(decodeURIComponent(match[1])); }
    catch { return null; }
  }

  private eraseSessionCookie() {
    document.cookie = `${this.SESSION_COOKIE}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Strict`;
  }
}
