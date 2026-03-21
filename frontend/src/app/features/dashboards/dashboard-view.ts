import {
  Component,
  ElementRef,
  OnInit,
  OnDestroy,
  ViewChild,
  inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { SupersetService } from '../../core/services/superset.service';

@Component({
  selector: 'app-dashboard-view',
  standalone: true,
  template: `
    <div class="h-full w-full">
      <div #dashboardContainer class="w-full h-[calc(100vh-64px)]"></div>
    </div>
  `,
})
export class DashboardViewComponent implements OnInit, OnDestroy {
  @ViewChild('dashboardContainer', { static: true })
  container!: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly supersetService = inject(SupersetService);

  ngOnInit(): void {
    const dashboardId = this.route.snapshot.paramMap.get('id');
    if (dashboardId) {
      this.supersetService.embedDashboard(
        dashboardId,
        this.container.nativeElement
      );
    }
  }

  ngOnDestroy(): void {
    // Clean up embedded iframe
    if (this.container?.nativeElement) {
      this.container.nativeElement.innerHTML = '';
    }
  }
}

