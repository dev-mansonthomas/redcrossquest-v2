import { Component, inject, signal, effect } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';

// ── API response interfaces ─────────────────────────────────────────
interface FinancialYear {
  year: number;
  total_billets: number;
  total_pieces: number;
  total_cb: number;
  total_cheques: number;
}

interface HoursBySector {
  year: number;
  secteur: number;
  label: string;
  total_hours: number;
}

interface QueteursBySector {
  year: number;
  secteur: number;
  label: string;
  nb_queteurs: number;
}

interface ActivityYear {
  year: number;
  nb_tronc_queteur: number;
  nb_points_quete: number;
  nb_troncs: number;
}

interface OverviewResponse {
  years: number[];
  financials: FinancialYear[];
  hours_by_sector: HoursBySector[];
  queteurs_by_sector: QueteursBySector[];
  activity_metrics: ActivityYear[];
}

// ── Sector config ───────────────────────────────────────────────────
const SECTOR_DATASETS = [
  { label: 'Bénévole', color: '#E30613' },
  { label: "Bénévole d'un jour", color: '#9C27B0' },
  { label: 'Ancien bénévole', color: '#795548' },
  { label: 'Commerçant', color: '#FF9800' },
  { label: 'Spécial', color: '#616161' },
];

@Component({
  selector: 'app-ul-overview-page',
  standalone: true,
  imports: [BaseChartDirective],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div class="h-14 px-4 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0">
        <h2 class="text-lg font-semibold text-gray-800">📊 Vue globale UL</h2>
        <button
          (click)="refresh()"
          class="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Actualiser">
          🔄
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 flex flex-col min-h-0 p-4">
        @if (loading()) {
          <div class="flex items-center justify-center h-64">
            <div class="text-gray-500 text-sm">Chargement...</div>
          </div>
        } @else {
          @if (error()) {
            <div class="mb-4 px-4 py-2 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {{ error() }}
            </div>
          }

          <!-- Row 1: Financials + Hours by sector -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0">
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col">
              <h3 class="text-sm font-semibold text-gray-700 mb-3">💰 Total collecté par type (€)</h3>
              <div class="flex-1 min-h-0">
                <canvas baseChart [data]="financialsChartData()" [options]="stackedBarOptions()" type="bar"></canvas>
              </div>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col">
              <h3 class="text-sm font-semibold text-gray-700 mb-3">⏱️ Heures de quête par secteur</h3>
              <div class="flex-1 min-h-0">
                <canvas baseChart [data]="hoursChartData()" [options]="stackedBarOptions()" type="bar"></canvas>
              </div>
            </div>
          </div>

          <!-- Row 2: Quêteurs by sector + Activity -->
          <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 mt-6">
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col">
              <h3 class="text-sm font-semibold text-gray-700 mb-3">👥 Quêteurs par secteur</h3>
              <div class="flex-1 min-h-0">
                <canvas baseChart [data]="queteursChartData()" [options]="stackedBarOptions()" type="bar"></canvas>
              </div>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-col">
              <h3 class="text-sm font-semibold text-gray-700 mb-3">📈 Activité : sorties, points, troncs</h3>
              <div class="flex-1 min-h-0">
                <canvas baseChart [data]="activityChartData()" [options]="groupedBarOptions()" type="bar"></canvas>
              </div>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class UlOverviewPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly loading = signal(false);
  readonly error = signal('');

  // ── Chart data signals ──────────────────────────────────────────
  readonly financialsChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  readonly hoursChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  readonly queteursChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  readonly activityChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });

  // ── Chart options ───────────────────────────────────────────────
  readonly stackedBarOptions = signal<ChartOptions<'bar'>>({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } } },
    scales: {
      x: { stacked: true },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: { callback: (value) => Number(value).toLocaleString('fr-FR') },
      },
    },
  });

  readonly groupedBarOptions = signal<ChartOptions<'bar'>>({
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } } },
    scales: {
      x: { stacked: false },
      y: {
        type: 'linear',
        position: 'left',
        beginAtZero: true,
        title: { display: true, text: 'Sorties' },
        ticks: { callback: (value) => Number(value).toLocaleString('fr-FR') },
      },
      y1: {
        type: 'linear',
        position: 'right',
        beginAtZero: true,
        title: { display: true, text: 'Points / Troncs' },
        grid: { drawOnChartArea: false },
        ticks: { callback: (value) => Number(value).toLocaleString('fr-FR') },
      },
    },
  });

  private overrideInitialized = false;

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.loadData();
  });

  constructor() {
    this.loadData();
  }

  refresh(): void {
    this.loadData(true);
  }

  private async loadData(forceRefresh = false): Promise<void> {
    this.loading.set(true);
    this.error.set('');

    try {
      const url = forceRefresh ? '/api/ul/overview?refresh=true' : '/api/ul/overview';
      const data = await firstValueFrom(this.api.get<OverviewResponse>(url));
      this.applyData(data);
    } catch {
      this.error.set('Erreur lors du chargement des données.');
    } finally {
      this.loading.set(false);
    }
  }

  private applyData(data: OverviewResponse): void {
    const yearLabels = data.years.map(y => String(y));

    // ── Chart 1.1: Financials (stacked) ──
    this.financialsChartData.set({
      labels: yearLabels,
      datasets: [
        { label: 'Pièces', data: this.mapByYear(data.years, data.financials, 'total_pieces'), backgroundColor: '#FFC107', stack: 'total' },
        { label: 'Billets', data: this.mapByYear(data.years, data.financials, 'total_billets'), backgroundColor: '#4CAF50', stack: 'total' },
        { label: 'CB', data: this.mapByYear(data.years, data.financials, 'total_cb'), backgroundColor: '#2196F3', stack: 'total' },
        { label: 'Chèques', data: this.mapByYear(data.years, data.financials, 'total_cheques'), backgroundColor: '#FF9800', stack: 'total' },
      ],
    });

    // ── Chart 1.2: Hours by sector (stacked) ──
    this.hoursChartData.set({
      labels: yearLabels,
      datasets: SECTOR_DATASETS.map(s => ({
        label: s.label,
        data: this.mapSectorByYear(data.years, data.hours_by_sector, s.label, 'total_hours'),
        backgroundColor: s.color,
        stack: 'hours',
      })),
    });

    // ── Chart 2.1: Quêteurs by sector (stacked) ──
    this.queteursChartData.set({
      labels: yearLabels,
      datasets: SECTOR_DATASETS.map(s => ({
        label: s.label,
        data: this.mapSectorByYear(data.years, data.queteurs_by_sector, s.label, 'nb_queteurs'),
        backgroundColor: s.color,
        stack: 'queteurs',
      })),
    });

    // ── Chart 2.2: Activity (grouped, dual Y axis) ──
    this.activityChartData.set({
      labels: yearLabels,
      datasets: [
        { label: 'Sorties', data: this.mapByYear(data.years, data.activity_metrics, 'nb_tronc_queteur'), backgroundColor: '#2196F3', yAxisID: 'y' },
        { label: 'Points de quête', data: this.mapByYear(data.years, data.activity_metrics, 'nb_points_quete'), backgroundColor: '#4CAF50', yAxisID: 'y1' },
        { label: 'Troncs', data: this.mapByYear(data.years, data.activity_metrics, 'nb_troncs'), backgroundColor: '#FF9800', yAxisID: 'y1' },
      ],
    });
  }

  /** Map a simple year-keyed array to ordered values by year. */
  private mapByYear<T extends { year: number }>(years: number[], items: T[], field: keyof T): number[] {
    const byYear = new Map(items.map(i => [i.year, i]));
    return years.map(y => {
      const item = byYear.get(y);
      return item ? Number(item[field]) : 0;
    });
  }

  /** Map sector data (year + label) to ordered values by year for a given sector label. */
  private mapSectorByYear<T extends { year: number; label: string }>(
    years: number[], items: T[], sectorLabel: string, field: keyof T
  ): number[] {
    const filtered = items.filter(i => i.label === sectorLabel);
    const byYear = new Map(filtered.map(i => [i.year, i]));
    return years.map(y => {
      const item = byYear.get(y);
      return item ? Number(item[field]) : 0;
    });
  }
}
