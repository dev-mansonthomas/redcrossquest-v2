import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupersetService } from '../../core/services/superset.service';
import { DASHBOARD_UUIDS } from './dashboard.routes';

const DASHBOARD_TITLES: Record<string, string> = {
  cumul: 'Cumul Journalier',
  kpi: 'KPI Annuels',
  comptage: 'Comptage Trésorier',
  leaderboard: 'Leaderboard Collecteurs',
};

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  template: `
    <div class="h-full w-full flex flex-col">
      <div class="px-6 py-4 bg-white border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-800">{{ title }}</h2>
      </div>
      <div #dashboardContainer class="flex-1 w-full"></div>
    </div>
  `,
})
export class DashboardViewComponent implements OnInit, OnDestroy {
  @ViewChild('dashboardContainer', { static: true })
  container!: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supersetService = inject(SupersetService);

  title = '';

  ngOnInit(): void {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (slug && DASHBOARD_UUIDS[slug]) {
      this.title = DASHBOARD_TITLES[slug] ?? slug;
      this.supersetService.embedDashboard(
        DASHBOARD_UUIDS[slug],
        this.container.nativeElement
      );
    } else {
      this.router.navigate(['/dashboards']);
    }
  }

  ngOnDestroy(): void {
    if (this.container?.nativeElement) {
      this.container.nativeElement.innerHTML = '';
    }
  }
}

