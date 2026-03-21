import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { Component } from '@angular/core';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { CallbackComponent } from './callback';
import { AuthService } from '../../core/services/auth.service';

@Component({ template: '', standalone: true })
class DummyComponent {}

describe('CallbackComponent', () => {
  function createFixture(queryParams: Record<string, string>) {
    TestBed.configureTestingModule({
      imports: [CallbackComponent],
      providers: [
        provideRouter([
          { path: 'dashboards', component: DummyComponent },
          { path: 'login', component: DummyComponent },
        ]),
        provideHttpClient(),
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

  it('should set token and user on valid callback', () => {
    const fixture = createFixture({
      token: 'test-token',
      name: 'Test User',
      email: 'test@example.com',
      role: '2',
      ul_id: '42',
    });
    const authService = TestBed.inject(AuthService);
    const spy = vi.spyOn(authService, 'setToken');
    const userSpy = vi.spyOn(authService, 'setUser');

    fixture.detectChanges();

    expect(spy).toHaveBeenCalledWith('test-token');
    expect(userSpy).toHaveBeenCalledWith({
      email: 'test@example.com',
      name: 'Test User',
      role: 2,
      ul_id: 42,
    });
  });

  it('should show error on error param', () => {
    const fixture = createFixture({ error: 'access_denied' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toContain('Erreur');
  });

  it('should show error when params are missing', () => {
    const fixture = createFixture({ token: 'abc' });
    fixture.detectChanges();
    expect(fixture.componentInstance.error).toContain('manquants');
  });
});

