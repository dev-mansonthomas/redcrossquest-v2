import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { DashboardViewComponent } from './dashboard-view';
import { SupersetService } from '../../core/services/superset.service';
import { DashboardService } from '../../core/services/dashboard.service';

vi.mock('@superset-ui/embedded-sdk', () => ({
  embedDashboard: vi.fn().mockResolvedValue(undefined),
}));

const MOCK_DASHBOARDS = [
  { key: 'kpi_yearly', uuid: '47a5b11d-8963-4d9e-9d59-86611780678a', title: 'KPI Annuels' },
  { key: 'counting_treasurer', uuid: 'aaa-bbb', title: 'Comptage Trésorier' },
];

describe('DashboardViewComponent', () => {
  let mockDashboardService: { loadDashboards: ReturnType<typeof vi.fn>; getDashboardBySlug: ReturnType<typeof vi.fn> };

  function createFixture(slug: string) {
    mockDashboardService = {
      loadDashboards: vi.fn().mockResolvedValue(undefined),
      getDashboardBySlug: vi.fn((s: string) => {
        const keyMapping: Record<string, string> = {
          'cumul': 'kpi_yearly',
          'kpi': 'kpi_yearly',
          'comptage': 'counting_treasurer',
          'leaderboard': 'leaderboard_current_year',
        };
        const backendKey = keyMapping[s] || s;
        return MOCK_DASHBOARDS.find(d => d.key === backendKey);
      }),
    };

    TestBed.configureTestingModule({
      imports: [DashboardViewComponent],
      providers: [
        provideRouter([{ path: 'dashboards', children: [] }]),
        provideHttpClient(),
        { provide: DashboardService, useValue: mockDashboardService },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: {
              paramMap: convertToParamMap({ slug }),
            },
          },
        },
      ],
    });
    return TestBed.createComponent(DashboardViewComponent);
  }

  it('should create', () => {
    const fixture = createFixture('cumul');
    expect(fixture.componentInstance).toBeTruthy();
  });

  it('should set title for valid slug after loading', async () => {
    const fixture = createFixture('cumul');
    await fixture.componentInstance.ngOnInit();
    expect(mockDashboardService.loadDashboards).toHaveBeenCalled();
    expect(fixture.componentInstance.title).toBe('KPI Annuels');
    expect(fixture.componentInstance.loading).toBe(false);
  });

  it('should call embedDashboard for valid slug', async () => {
    const fixture = createFixture('kpi');
    const supersetService = TestBed.inject(SupersetService);
    const spy = vi.spyOn(supersetService, 'embedDashboard').mockResolvedValue(undefined);
    await fixture.componentInstance.ngOnInit();
    expect(spy).toHaveBeenCalledWith(
      '47a5b11d-8963-4d9e-9d59-86611780678a',
      expect.any(HTMLElement)
    );
  });

  it('should show error for invalid slug', async () => {
    const fixture = createFixture('invalid');
    await fixture.componentInstance.ngOnInit();
    expect(fixture.componentInstance.title).toBe('');
    expect(fixture.componentInstance.error).toBe('Dashboard non trouvé');
    expect(fixture.componentInstance.loading).toBe(false);
  });

  it('should handle loadDashboards failure', async () => {
    const fixture = createFixture('cumul');
    mockDashboardService.loadDashboards.mockRejectedValue(new Error('Network error'));
    await fixture.componentInstance.ngOnInit();
    expect(fixture.componentInstance.error).toBe('Erreur lors du chargement du dashboard');
    expect(fixture.componentInstance.loading).toBe(false);
  });
});

