import { Component, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';

interface DailyAmount { year: number; jour_num: number; montant_jour: number; }
interface RepartitionJoursResponse { data: DailyAmount[]; min_year: number; max_year: number; current_year: number; }

const DAY_COLORS = ['#3B82F6','#60A5FA','#F97316','#FB923C','#FBBF24','#A3E635','#34D399','#22C55E','#16A34A'];
const DAY_LABELS = Array.from({ length: 9 }, (_, i) => `Jour ${i + 1}`);
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

@Component({
  selector: 'app-repartition-jours-page',
  standalone: true,
  imports: [BaseChartDirective],
  template: `
    <div class="h-full flex flex-col">
      <div [class]="'h-14 px-4 border-b border-gray-200 flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">📊 Répartition journalière</h2>
        <button (click)="loadData(true)" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors" [disabled]="loading()">🔄 Rafraîchir</button>
      </div>
      <div class="flex-1 overflow-auto p-4">
        @if (loading()) {
          <div class="flex items-center justify-center h-64"><p class="text-gray-500">⏳ Chargement…</p></div>
        } @else if (error()) {
          <div class="flex items-center justify-center h-64"><p class="text-red-600">❌ {{ error() }}</p></div>
        } @else {
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">{{ donutTitle() }}</h3>
            <div style="height: 320px; max-width: 480px; margin: 0 auto;">
              <canvas baseChart [data]="donutData()" [options]="donutOptions" type="doughnut"></canvas>
            </div>
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Répartition par année (proportion)</h3>
            <div [style.height.px]="barChartHeight()">
              <canvas baseChart [data]="barData()" [options]="barOptions" type="bar"></canvas>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class RepartitionJoursPageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly apiResponse = signal<RepartitionJoursResponse | null>(null);

  readonly donutTitle = computed(() => {
    const r = this.apiResponse();
    if (!r) return 'Répartition globale';
    const maxY = r.current_year > r.min_year ? r.current_year - 1 : r.max_year;
    return `Répartition globale (${r.min_year}-${maxY})`;
  });

  readonly donutData = computed<ChartData<'doughnut'>>(() => {
    const r = this.apiResponse();
    if (!r) return { labels: [], datasets: [] };
    const h = r.data.filter(d => d.year !== r.current_year);
    const w1 = h.filter(d => d.jour_num <= 2).reduce((s, d) => s + d.montant_jour, 0);
    const sm = h.filter(d => d.jour_num >= 3 && d.jour_num <= 7).reduce((s, d) => s + d.montant_jour, 0);
    const w2 = h.filter(d => d.jour_num >= 8).reduce((s, d) => s + d.montant_jour, 0);
    const t = w1 + sm + w2;
    const p = (v: number) => t > 0 ? ((v / t) * 100).toLocaleString('fr-FR', {minimumFractionDigits: 1, maximumFractionDigits: 1}) : '0,0';
    return {
      labels: [`Weekend 1 (J1+J2) — ${p(w1)}%`, `Semaine (J3-J7) — ${p(sm)}%`, `Weekend 2 (J8+J9) — ${p(w2)}%`],
      datasets: [{ data: [w1, sm, w2], backgroundColor: ['#3B82F6', '#F97316', '#22C55E'], borderWidth: 2, borderColor: '#fff' }],
    };
  });

  readonly donutOptions: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 16, usePointStyle: true, font: { size: 13 } } },
      tooltip: { callbacks: { label: (ctx) => EUR.format(ctx.parsed ?? 0) } },
    },
  };

  readonly barData = computed<ChartData<'bar'>>(() => {
    const r = this.apiResponse();
    if (!r) return { labels: [], datasets: [] };
    const years = [...new Set(r.data.map(d => d.year))].sort((a, b) => b - a);
    const ymap = new Map<number, Map<number, number>>();
    for (const d of r.data) {
      if (!ymap.has(d.year)) ymap.set(d.year, new Map());
      ymap.get(d.year)!.set(d.jour_num, d.montant_jour);
    }
    const totals = new Map(years.map(y => {
      let t = 0; ymap.get(y)?.forEach(v => t += v); return [y, t];
    }));
    return {
      labels: years.map(String),
      datasets: DAY_LABELS.map((label, i) => ({
        label, backgroundColor: DAY_COLORS[i], borderWidth: 0,
        data: years.map(y => {
          const tot = totals.get(y) || 1;
          return ((ymap.get(y)?.get(i + 1) ?? 0) / tot) * 100;
        }),
      })),
    };
  });

  readonly barChartHeight = computed(() => {
    const r = this.apiResponse();
    if (!r) return 400;
    return Math.max(300, new Set(r.data.map(d => d.year)).size * 36 + 80);
  });

  readonly barOptions: ChartOptions<'bar'> = {
    indexAxis: 'y', responsive: true, maintainAspectRatio: false,
    scales: {
      x: { stacked: true, max: 100, ticks: { callback: v => `${v}%` }, title: { display: true, text: '% du montant total' } },
      y: { stacked: true },
    },
    plugins: {
      legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } },
      tooltip: { callbacks: { label: (ctx) => {
        const r = this.apiResponse();
        if (!r) return '';
        const year = parseInt(ctx.label, 10);
        const entry = r.data.find(d => d.year === year && d.jour_num === ctx.datasetIndex + 1);
        return `${ctx.dataset.label}: ${EUR.format(entry?.montant_jour ?? 0)} (${(ctx.parsed.x ?? 0).toLocaleString('fr-FR', {minimumFractionDigits: 1, maximumFractionDigits: 1})}%)`;
      } } },
    },
  };

  private overrideInit = false;
  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInit) { this.overrideInit = true; return; }
    this.loadData();
  });

  constructor() { this.loadData(); }

  async loadData(forceRefresh = false): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const url = forceRefresh ? '/api/repartition-jours?refresh=true' : '/api/repartition-jours';
      this.apiResponse.set(await firstValueFrom(this.api.get<RepartitionJoursResponse>(url)));
    } catch { this.error.set('Erreur lors du chargement de la répartition journalière.'); }
    finally { this.loading.set(false); }
  }
}
