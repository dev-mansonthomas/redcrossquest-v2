import { Component, inject, signal, effect, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ActiveElement, ChartEvent } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { environment } from '../../../environments/environment';

// ── Interfaces ───────────────────────────────────────────────────────
interface QueteurControleSummary {
  queteur_id: number;
  first_name: string | null;
  last_name: string | null;
  nb_troncs: number;
  total_amount: number;
  total_hours: number;
  total_weight_kg: number;
}

interface TroncControleDetail {
  tronc_queteur_id: number;
  tronc_id: number;
  total_amount: number;
  hours: number;
  weight_kg: number;
  point_quete_name: string | null;
  quete_day_num: number | null;
}

interface ControleDonneesResponse {
  queteurs: QueteurControleSummary[];
}

interface TroncsControleResponse {
  troncs: TroncControleDetail[];
}

// ── RCQ V1 URL constants ─────────────────────────────────────────────
const RCQ_TRONC_QUETEUR_URI = '#!/tronc_queteur/edit/';
const RCQ_TRONC_URI = '#!/troncs/edit/';

// ── Day labels ───────────────────────────────────────────────────────
const DAY_LABELS = [
  'J1: Samedi',
  'J2: Dimanche',
  'J3: Lundi',
  'J4: Mardi',
  'J5: Mercredi',
  'J6: Jeudi',
  'J7: Vendredi',
  'J8: Samedi',
  'J9: Dimanche',
];

