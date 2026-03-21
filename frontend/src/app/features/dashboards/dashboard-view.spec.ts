import { TestBed } from '@angular/core/testing';
import { provideRouter, ActivatedRoute, convertToParamMap } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { vi } from 'vitest';
import { DashboardViewComponent } from './dashboard-view';
import { SupersetService } from '../../core/services/superset.service';

vi.mock('@superset-ui/embedded-sdk', () => ({
  embedDashboard: vi.fn().mockResolvedValue(undefined),
}));

describe('DashboardViewComponent', () => {
  function createFixture(slug: string) {
    TestBed.configureTestingModule({
      imports: [DashboardViewComponent],
      providers: [
        provideRouter([{ path: 'dashboards', children: [] }]),
        provideHttpClient(),
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

  it('should set title for valid slug', () => {
    const fixture = createFixture('cumul');
    fixture.detectChanges();
    expect(fixture.componentInstance.title).toBe('Cumul Journalier');
  });

  it('should call embedDashboard for valid slug', () => {
    const fixture = createFixture('kpi');
    const supersetService = TestBed.inject(SupersetService);
    const spy = vi.spyOn(supersetService, 'embedDashboard').mockResolvedValue(undefined);
    fixture.detectChanges();
    expect(spy).toHaveBeenCalledWith(
      '47a5b11d-8963-4d9e-9d59-86611780678a',
      expect.any(HTMLElement)
    );
  });

  it('should navigate away for invalid slug', () => {
    const fixture = createFixture('invalid');
    fixture.detectChanges();
    expect(fixture.componentInstance.title).toBe('');
  });
});

