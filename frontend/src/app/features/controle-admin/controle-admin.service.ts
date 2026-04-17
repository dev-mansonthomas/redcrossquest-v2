import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { environment } from '../../../environments/environment';

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
}

export interface ControleFilters {
  year?: number;
  days?: string;
  ul_id?: number;
  page?: number;
  page_size?: number;
  sort?: string;
  sort_dir?: string;
  format?: string;
}

export interface TroncAnomaly {
  id: number;
  ul_id: number;
  ul_name: string | null;
  first_name: string | null;
  last_name: string | null;
  depart: string | null;
  retour?: string | null;
  comptage?: string | null;
  montant?: number | null;
  duration_minutes?: number | null;
  taux_horaire?: number | null;
  don_creditcard?: number | null;
  cb_detail?: number | null;
  ecart?: number | null;
  nb_types_remplis?: number | null;
  nb_lignes_cb?: number | null;
}

export interface ControleCounts {
  R1_temps_court: number;
  R2_sans_retour: number;
  R3_montant_eleve: number;
  R4_cb_mismatch: number;
  R5_saisie_suspecte: number;
  R11_depart_apres_retour: number;
  R12_dates_futures: number;
  R6_sans_objectif: number;
  R7_peu_queteurs: number;
  R8_peu_users: number;
  R9_peu_points: number;
  R10_peu_troncs: number;
  R10b_non_validee: number;
  R13_doublons: number;
  R14_dormante: number;
}

export interface ControleSettings {
  seuil_temps_minutes: number;
  seuil_montant_max: number;
  seuil_saisie_suspecte: number;
}

export interface UlSearchResult {
  id: number;
  name: string;
  postal_code: string | null;
}

export interface UlSearchResponse {
  results: UlSearchResult[];
}

export interface UlItem {
  id?: number;
  ul_id?: number;
  ul_name?: string | null;
  name?: string;
  city?: string | null;
  postal_code?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  nb_queteurs?: number;
  nb_users?: number;
  nb_points?: number;
  nb_troncs?: number;
  nb_doublons?: number;
  registration_id?: number | null;
  registration_date?: string | null;
  registration_approved?: number | null;
  derniere_activite?: string | null;
  jours_inactivite?: number | null;
}

export interface UlDetailInfo {
  id: number;
  name: string;
  city: string | null;
  postal_code: string | null;
}

export interface UlDetailAdmin {
  man: boolean | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  mobile: string | null;
}

export interface UlDetailRegistration {
  id: number | null;
  created: string | null;
  registration_approved: boolean | null;
}

export interface UlDetailResponse {
  ul: UlDetailInfo;
  admin: UlDetailAdmin;
  registration: UlDetailRegistration;
}

@Injectable({ providedIn: 'root' })
export class ControleAdminService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  private buildParams(filters: ControleFilters): HttpParams {
    let params = new HttpParams();
    if (filters.year != null) params = params.set('year', filters.year.toString());
    if (filters.days) params = params.set('days', filters.days);
    if (filters.ul_id != null) params = params.set('ul_id', filters.ul_id.toString());
    if (filters.page) params = params.set('page', filters.page.toString());
    if (filters.page_size) params = params.set('page_size', filters.page_size.toString());
    if (filters.sort) params = params.set('sort', filters.sort);
    if (filters.sort_dir) params = params.set('sort_dir', filters.sort_dir);
    if (filters.format) params = params.set('format', filters.format);
    return params;
  }

  private url(path: string): string {
    return `${this.baseUrl}${path}`;
  }

  getCounts(filters: ControleFilters) {
    return this.http.get<ControleCounts>(this.url('/api/controle-admin/counts'), { params: this.buildParams(filters) });
  }

  getSettings() {
    return this.http.get<ControleSettings>(this.url('/api/controle-admin/settings'));
  }

  updateSettings(settings: ControleSettings) {
    return this.http.put<ControleSettings>(this.url('/api/controle-admin/settings'), settings);
  }

  getTroncs(rule: string, f: ControleFilters) {
    return this.http.get<PaginatedResponse<TroncAnomaly>>(
      this.url(`/api/controle-admin/troncs/${rule}`),
      { params: this.buildParams(f) },
    );
  }

  exportCsv(rule: string, filters: ControleFilters) {
    const f = { ...filters, format: 'csv' };
    return this.http.get(this.url(`/api/controle-admin/troncs/${rule}`), {
      params: this.buildParams(f),
      responseType: 'blob',
    });
  }

  getUls(rule: string, f: ControleFilters) {
    return this.http.get<PaginatedResponse<UlItem>>(
      this.url(`/api/controle-admin/uls/${rule}`),
      { params: this.buildParams(f) },
    );
  }

  getUlDetail(ulId: number) {
    return this.http.get<UlDetailResponse>(
      this.url(`/api/controle-admin/uls/${ulId}/detail`),
    );
  }

  exportUlCsv(rule: string, filters: ControleFilters) {
    const f = { ...filters, format: 'csv' };
    return this.http.get(this.url(`/api/controle-admin/uls/${rule}`), {
      params: this.buildParams(f),
      responseType: 'blob',
    });
  }

  searchUl(q: string) {
    const params = new HttpParams().set('q', q);
    return this.http.get<UlSearchResponse>(this.url('/api/ul/search'), { params });
  }
}
