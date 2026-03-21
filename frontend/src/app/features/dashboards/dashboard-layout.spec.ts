import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { DashboardLayoutComponent } from './dashboard-layout';
import { AuthService } from '../../core/services/auth.service';

describe('DashboardLayoutComponent', () => {
  beforeEach(async () => {
    localStorage.clear();
    await TestBed.configureTestingModule({
      imports: [DashboardLayoutComponent],
      providers: [provideRouter([]), provideHttpClient()],
    }).compileComponents();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should display navigation links', () => {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Cumul Journalier');
    expect(el.textContent).toContain('KPI Annuels');
    expect(el.textContent).toContain('Comptage Trésorier');
    expect(el.textContent).toContain('Leaderboard');
  });

  it('should display logout button', () => {
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Déconnexion');
  });

  it('should display user name when authenticated', () => {
    const authService = TestBed.inject(AuthService);
    authService.setUser({ email: 'test@test.com', name: 'Jean Dupont' });
    const fixture = TestBed.createComponent(DashboardLayoutComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Jean Dupont');
  });
});

