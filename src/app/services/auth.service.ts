import { Injectable, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { of } from 'rxjs';
import { tap } from 'rxjs/operators';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  token: string;
  name: string;
  email: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly TOKEN_KEY = 'tracksesh_token';
  private readonly USER_KEY = 'tracksesh_user';

  private _token = signal<string | null>(localStorage.getItem(this.TOKEN_KEY));
  private _user = signal<{ name: string; email: string } | null>(
    JSON.parse(localStorage.getItem(this.USER_KEY) ?? 'null')
  );

  isLoggedIn = computed(() => !!this._token());
  currentUser = computed(() => this._user());

  // Base URL — swap this once your ASP.NET API is running
  private readonly apiUrl = 'https://localhost:7001/api/auth';

  static readonly DEMO_EMAIL    = 'demo@tracksesh.com';
  static readonly DEMO_PASSWORD = 'demo1234';

  constructor(private http: HttpClient, private router: Router) {}

  login(payload: LoginRequest) {
    if (
      payload.email.trim().toLowerCase() === AuthService.DEMO_EMAIL &&
      payload.password === AuthService.DEMO_PASSWORD
    ) {
      const mockRes: AuthResponse = {
        token: 'demo-token',
        name:  'Demo User',
        email: AuthService.DEMO_EMAIL
      };
      return of(mockRes).pipe(tap(res => this.persist(res)));
    }
    return this.http.post<AuthResponse>(`${this.apiUrl}/login`, payload).pipe(
      tap(res => this.persist(res))
    );
  }

  register(payload: RegisterRequest) {
    return this.http.post<AuthResponse>(`${this.apiUrl}/register`, payload).pipe(
      tap(res => this.persist(res))
    );
  }

  logout() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    this._token.set(null);
    this._user.set(null);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return this._token();
  }

  private persist(res: AuthResponse) {
    localStorage.setItem(this.TOKEN_KEY, res.token);
    localStorage.setItem(this.USER_KEY, JSON.stringify({ name: res.name, email: res.email }));
    this._token.set(res.token);
    this._user.set({ name: res.name, email: res.email });
  }
}
