import { Component, inject, signal, effect, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions, ActiveElement, ChartEvent } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';

// ── Interfaces ───────────────────────────────────────────────────────
interface ControleDonneesDay {
  jour_num: number;
  label: string;
  montant: number;
  euros_par_heure: number | null;
  nb_troncs: number;
}

interface ControleDonneesTronc {
  tronc_queteur_id: number;
  tronc_id: number;
  first_name: string;
  last_name: string;
  point_quete_name: string;
  montant: number;
  hours: number;
  euros_par_heure: number | null;
}

interface ControleDonneesResponse {
  days: ControleDonneesDay[];
}

interface DrilldownResponse {
  troncs: ControleDonneesTronc[];
}

interface RcqUrls {
  base_url: string;
  tronc_queteur_uri: string;
}

// ── Day labels ───────────────────────────────────────────────────────
const DAY_LABELS = [
  'J1: Samedi',
  'J2: Dimanche',
  'J3: Lundi',
  'J4: Mardi',
  'J5: Mercredi',
  'J6: Jeudi',
  'J7: Vendredi',
  'J8: Samedi 2',
  'J9: Dimanche 2',
];

@Component({
  selector: 'app-controle-donnees-page',
  standalone: true,
  imports: [DecimalPipe, BaseChartDirective],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div class="h-14 px-4 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0">
        <h2 class="text-lg font-semibold text-gray-800">🔍 Contrôle de données</h2>
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

      <!-- Day checkboxes -->
      <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-3 items-center shrink-0">
        <span class="text-sm font-medium text-gray-600">Jours :</span>
        @for (label of dayLabels; track label; let i = $index) {
          <label class="flex items-center gap-1 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox"
              [checked]="selectedDays()[i]"
              (change)="toggleDay(i)"
              class="rounded border-gray-300 text-red-600 focus:ring-red-500">
            {{ label }}
          </label>
        }
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
            <h3 class="text-sm font-semibold text-gray-700 mb-3">📊 Montant collecté & Taux horaire par jour de quête</h3>
            <div style="height: 400px;">
              <canvas baseChart
                [data]="chartData()"
                [options]="chartOptions()"
                type="bar">
              </canvas>
            </div>
          </div>

          <!-- Drill-down table -->
          @if (selectedDayNum() !== null) {
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <div class="flex items-center justify-between mb-3">
                <h3 class="text-sm font-semibold text-gray-700">
                  📋 Détail — {{ getDayLabel(selectedDayNum()!) }}
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
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">TQ ID</th>
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">Tronc</th>
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">Quêteur</th>
                        <th class="px-3 py-2 text-left font-semibold text-gray-600">Point de quête</th>
                        <th class="px-3 py-2 text-right font-semibold text-gray-600">Montant (€)</th>
                        <th class="px-3 py-2 text-right font-semibold text-gray-600">Durée (h)</th>
                        <th class="px-3 py-2 text-right font-semibold text-gray-600">€/h</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (t of drilldownData(); track t.tronc_queteur_id) {
                        <tr class="border-b border-gray-100 hover:bg-gray-50">
                          <td class="px-3 py-1.5">
                            <a (click)="openTroncQueteur(t.tronc_queteur_id); $event.preventDefault()"
                               href="#" class="text-blue-600 hover:underline font-mono">{{ t.tronc_queteur_id }}</a>
                          </td>
                          <td class="px-3 py-1.5">
                            <a (click)="openTronc(t.tronc_id); $event.preventDefault()"
                               href="#" class="text-blue-600 hover:underline font-mono">{{ t.tronc_id }}</a>
                          </td>
                          <td class="px-3 py-1.5 text-gray-800">{{ t.first_name }} {{ t.last_name }}</td>
                          <td class="px-3 py-1.5 text-gray-700">{{ t.point_quete_name }}</td>
                          <td class="px-3 py-1.5 text-right text-gray-800">{{ t.montant | number:'1.2-2' }}</td>
                          <td class="px-3 py-1.5 text-right text-gray-700">{{ t.hours | number:'1.1-1' }}</td>
                          <td class="px-3 py-1.5 text-right text-gray-700">
                            @if (t.euros_par_heure !== null) { {{ t.euros_par_heure | number:'1.2-2' }} }
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
  readonly selectedYear = signal(new Date().getFullYear());
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly selectedDays = signal<boolean[]>(Array(9).fill(true));
  readonly loading = signal(false);
  readonly error = signal('');
  readonly days = signal<ControleDonneesDay[]>([]);
  readonly selectedDayNum = signal<number | null>(null);
  readonly drilldownData = signal<ControleDonneesTronc[]>([]);
  readonly drilldownLoading = signal(false);

  private rcqBaseUrl = '';
  private rcqTroncQueteurUri = '';
  private readonly rcqTroncUri = '#!/troncs/edit/';
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
            return `${ctx.dataset.label}: ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value)}`;
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Jour de quête' } },
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
          callback: (value) => Number(value).toFixed(1) + ' €/h',
        },
      },
    },
    onClick: (_event: ChartEvent, elements: ActiveElement[]) => {
      if (elements.length > 0) {
        const idx = elements[0].index;
        const filteredDays = this.getFilteredDays();
        if (idx < filteredDays.length) {
          this.onBarClick(filteredDays[idx].jour_num);
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
    this.selectedDayNum.set(null);
    this.drilldownData.set([]);
    this.loadData();
  });

  constructor() {
    this.loadRcqUrls();
    this.loadData();
  }

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.selectedDayNum.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  toggleDay(index: number): void {
    const current = [...this.selectedDays()];
    current[index] = !current[index];
    this.selectedDays.set(current);
    this.selectedDayNum.set(null);
    this.drilldownData.set([]);
    this.updateChart();
  }

  refresh(): void {
    this.selectedDayNum.set(null);
    this.drilldownData.set([]);
    this.loadData();
  }

  getDayLabel(jourNum: number): string {
    return DAY_LABELS[jourNum - 1] || `Jour ${jourNum}`;
  }

  closeDrilldown(): void {
    this.selectedDayNum.set(null);
    this.drilldownData.set([]);
  }

  openTroncQueteur(troncQueteurId: number): void {
    if (this.rcqBaseUrl && this.rcqTroncQueteurUri) {
      window.open(`${this.rcqBaseUrl}/${this.rcqTroncQueteurUri}${troncQueteurId}`, '_blank');
    }
  }

  openTronc(troncId: number): void {
    if (this.rcqBaseUrl) {
      window.open(`${this.rcqBaseUrl}/${this.rcqTroncUri}${troncId}`, '_blank');
    }
  }

  private onBarClick(jourNum: number): void {
    this.selectedDayNum.set(jourNum);
    this.loadDrilldown(jourNum);
  }

  private getFilteredDays(): ControleDonneesDay[] {
    const checked = this.selectedDays();
    return this.days().filter(d => d.jour_num >= 1 && d.jour_num <= 9 && checked[d.jour_num - 1]);
  }

  private updateChart(): void {
    const filtered = this.getFilteredDays();
    const labels = filtered.map(d => this.getDayLabel(d.jour_num));

    this.chartData.set({
      labels,
      datasets: [
        {
          type: 'bar',
          label: 'Montant (€)',
          data: filtered.map(d => d.montant),
          backgroundColor: 'rgba(220, 38, 38, 0.7)',
          borderColor: '#DC2626',
          borderWidth: 1,
          yAxisID: 'y',
          order: 2,
        },
        {
          type: 'line',
          label: 'Euros / heure',
          data: filtered.map(d => d.euros_par_heure),
          borderColor: '#2563EB',
          backgroundColor: 'rgba(37, 99, 235, 0.1)',
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
      const resp = await firstValueFrom(
        this.api.get<ControleDonneesResponse>(
          `/api/controle-donnees?year=${this.selectedYear()}`
        )
      );
      this.days.set(resp.days || []);
      this.updateChart();
    } catch {
      this.error.set('Erreur lors du chargement des données de contrôle.');
    } finally {
      this.loading.set(false);
    }
  }

  private async loadDrilldown(jourNum: number): Promise<void> {
    this.drilldownLoading.set(true);
    this.drilldownData.set([]);
    try {
      const resp = await firstValueFrom(
        this.api.get<DrilldownResponse>(
          `/api/controle-donnees/day/${jourNum}?year=${this.selectedYear()}`
        )
      );
      this.drilldownData.set(resp.troncs || []);
    } catch {
      console.error('Failed to load drill-down data');
    } finally {
      this.drilldownLoading.set(false);
    }
  }

  private async loadRcqUrls(): Promise<void> {
    try {
      const urls = await firstValueFrom(
        this.api.get<RcqUrls>('/api/config/rcq-urls')
      );
      this.rcqBaseUrl = urls.base_url;
      this.rcqTroncQueteurUri = urls.tronc_queteur_uri;
    } catch {
      console.error('Failed to load RCQ URLs');
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
