import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SupersetService } from '../../core/services/superset.service';
import { DashboardService } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header avec style cohérent -->
      <div class="px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-800">{{ title() }}</h2>
      </div>
      @if (error()) {
        <div class="p-6 bg-red-50 text-red-600 border-b border-red-200">{{ error() }}</div>
      }
      <div #dashboardContainer class="flex-1 w-full bg-gray-50" style="min-height: 0;"></div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
      height: 100%;
      width: 100%;
    }
    :host ::ng-deep #superset-embedded-container {
      width: 100% !important;
      height: 100% !important;
    }
    :host ::ng-deep iframe {
      width: 100% !important;
      height: 100% !important;
      border: none;
    }
  `],
})
export class DashboardViewComponent implements OnInit, OnDestroy {
  @ViewChild('dashboardContainer', { static: true })
  container!: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly supersetService = inject(SupersetService);
  private readonly dashboardService = inject(DashboardService);

  title = signal('');
  error = signal('');

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
        this.error.set('Dashboard non trouvé');
        return;
      }

      this.title.set(dashboard.title);

      await this.supersetService.embedDashboard(
        dashboard.uuid,
        this.container.nativeElement
      );
    } catch (err) {
      this.error.set('Erreur lors du chargement du dashboard');
      console.error('Dashboard load error:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.container?.nativeElement) {
      this.container.nativeElement.innerHTML = '';
    }
  }
}