@Component({
  selector: 'app-controle-donnees-page',
  standalone: true,
  imports: [DecimalPipe, BaseChartDirective],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div class="min-h-14 px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 gap-4">
        <h2 class="text-lg font-semibold text-gray-800 whitespace-nowrap">🔍 Contrôle de données</h2>
        <div class="flex flex-wrap items-center gap-2">
          @for (label of dayLabels; track label; let i = $index) {
            <label class="flex items-center gap-1 text-sm text-gray-700 cursor-pointer select-none">
              <input type="checkbox"
                [checked]="selectedDays()[i]"
                (change)="toggleDay(i)"
                class="rounded border-gray-300 text-red-600 focus:ring-red-500">
              {{ label }}
            </label>
          }
          <button (click)="selectAllDays()"
            class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Tous</button>
          <button (click)="selectNoDays()"
            class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Aucun</button>
        </div>
        <div class="flex items-center gap-3">
          <select
            [value]="selectedYear()"
            (change)="onYearChange($event)"
            class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500">
            @for (y of yearOptions(); track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>
          <button
            (click)="refresh()"
            class="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Actualiser">
            🔄
          </button>
        </div>
      </div>

      <!-- Point type filter bar -->
      <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-center gap-3 shrink-0">
        <span class="text-sm font-medium text-gray-700 whitespace-nowrap">Type PQ :</span>
        @for (pt of POINT_TYPES; track pt.type; let i = $index) {
          <label class="flex items-center gap-1 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox"
              [checked]="selectedPointTypes()[i]"
              (change)="togglePointType(i)"
              class="rounded border-gray-300 text-red-600 focus:ring-red-500">
            {{ pt.emoji }} {{ pt.label }}
          </label>
        }
        <button (click)="selectAllPointTypes()"
          class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Tous</button>
        <button (click)="selectNoPointTypes()"
          class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Aucun</button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-4">
        @if (loading()) {
          <div class="flex items-center justify-center h-64">
            <p class="text-gray-500">⏳ Chargement…</p>
          </div>
        } @else if (error()) {
          <div class="flex items-center justify-center h-64">
            <p class="text-red-600">❌ {{ error() }}</p>
          </div>
        } @else {
          <!-- Chart -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">📊 Montant collecté & Taux horaire par quêteur</h3>
            <div style="height: calc(75vh - 120px);">
              <canvas baseChart
                [data]="chartData()"
                [options]="chartOptions()"
                type="bar">
              </canvas>
            </div>
          </div>

          <!-- Drill-down table -->
          @if (selectedQueteur() !== null) {
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-700">
                  📋 Détails pour {{ selectedQueteur()!.first_name }} {{ selectedQueteur()!.last_name }}
                </h3>
                <button (click)="closeDrilldown()"
                  class="text-gray-400 hover:text-gray-600 text-lg" title="Fermer">✕</button>
              </div>
              @if (drilldownLoading()) {
                <p class="text-gray-500 text-sm">⏳ Chargement…</p>
              } @else {
                <div class="overflow-x-auto">
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="bg-gray-50 border-b border-gray-200">
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">Jour</th>
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">ID TQ</th>
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">Tronc ID</th>
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">Point de quête</th>
                        <th class="px-3 py-2 text-right font-semibold text-gray-600">Montant (€)</th>
                        <th class="px-3 py-2 text-right font-semibold text-gray-600">Durée (h)</th>
                        <th class="px-3 py-2 text-right font-semibold text-gray-600">€/h</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (t of drilldownData(); track t.tronc_queteur_id) {
                        <tr class="border-b border-gray-100 hover:bg-gray-50">
                          <td class="px-3 py-1.5 text-gray-700">{{ getDayLabel(t.quete_day_num) }}</td>
                          <td class="px-3 py-1.5">
                            <a (click)="openTroncQueteur(t.tronc_queteur_id); $event.preventDefault()"
                               href="#" class="text-blue-600 hover:underline font-mono">{{ t.tronc_queteur_id }}</a>
                          </td>
                          <td class="px-3 py-1.5">
                            <a (click)="openTronc(t.tronc_id); $event.preventDefault()"
                               href="#" class="text-blue-600 hover:underline font-mono">{{ t.tronc_id }}</a>
                          </td>
                          <td class="px-3 py-1.5 text-gray-700">{{ t.point_quete_name }}</td>
                          <td class="px-3 py-1.5 text-right text-gray-800">{{ t.total_amount | number:'1.2-2' }}</td>
                          <td class="px-3 py-1.5 text-right text-gray-700">{{ t.hours | number:'1.1-1' }}</td>
                          <td class="px-3 py-1.5 text-right text-gray-700">
                            @if (t.hours > 0) { {{ t.total_amount / t.hours | number:'1.2-2' }} }
                            @else { — }
                          </td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class ControleDonneesPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly dayLabels = DAY_LABELS;
  readonly POINT_TYPES = [
    { type: 1, emoji: '🚦', label: 'Voie Publique' },
    { type: 2, emoji: '🚶', label: 'Piétons' },
    { type: 3, emoji: '🏪', label: 'Commerçant' },
    { type: 4, emoji: '🏠', label: 'Base UL' },
  ];
  readonly selectedYear = signal(new Date().getFullYear());
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly selectedDays = signal<boolean[]>(Array(9).fill(true));
  readonly selectedPointTypes = signal<boolean[]>(Array(4).fill(true));
  readonly loading = signal(false);
  readonly error = signal('');
  readonly queteurs = signal<QueteurControleSummary[]>([]);
  readonly selectedQueteur = signal<QueteurControleSummary | null>(null);
  readonly drilldownData = signal<TroncControleDetail[]>([]);
  readonly drilldownLoading = signal(false);

  private readonly rcqBaseUrl = environment.rcqV1Url;
  private readonly rcqTroncQueteurUri = RCQ_TRONC_QUETEUR_URI;
  private readonly rcqTroncUri = RCQ_TRONC_URI;
  private overrideInitialized = false;

  // ── Chart data & options ──────────────────────────────────────────
  readonly chartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });

  readonly chartOptions = signal<ChartOptions<'bar'>>({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed.y ?? 0;
            if (ctx.dataset.yAxisID === 'y1') {
              return `${ctx.dataset.label}: ${new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)} €/h`;
            }
            if (ctx.dataset.yAxisID === 'y2') {
              return `Heures: ${value.toLocaleString('fr-FR', {minimumFractionDigits: 1, maximumFractionDigits: 1})}h`;
            }
            return `${ctx.dataset.label}: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)}`;
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Quêteur' } },
      y: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        title: { display: true, text: 'Montant (€)' },
        ticks: {
          callback: (value) => new Intl.NumberFormat('fr-FR').format(Number(value)) + ' €',
        },
      },
      y1: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        title: { display: true, text: 'Euros / heure' },
        grid: { drawOnChartArea: false },
        ticks: {
          callback: (value) => Number(value).toLocaleString('fr-FR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) + ' €/h',
        },
      },
      y2: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        title: { display: true, text: 'Heures' },
        grid: { drawOnChartArea: false },
        ticks: {
          callback: (value) => Math.round(Number(value)).toLocaleString('fr-FR') + 'h',
        },
      },
    },
    onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        const data = this.queteurs();
        if (idx < data.length) {
          this.onQueteurClick(data[idx]);
        }
      }
    },
  });

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  });

  constructor() {
    this.loadData();
  }

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  toggleDay(index: number): void {
    const current = [...this.selectedDays()];
    current[index] = !current[index];
    this.selectedDays.set(current);
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  selectAllDays(): void {
    this.selectedDays.set(Array(9).fill(true));
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  selectNoDays(): void {
    this.selectedDays.set(Array(9).fill(false));
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  togglePointType(index: number): void {
    const current = [...this.selectedPointTypes()];
    current[index] = !current[index];
    this.selectedPointTypes.set(current);
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  selectAllPointTypes(): void {
    this.selectedPointTypes.set(Array(4).fill(true));
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  selectNoPointTypes(): void {
    this.selectedPointTypes.set(Array(4).fill(false));
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  refresh(): void {
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  closeDrilldown(): void {
    this.selectedQueteur.set(null);
    this.drilldownData.set([]);
  }

  getDayLabel(dayNum: number | null): string {
    if (dayNum == null) return '—';
    const label = this.dayLabels[dayNum - 1];
    const dayName = label ? label.split(': ')[1] : '';
    return `${dayNum} - ${dayName || '?'}`;
  }

  openTroncQueteur(troncQueteurId: number): void {
    if (this.rcqBaseUrl && this.rcqTroncQueteurUri) {
      window.open(`${this.rcqBaseUrl}/${this.rcqTroncQueteurUri}${troncQueteurId}`, '_blank');
    }
  }

  openTronc(troncId: number): void {
    if (this.rcqBaseUrl && this.rcqTroncUri) {
      window.open(`${this.rcqBaseUrl}/${this.rcqTroncUri}${troncId}`, '_blank');
    }
  }

  private onQueteurClick(queteur: QueteurControleSummary): void {
    this.selectedQueteur.set(queteur);
    this.loadDrilldown(queteur.queteur_id);
  }

  private getSelectedDaysParam(): string {
    const checked = this.selectedDays();
    const days: number[] = [];
    checked.forEach((v, i) => { if (v) days.push(i + 1); });
    return days.join(',');
  }

  private getSelectedPointTypesParam(): string {
    const checked = this.selectedPointTypes();
    const types: number[] = [];
    checked.forEach((v, i) => { if (v) types.push(this.POINT_TYPES[i].type); });
    return types.join(',');
  }

  private updateChart(): void {
    const data = this.queteurs();
    const labels = data.map(q => `${q.first_name ?? ''} ${q.last_name ?? ''} (${q.queteur_id})`);
    const efficiencies = data.map(q => q.total_hours > 0 ? Math.round((q.total_amount / q.total_hours) * 100) / 100 : null);

    this.chartData.set({
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Montant (€)',
          data: data.map(q => q.total_amount),
          backgroundColor: 'rgba(37, 99, 235, 0.7)',
          borderColor: '#2563EB',
          borderWidth: 1,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'bar',
          label: 'Heures',
          data: data.map(q => q.total_hours),
          backgroundColor: 'rgba(249, 115, 22, 0.7)',
          borderColor: '#F97316',
          borderWidth: 1,
          yAxisID: 'y2',
          order: 2,
        },
        {
          type: 'line',
          label: 'Euros / heure',
          data: efficiencies,
          borderColor: '#DC2626',
          backgroundColor: 'rgba(220, 38, 38, 0.1)',
          borderWidth: 2,
          pointRadius: 4,
          tension: 0.3,
          fill: false,
          yAxisID: 'y1',
          order: 1,
        } as any,
      ],
    });
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const daysParam = this.getSelectedDaysParam();
      const pointTypesParam = this.getSelectedPointTypesParam();
      if (!daysParam || !pointTypesParam) {
        this.queteurs.set([]);
        this.updateChart();
        this.loading.set(false);
        return;
      }
      let url = `/api/controle-donnees?year=${this.selectedYear()}`;
      if (daysParam) {
        url += `&days=${daysParam}`;
      }
      if (pointTypesParam) {
        url += `&point_types=${pointTypesParam}`;
      }
      const resp = await firstValueFrom(
        this.api.get<ControleDonneesResponse>(url)
      );
      this.queteurs.set(resp.queteurs || []);
      this.updateChart();
    } catch {
      this.error.set('Erreur lors du chargement des données de contrôle.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadDrilldown(queteurId: number): Promise<void> {
    this.drilldownLoading.set(true);
    this.drilldownData.set([]);
    try {
      const daysParam = this.getSelectedDaysParam();
      const pointTypesParam = this.getSelectedPointTypesParam();
      if (!daysParam || !pointTypesParam) {
        this.drilldownData.set([]);
        this.drilldownLoading.set(false);
        return;
      }
      let url = `/api/controle-donnees/${queteurId}/troncs?year=${this.selectedYear()}`;
      if (daysParam) {
        url += `&days=${daysParam}`;
      }
      if (pointTypesParam) {
        url += `&point_types=${pointTypesParam}`;
      }
      const resp = await firstValueFrom(
        this.api.get<TroncsControleResponse>(url)
      );
      this.drilldownData.set(resp.troncs || []);
    } catch {
      console.error('Failed to load drill-down data');
    } finally {
      this.drilldownLoading.set(false);
    }
  }

  private buildYearOptions(): number[] {
    const current = new Date().getFullYear();
    const years: number[] = [];
    for (let y = current; y >= current - 10; y--) {
      years.push(y);
    }
    return years;
  }
}
