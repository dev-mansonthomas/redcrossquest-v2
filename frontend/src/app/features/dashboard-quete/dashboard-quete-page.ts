import {
  Component,
  inject,
  signal,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DashboardQueteService, KPIs, TopQueteur } from './dashboard-quete.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';
import { QueteursMapComponent } from '../../shared/components/queteurs-map';

@Component({
  selector: 'app-dashboard-quete-page',
  standalone: true,
  imports: [QueteursMapComponent],
  template: `
    <div class="h-full w-full bg-gray-50 overflow-y-auto">
      <!-- Header -->
      <div [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">🏠 Tableau de bord Quête</h2>
        <button
          (click)="refresh()"
          [disabled]="loading()"
          class="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50">
          🔄
        </button>
      </div>

      <div class="p-4 space-y-6">
        <!-- KPI Cards -->
        @if (initialLoading()) {
          <div class="flex flex-wrap gap-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="flex-1 min-w-[200px] bg-white rounded-lg shadow p-6 animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div class="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            }
          </div>
        } @else {
          <div class="flex flex-wrap gap-4">
            <div class="flex-1 min-w-[200px] bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">⏱️</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatMinutes(kpis().total_temps_minutes) }}</p>
                  <p class="text-sm text-gray-500">Temps total de quête</p>
                </div>
              </div>
            </div>
            <div class="flex-1 min-w-[200px] bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">👥</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ kpis().nb_queteurs }}</p>
                  <p class="text-sm text-gray-500">Nombre de quêteurs</p>
                </div>
              </div>
            </div>
            <div class="flex-1 min-w-[200px] bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">🚶</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ kpis().nb_sorties }}</p>
                  <p class="text-sm text-gray-500">Nombre de sorties</p>
                </div>
              </div>
            </div>
            @if (kpis().show_montant) {
              <div class="flex-1 min-w-[200px] bg-white rounded-lg shadow p-6">
                <div class="flex items-center gap-3">
                  <span class="text-3xl">💰</span>
                  <div>
                    <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(kpis().montant_total) }}</p>
                    <p class="text-sm text-gray-500">Montant total</p>
                  </div>
                </div>
              </div>
            }
          </div>
        }

        <!-- Map -->
        <div class="bg-white rounded-lg shadow">
          <app-queteurs-map
            heightClass="h-[60vh]"
            [showRefreshButton]="false"
            [showHeader]="false">
          </app-queteurs-map>
        </div>

        <!-- Top 10 Table -->
        <div class="bg-white rounded-lg shadow">
          <div class="p-4 border-b border-gray-200 flex items-center justify-between">
            <h3 class="text-lg font-semibold text-gray-800">🏆 Top 10 Quêteurs</h3>
            @if (tableLoading()) {
              <span class="text-sm text-gray-400">Chargement...</span>
            }
          </div>
          @if (loading() && topQueteurs().length === 0) {
            <div class="p-6 animate-pulse space-y-3">
              @for (i of [1,2,3]; track i) {
                <div class="h-6 bg-gray-200 rounded"></div>
              }
            </div>
          } @else if (topQueteurs().length === 0) {
            <div class="p-6 text-center text-gray-400 italic">
              Aucun quêteur comptabilisé aujourd'hui
            </div>
          } @else {
            <div class="overflow-x-auto">
              <table class="table-auto w-full text-sm">
                <thead>
                  <tr class="text-left text-gray-500 border-b bg-gray-50">
                    <th class="px-4 py-3 font-semibold">Nom</th>
                    <th (click)="onSort('montant')" class="px-4 py-3 font-semibold text-right cursor-pointer select-none hover:bg-gray-100">
                      Montant {{ sortIndicator('montant') }}
                    </th>
                    <th (click)="onSort('temps')" class="px-4 py-3 font-semibold text-right cursor-pointer select-none hover:bg-gray-100">
                      Temps {{ sortIndicator('temps') }}
                    </th>
                    <th (click)="onSort('sorties')" class="px-4 py-3 font-semibold text-right cursor-pointer select-none hover:bg-gray-100">
                      Sorties {{ sortIndicator('sorties') }}
                    </th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (q of topQueteurs(); track q.last_name + q.first_name) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-2">{{ q.first_name }} {{ q.last_name }}</td>
                      <td class="px-4 py-2 text-right font-mono">{{ formatCurrency(q.montant) }}</td>
                      <td class="px-4 py-2 text-right font-mono">{{ formatMinutes(q.temps_minutes) }}</td>
                      <td class="px-4 py-2 text-right font-mono">{{ q.nb_sorties }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; width: 100%; }
  `],
})
export class DashboardQuetePageComponent {
  protected readonly headerBg = ENV_HEADER_BG;

  private readonly service = inject(DashboardQueteService);

  readonly loading = signal(false);
  readonly tableLoading = signal(false);
  readonly initialLoading = signal(true);
  readonly kpis = signal<KPIs>({
    total_temps_minutes: 0,
    nb_queteurs: 0,
    nb_sorties: 0,
    montant_total: 0,
    show_montant: false,
  });
  readonly topQueteurs = signal<TopQueteur[]>([]);

  private sortColumn = 'montant';

  constructor() {
    this.loadAll();
  }

  async refresh(): Promise<void> {
    await this.loadAll();
  }

  onSort(column: string): void {
    this.sortColumn = column;
    this.loadTop10();
  }

  sortIndicator(column: string): string {
    return this.sortColumn === column ? '▼' : '';
  }

  formatMinutes(minutes: number): string {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h}h ${String(Math.round(m)).padStart(2, '0')}min`;
  }

  formatCurrency(amount: number): string {
    return amount.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [summary] = await Promise.all([
        firstValueFrom(this.service.getSummary()),
        this.loadTop10(),
      ]);
      this.kpis.set(summary.kpis);
    } catch (err) {
      console.error('Failed to load dashboard summary', err);
    } finally {
      this.loading.set(false);
      this.initialLoading.set(false);
    }
  }

  private async loadTop10(): Promise<void> {
    this.tableLoading.set(true);
    try {
      const resp = await firstValueFrom(
        this.service.getTop10(this.sortColumn),
      );
      this.topQueteurs.set(resp.queteurs);
    } catch (err) {
      console.error('Failed to load top 10', err);
    } finally {
      this.tableLoading.set(false);
    }
  }
}
