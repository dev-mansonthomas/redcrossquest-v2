import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';

export interface KPIs {
  total_temps_minutes: number;
  nb_queteurs: number;
  nb_sorties: number;
  montant_total: number;
  show_montant: boolean;
}

export interface ActiveQueteur {
  first_name: string;
  last_name: string;
  latitude: number;
  longitude: number;
  point_name: string | null;
  depart: string;
}

export interface DashboardSummaryResponse {
  kpis: KPIs;
  active_queteurs: ActiveQueteur[];
}

export interface TopQueteur {
  first_name: string;
  last_name: string;
  montant: number;
  temps_minutes: number;
  nb_sorties: number;
}

export interface Top10Response {
  queteurs: TopQueteur[];
  show_montant: boolean;
}

@Injectable({ providedIn: 'root' })
export class DashboardQueteService {
  private readonly api = inject(ApiService);

  getSummary() {
    return this.api.get<DashboardSummaryResponse>('/api/dashboard-quete/summary');
  }

  getTop10(sort = 'montant', dir = 'desc') {
    return this.api.get<Top10Response>(`/api/dashboard-quete/top10?sort=${sort}&dir=${dir}`);
  }
}
