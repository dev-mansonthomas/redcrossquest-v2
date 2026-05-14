import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import {
  DashboardAdminService,
  GlobalKPIs,
  YearlyStats,
} from './dashboard-admin.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';

type MetricKey =
  | 'nb_ul'
  | 'nb_queteurs'
  | 'total_heures'
  | 'total_euros'
  | 'total_pieces_euros'
  | 'total_billets_euros'
  | 'total_cb_euros'
  | 'total_cheques_euros'
  | 'poids_kg';

interface MetricDef {
  key: MetricKey;
  label: string;
  color: string; // Tailwind color token used for bar fill
  unit: 'count' | 'hours' | 'euros' | 'kg';
}

const METRICS: MetricDef[] = [
  { key: 'nb_ul',              label: 'UL',         color: '#6366F1', unit: 'count' },  // indigo-500
  { key: 'nb_queteurs',        label: 'Quêteurs',   color: '#3B82F6', unit: 'count' },  // blue-500
  { key: 'total_heures',       label: 'Heures',     color: '#F59E0B', unit: 'hours' },  // amber-500
  { key: 'total_euros',        label: 'Total €',    color: '#22C55E', unit: 'euros' },  // green-500
  { key: 'total_pieces_euros', label: 'Pièces €',   color: '#EAB308', unit: 'euros' },  // yellow-500
  { key: 'total_billets_euros',label: 'Billets €',  color: '#10B981', unit: 'euros' },  // emerald-500
  { key: 'total_cb_euros',     label: 'CB €',       color: '#A855F7', unit: 'euros' },  // purple-500
  { key: 'total_cheques_euros',label: 'Chèques €',  color: '#F97316', unit: 'euros' },  // orange-500
  { key: 'poids_kg',           label: '⚖️ Poids kg', color: '#64748B', unit: 'kg' },    // slate-500
];

