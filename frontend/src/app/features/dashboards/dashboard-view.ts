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
import { DashboardService } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  template: `
    <div class="h-full w-full flex flex-col">
      <div class="px-6 py-4 bg-white border-b border-gray-200">
        <h2 class="text-lg font-semibold text-gray-800">{{ title }}</h2>
      </div>
      @if (loading) {
        <div class="p-6 text-gray-600">Chargement du dashboard...</div>
      }
      @if (error) {
        <div class="p-6 text-red-600">{{ error }}</div>
      }
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
  private readonly dashboardService = inject(DashboardService);

  title = '';
  error = '';
  loading = true;

  async ngOnInit(): Promise<void> {
    const slug = this.route.snapshot.paramMap.get('slug');
    if (!slug) {
      this.router.navigate(['/dashboards']);
      return;
    }

    try {
      // Wait for dashboards to be loaded before looking up by slug
      await this.dashboardService.loadDashboards();

      const dashboard = this.dashboardService.getDashboardBySlug(slug);
      if (!dashboard) {
        this.error = 'Dashboard non trouvé';
        this.loading = false;
        return;
      }

      this.title = dashboard.title;
      this.loading = false;

      await this.supersetService.embedDashboard(
        dashboard.uuid,
        this.container.nativeElement
      );
    } catch (err) {
      this.error = 'Erreur lors du chargement du dashboard';
      this.loading = false;
      console.error('Dashboard load error:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.container?.nativeElement) {
      this.container.nativeElement.innerHTML = '';
    }
  }
}

