import { Component, inject, signal, effect } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { environment } from '../../../environments/environment';

// ── API response interfaces ─────────────────────────────────────────
interface YearlyGoalDataPoint {
  year: number;
  jour_num: number;
  serie: string;
  montant_cumule: number;
}

interface YearlyGoalsResponse {
  data: YearlyGoalDataPoint[];
}

// ── Series styling config ───────────────────────────────────────────
const PAST_YEAR_COLORS = ['#9CA3AF', '#6B7280', '#D1D5DB', '#E5E7EB', '#F3F4F6'];

@Component({
  selector: 'app-yearly-goals-page',
  standalone: true,
  imports: [BaseChartDirective],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div class="h-14 px-4 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0">
        <h2 class="text-lg font-semibold text-gray-800">📊 Objectifs Annuels</h2>
        <button
          (click)="refresh()"
          class="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
          title="Actualiser">
          🔄
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-hidden p-4 flex flex-col">
        @if (loading()) {
          <div class="flex items-center justify-center h-64">
            <p class="text-gray-500">⏳ Chargement…</p>
          </div>
        } @else if (error()) {
          <div class="flex items-center justify-center h-64">
            <p class="text-red-600">❌ {{ error() }}</p>
          </div>
        } @else {
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex-1 flex flex-col min-h-0">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">📈 Objectif vs Réalisé — Montant cumulé par jour de quête</h3>
            <div class="flex-1 min-h-0">
              <canvas baseChart [data]="chartData()" [options]="chartOptions()" type="line"></canvas>
            </div>
          </div>

          @if (!hasGoal()) {
            <div class="mt-4 border-2 border-red-300 bg-red-50 rounded-lg p-4">
              <p class="text-red-600 font-semibold">⚠️ Aucun objectif défini pour l'année {{ currentYear }}</p>
              <a [href]="rcqV1YearlyGoalsUrl"
                 target="_blank"
                 rel="noopener noreferrer"
                 class="text-blue-600 hover:text-blue-800 underline text-sm mt-1 inline-block">
                Définissez vos objectifs ici →
              </a>
            </div>
          }
        }
      </div>
    </div>
  `,
})
export class YearlyGoalsPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly hasGoal = signal(true);
  readonly currentYear = new Date().getFullYear();
  readonly rcqV1YearlyGoalsUrl = `${environment.rcqV1Url}/#!/yearlyGoals`;

  // ── Chart data & options ──────────────────────────────────────────
  readonly chartData = signal<ChartData<'line'>>({ labels: [], datasets: [] });
  readonly chartOptions = signal<ChartOptions<'line'>>({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const value = ctx.parsed.y ?? 0;
            const formatted = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(value);
            return `${ctx.dataset.label}: ${formatted}`;
          },
        },
      },
    },
    scales: {
      x: { title: { display: true, text: 'Jour de quête' } },
      y: {
        beginAtZero: true,
        title: { display: true, text: 'Montant cumulé (€)' },
        ticks: {
          callback: (value) => new Intl.NumberFormat('fr-FR').format(Number(value)) + ' €',
        },
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
      const url = forceRefresh ? '/api/yearly-goals?refresh=true' : '/api/yearly-goals';
      const response = await firstValueFrom(this.api.get<YearlyGoalsResponse>(url));
      this.applyData(response.data);
    } catch {
      this.error.set('Erreur lors du chargement des données.');
    } finally {
      this.loading.set(false);
    }
  }

  private applyData(data: YearlyGoalDataPoint[]): void {
    const labels = Array.from({ length: 9 }, (_, i) => `Jour ${i + 1}`);
    const currentYear = this.currentYear;

    // Check if goal exists for current year
    const goalPoints = data.filter(d => d.serie === 'Objectif' && d.year === currentYear);
    this.hasGoal.set(goalPoints.length > 0);

    // Group data by year+serie
    const seriesMap = new Map<string, { year: number; serie: string; values: (number | null)[] }>();
    for (const point of data) {
      const key = `${point.serie}_${point.year}`;
      if (!seriesMap.has(key)) {
        seriesMap.set(key, { year: point.year, serie: point.serie, values: Array(9).fill(null) });
      }
      const entry = seriesMap.get(key)!;
      if (point.jour_num >= 1 && point.jour_num <= 9) {
        entry.values[point.jour_num - 1] = point.montant_cumule;
      }
    }

    // Build datasets
    const datasets: ChartData<'line'>['datasets'] = [];

    // Past years "Réalisé" (N-5 to N-1) — thin gray lines
    const pastYears = [...seriesMap.values()]
      .filter(s => s.serie === 'Réalisé' && s.year < currentYear)
      .sort((a, b) => a.year - b.year);

    pastYears.forEach((s, idx) => {
      const colorIdx = Math.min(idx, PAST_YEAR_COLORS.length - 1);
      datasets.push({
        label: `Réalisé ${s.year}`,
        data: s.values,
        borderColor: PAST_YEAR_COLORS[colorIdx],
        borderWidth: 1.5,
        pointRadius: 0,
        tension: 0.3,
        fill: false,
      });
    });

    // Current year "Objectif" — red solid line
    const objectifCurrent = seriesMap.get(`Objectif_${currentYear}`);
    if (objectifCurrent) {
      datasets.push({
        label: `Objectif ${currentYear}`,
        data: objectifCurrent.values,
        borderColor: '#DC2626',
        borderWidth: 3,
        pointRadius: 5,
        tension: 0.3,
        fill: false,
      });
    }

    // Current year "Réalisé" — blue solid line
    const realiseCurrent = seriesMap.get(`Réalisé_${currentYear}`);
    if (realiseCurrent) {
      datasets.push({
        label: `Réalisé ${currentYear}`,
        data: realiseCurrent.values,
        borderColor: '#2563EB',
        borderWidth: 3,
        pointRadius: 5,
        tension: 0.3,
        fill: false,
      });
    }

    this.chartData.set({ labels, datasets });
  }
}
