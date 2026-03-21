import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

@Component({ template: '', standalone: true })
class DummyComponent {}

describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: DummyComponent },
          { path: 'dashboards', component: DummyComponent, canActivate: [authGuard] },
        ]),
        provideHttpClient(),
      ],
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should redirect to login when not authenticated', async () => {
    const result = await router.navigateByUrl('/dashboards');
    expect(router.url).toBe('/login');
  });

  it('should allow access when authenticated', async () => {
    authService.setUser({ email: 'test@example.com', name: 'Test' });
    authService.setToken('token');
    const result = await router.navigateByUrl('/dashboards');
    expect(router.url).toBe('/dashboards');
  });
});

