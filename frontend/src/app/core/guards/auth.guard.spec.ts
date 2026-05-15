import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, runInInjectionContext, EnvironmentInjector } from '@angular/core';
import { authGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';
import { environment } from '../../../environments/environment';

@Component({ template: '', standalone: true })
class DummyComponent {}

const ME_URL = `${environment.apiUrl}/api/me`;

async function runGuard(): Promise<boolean | UrlTree> {
  const injector = TestBed.inject(EnvironmentInjector);
  return runInInjectionContext(injector, () => (authGuard as any)(null as any, null as any));
}

describe('authGuard', () => {
  let authService: AuthService;
  let router: Router;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideRouter([
          { path: 'login', component: DummyComponent },
          { path: 'dashboards', component: DummyComponent, canActivate: [authGuard] },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    authService = TestBed.inject(AuthService);
    router = TestBed.inject(Router);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('should redirect to login when no user in localStorage and no signal', async () => {
    const result = await runGuard();
    httpMock.expectNone(ME_URL);
    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
  });

  it('should allow access when user present and /api/me returns 200', async () => {
    authService.setUser({ email: 'old@example.com', name: 'Old', role: 1 });

    const promise = runGuard();
    const req = httpMock.expectOne(ME_URL);
    expect(req.request.method).toBe('GET');
    req.flush({
      email: 'fresh@example.com',
      role: 4,
      ul_id: 42,
      ul_name: 'PARIS07',
      role_name: 'Admin',
    });

    const result = await promise;
    expect(result).toBe(true);
    expect(authService.user()?.email).toBe('fresh@example.com');
    expect(authService.user()?.role).toBe(4);
    expect(authService.user()?.ul_id).toBe(42);
    expect(authService.user()?.name).toBe('Old');
  });

  it('should redirect to login and clear user when /api/me returns 401', async () => {
    authService.setUser({ email: 'test@example.com', name: 'Test' });
    expect(authService.user()).not.toBeNull();

    const promise = runGuard();
    const req = httpMock.expectOne(ME_URL);
    req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

    const result = await promise;
    expect(result instanceof UrlTree).toBe(true);
    expect(router.serializeUrl(result as UrlTree)).toBe('/login');
    expect(authService.user()).toBeNull();
    expect(localStorage.getItem('rcq_user')).toBeNull();
  });
});
