import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface DashboardInfo {
  key: string;
  uuid: string;
  title: string;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  private readonly http = inject(HttpClient);
  private readonly _dashboards = signal<DashboardInfo[]>([]);

  readonly dashboards = this._dashboards.asReadonly();

  async loadDashboards(): Promise<void> {
    const response = await firstValueFrom(
      this.http.get<{ dashboards: DashboardInfo[] }>(
        `${environment.apiUrl}/api/superset/dashboards`
      )
    );
    this._dashboards.set(response.dashboards);
  }

  getDashboardUuid(key: string): string | undefined {
    return this._dashboards().find(d => d.key === key)?.uuid;
  }

  getDashboardBySlug(slug: string): DashboardInfo | undefined {
    // Map frontend slugs to backend keys
    const keyMapping: Record<string, string> = {
      'cumul': 'yearly_goal',
      'kpi': 'kpi_yearly',
      'comptage': 'counting_treasurer',
      'leaderboard': 'leaderboard_current_year',
    };
    const backendKey = keyMapping[slug] || slug;
    return this._dashboards().find(d => d.key === backendKey);
  }
}

