import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

export interface GlobalKPIs {
  nb_ul: number;
  nb_queteurs: number;
  total_heures: number;
  total_euros: number;
  total_pieces_euros: number;
  total_billets_euros: number;
  total_cb_euros: number;
  total_cheques_euros: number;
}

export interface YearlyStats {
  year: number;
  nb_ul: number;
  nb_queteurs: number;
  total_heures: number;
  total_euros: number;
  total_pieces_euros: number;
  total_billets_euros: number;
  total_cb_euros: number;
  total_cheques_euros: number;
}

export interface YearlyStatsResponse {
  years: YearlyStats[];
}

@Injectable({ providedIn: 'root' })
export class DashboardAdminService {
  private readonly api = inject(ApiService);

  getGlobalKPIs() {
    return this.api.get<GlobalKPIs>('/api/dashboard-admin/global-kpis');
  }

  getYearlyStats() {
    return this.api.get<YearlyStatsResponse>('/api/dashboard-admin/yearly-stats');
  }
}
