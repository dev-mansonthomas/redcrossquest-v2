import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';

export interface User {
  email: string;
  name: string;
  role?: number;
  ul_id?: number;
  ul_name?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  private readonly _user = signal<User | null>(null);
  readonly user = this._user.asReadonly();
  readonly isAuthenticated = computed(() => this._user() !== null);

  constructor() {
    this.loadUser();
  }

  private loadUser(): void {
    const stored = localStorage.getItem('rcq_user');
    if (stored) {
      try {
        this._user.set(JSON.parse(stored));
      } catch {
        localStorage.removeItem('rcq_user');
      }
    }
  }

  loginWithGoogle(): void {
    window.location.href = `${this.api['baseUrl']}/api/auth/login/google`;
  }

  setUser(user: User): void {
    this._user.set(user);
    localStorage.setItem('rcq_user', JSON.stringify(user));
  }

  logout(): void {
    this._user.set(null);
    localStorage.removeItem('rcq_user');
    localStorage.removeItem('rcq_token');
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem('rcq_token');
  }

  setToken(token: string): void {
    localStorage.setItem('rcq_token', token);
  }
}