@Component({
  selector: 'app-dashboard-admin-page',
  standalone: true,
  imports: [BaseChartDirective],
  template: `
    <div class="h-full w-full bg-gray-50 overflow-y-auto">
      <!-- Header -->
      <div [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">📊 Dashboard Admin</h2>
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
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            @for (i of [1,2,3]; track i) {
              <div class="bg-white rounded-lg shadow p-6 animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div class="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            }
          </div>
          <div class="grid grid-cols-1 md:grid-cols-4 gap-4">
            @for (i of [1,2,3,4]; track i) {
              <div class="bg-white rounded-lg shadow p-6 animate-pulse">
                <div class="h-4 bg-gray-200 rounded w-1/2 mb-3"></div>
                <div class="h-8 bg-gray-200 rounded w-3/4"></div>
              </div>
            }
          </div>
        } @else {
          <!-- Row 1: 3 cards -->
          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">🏛️</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatNumber(kpis().nb_ul) }}</p>
                  <p class="text-sm text-gray-500">UL actives</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">👥</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatNumber(kpis().nb_queteurs) }}</p>
                  <p class="text-sm text-gray-500">Quêteurs</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">⏱️</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatHours(kpis().total_heures) }}</p>
                  <p class="text-sm text-gray-500">Heures de quête</p>
                </div>
              </div>
            </div>
          </div>

          <!-- Row 2: 6 cards -->
          <div class="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">💰</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(kpis().total_euros) }}</p>
                  <p class="text-sm text-gray-500">Total €</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">🪙</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(kpis().total_pieces_euros) }}</p>
                  <p class="text-sm text-gray-500">Pièces</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">💵</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(kpis().total_billets_euros) }}</p>
                  <p class="text-sm text-gray-500">Billets</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">💳</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(kpis().total_cb_euros) }}</p>
                  <p class="text-sm text-gray-500">CB</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl">📝</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatCurrency(kpis().total_cheques_euros) }}</p>
                  <p class="text-sm text-gray-500">Chèques</p>
                </div>
              </div>
            </div>
            <div class="bg-white rounded-lg shadow p-6">
              <div class="flex items-center gap-3">
                <span class="text-3xl text-slate-500">⚖️</span>
                <div>
                  <p class="text-3xl font-bold text-gray-900">{{ formatWeight(kpis().poids_kg) }}</p>
                  <p class="text-sm text-gray-500">Poids total{{ kpis().poids_kg > 1000 ? ' (' + formatTonnes(kpis().poids_kg) + ')' : '' }}</p>
                </div>
              </div>
            </div>
          </div>
        }

        <!-- Chart section -->
        <div class="bg-white rounded-lg shadow p-6">
          <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
            <h3 class="text-lg font-semibold text-gray-800">📈 Utilisation par année</h3>
            <div class="flex flex-wrap gap-2">
              @for (m of metrics; track m.key) {
                <button
                  type="button"
                  (click)="selectMetric(m.key)"
                  [class]="(selectedMetric() === m.key
                    ? 'bg-blue-600 text-white border-blue-600'
                    : 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-200')
                    + ' px-3 py-1.5 rounded-full text-sm border transition-colors'">
                  {{ m.label }}
                </button>
              }
            </div>
          </div>

          @if (initialLoading()) {
            <div class="h-[400px] bg-gray-100 rounded animate-pulse"></div>
          } @else {
            <div class="h-[400px]">
              <canvas baseChart [data]="chartData()" [options]="chartOptions()" type="bar"></canvas>
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`:host { display: block; height: 100%; width: 100%; }`],
})
export class DashboardAdminPageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
  protected readonly metrics = METRICS;

  private readonly service = inject(DashboardAdminService);

  readonly loading = signal(false);
  readonly initialLoading = signal(true);
  readonly kpis = signal<GlobalKPIs>({
    nb_ul: 0,
    nb_queteurs: 0,
    total_heures: 0,
    total_euros: 0,
    total_pieces_euros: 0,
    total_billets_euros: 0,
    total_cb_euros: 0,
    total_cheques_euros: 0,
    poids_kg: 0,
  });
  readonly yearlyStats = signal<YearlyStats[]>([]);
  readonly selectedMetric = signal<MetricKey>('total_euros');

  readonly chartData = computed<ChartData<'bar'>>(() => {
    const stats = this.yearlyStats();
    const metric = this.currentMetric();
    return {
      labels: stats.map((s) => String(s.year)),
      datasets: [
        {
          label: metric.label,
          data: stats.map((s) => Number(s[metric.key] ?? 0)),
          backgroundColor: metric.color,
          borderColor: metric.color,
          borderWidth: 1,
        },
      ],
    };
  });

  readonly chartOptions = computed<ChartOptions<'bar'>>(() => {
    const metric = this.currentMetric();
    const formatter = (value: number): string => this.formatMetricValue(value, metric.unit);
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 600 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => `${metric.label}: ${formatter(Number(ctx.parsed.y))}`,
          },
        },
      },
      scales: {
        x: { grid: { display: false } },
        y: {
          beginAtZero: true,
          ticks: { callback: (value) => formatter(Number(value)) },
        },
      },
    };
  });

  constructor() {
    this.loadAll();
  }

  async refresh(): Promise<void> {
    await this.loadAll();
  }

  selectMetric(key: MetricKey): void {
    this.selectedMetric.set(key);
  }

  formatNumber(value: number, decimals: number = 0): string {
    const parts = Number(value ?? 0).toFixed(decimals).split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    return decimals > 0 ? parts.join(',') : parts[0];
  }

  formatHours(value: number): string {
    return `${this.formatNumber(Math.round(Number(value ?? 0)))}h`;
  }

  formatCurrency(value: number): string {
    return this.formatNumber(value, 2) + ' €';
  }

  formatWeight(value: number): string {
    return this.formatNumber(value, 1) + ' kg';
  }

  formatTonnes(valueKg: number): string {
    return this.formatNumber(Number(valueKg ?? 0) / 1000, 1) + ' t';
  }

  private currentMetric(): MetricDef {
    return METRICS.find((m) => m.key === this.selectedMetric()) ?? METRICS[3];
  }

  private formatMetricValue(value: number, unit: MetricDef['unit']): string {
    if (unit === 'euros') return this.formatCurrency(value);
    if (unit === 'hours') return this.formatHours(value);
    if (unit === 'kg') return this.formatWeight(value);
    return this.formatNumber(value);
  }

  private async loadAll(): Promise<void> {
    this.loading.set(true);
    try {
      const [kpis, yearly] = await Promise.all([
        firstValueFrom(this.service.getGlobalKPIs()),
        firstValueFrom(this.service.getYearlyStats()),
      ]);
      this.kpis.set(kpis);
      this.yearlyStats.set(yearly.years ?? []);
    } catch (err) {
      console.error('Failed to load dashboard admin data', err);
    } finally {
      this.loading.set(false);
      this.initialLoading.set(false);
    }
  }
}
