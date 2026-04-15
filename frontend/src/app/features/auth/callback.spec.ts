import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CallbackComponent } from './callback';
import { AuthService } from '../../core/services/auth.service';

@Component({ template: '', standalone: true })
class DummyComponent {}

describe('CallbackComponent', () => {
  let httpTesting: HttpTestingController;

  function createFixture(queryParams: Record<string, string>) {
    TestBed.configureTestingModule({
      imports: [CallbackComponent],
      providers: [
        provideRouter([
          { path: 'dashboards', component: DummyComponent },
          { path: 'login', component: DummyComponent },
        ]),
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              queryParamMap: convertToParamMap(queryParams),
            },
          },
        },
      ],
    });
    httpTesting = TestBed.inject(HttpTestingController);
    return TestBed.createComponent(CallbackComponent);
  }

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    const fixture = createFixture({});
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should fetch user from /api/me and set user on valid callback', () => {
    const fixture = createFixture({});
    const authService = TestBed.inject(AuthService);
    const userSpy = vi.spyOn(authService, 'setUser');

    fixture.detectChanges();

    const req = httpTesting.expectOne((r) => r.url.includes('/api/me'));
    req.flush({
      email: 'test@example.com',
      role: 2,
      ul_id: 42,
      ul_name: 'Paris 15',
      role_name: 'Opérateur',
    });

    expect(userSpy).toHaveBeenCalledWith({
      email: 'test@example.com',
      name: 'test@example.com',
      role: 2,
      ul_id: 42,
      ul_name: 'Paris 15',
      role_name: 'Opérateur',
    });
  });

  it('should show error on error param', () => {
    const fixture = createFixture({ error: 'access_denied' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toContain('Erreur');
  });

  it('should show error when /api/me fails', () => {
    const fixture = createFixture({});
    fixture.detectChanges();

    const req = httpTesting.expectOne((r) => r.url.includes('/api/me'));
    req.flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(fixture.componentInstance.error).toContain('récupération du profil');
  });
});

