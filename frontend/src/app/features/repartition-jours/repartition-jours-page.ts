import { Component, computed, effect, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';

interface DailyAmount { year: number; jour_num: number; montant_jour: number; }
interface RepartitionJoursResponse { data: DailyAmount[]; min_year: number; max_year: number; current_year: number; }

const DAY_COLORS = ['#3B82F6','#60A5FA','#F97316','#FB923C','#FBBF24','#A3E635','#34D399','#22C55E','#16A34A'];
const DAY_LABELS = Array.from({ length: 9 }, (_, i) => `Jour ${i + 1}`);
const EUR = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const MAX_YEARS = 10;
const LS_KEY_PREFIX = 'repartition-jours:years:';

@Component({
  selector: 'app-repartition-jours-page',
  standalone: true,
  imports: [BaseChartDirective],
  template: `
    <div class="h-full flex flex-col">
      <div [class]="'h-14 px-4 border-b border-gray-200 flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">📊 Répartition journalière</h2>
        <div class="flex items-center gap-2 flex-wrap">
          @if (availableYears().length > 0) {
            <span class="text-sm text-gray-700 font-medium">Années :</span>
            @for (y of availableYears(); track y) {
              <button
                type="button"
                (click)="toggleYear(y)"
                [class]="'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ' +
                  (isYearSelected(y) ? 'bg-red-100 border-red-400 text-red-700' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200')">
                {{ y }}
              </button>
            }
            <button
              type="button"
              (click)="toggleAllYears()"
              [class]="'px-2.5 py-1 rounded-md text-xs font-medium transition-colors border ' +
                (allYearsSelected() ? 'bg-red-100 border-red-400 text-red-700' : 'bg-gray-100 border-gray-200 text-gray-700 hover:bg-gray-200')">
              ✓ Tous
            </button>
          }
          <button (click)="loadData(true)" class="px-3 py-1.5 text-sm bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors" [disabled]="loading()">🔄 Rafraîchir</button>
        </div>
      </div>
      <div class="flex-1 overflow-auto p-4">
        @if (loading()) {
          <div class="flex items-center justify-center h-64"><p class="text-gray-500">⏳ Chargement…</p></div>
        } @else if (error()) {
          <div class="flex items-center justify-center h-64"><p class="text-red-600">❌ {{ error() }}</p></div>
        } @else {
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-6">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">{{ donutTitle() }}</h3>
            @if (selectedYears().size === 0) {
              <div class="flex items-center justify-center" style="height: 320px;">
                <p class="text-gray-500 text-sm">Sélectionnez au moins une année</p>
              </div>
            } @else {
              <div style="height: 320px; max-width: 480px; margin: 0 auto;">
                <canvas baseChart [data]="donutData()" [options]="donutOptions" type="doughnut"></canvas>
              </div>
            }
          </div>
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">Répartition par année (proportion)</h3>
            @if (selectedYears().size === 0) {
              <div class="flex items-center justify-center" style="height: 300px;">
                <p class="text-gray-500 text-sm">Sélectionnez au moins une année</p>
              </div>
            } @else {
              <div [style.height.px]="barChartHeight()">
                <canvas baseChart [data]="barData()" [options]="barOptions" type="bar"></canvas>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class RepartitionJoursPageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly ulOverrideService = inject(UlOverrideService);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly apiResponse = signal<RepartitionJoursResponse | null>(null);
  readonly selectedYears = signal<Set<number>>(new Set());

  readonly availableYears = computed<number[]>(() => {
    const r = this.apiResponse();
    if (!r) return [];
    const unique = [...new Set(r.data.map(d => d.year))].sort((a, b) => b - a);
    return unique.slice(0, MAX_YEARS);
  });

  readonly allYearsSelected = computed(() => {
    const avail = this.availableYears();
    const sel = this.selectedYears();
    return avail.length > 0 && avail.every(y => sel.has(y));
  });

  readonly donutTitle = computed(() => {
    const r = this.apiResponse();
    if (!r) return 'Répartition globale';
    const sel = this.selectedYears();
    const past = [...sel].filter(y => y !== r.current_year).sort((a, b) => a - b);
    if (past.length === 0) return 'Répartition globale';
    if (past.length > 4) return `Répartition globale (${past[0]}-${past[past.length - 1]})`;
    return `Répartition globale (${past.join(', ')})`;
  });

  readonly donutData = computed<ChartData<'doughnut'>>(() => {
    const r = this.apiResponse();
    if (!r) return { labels: [], datasets: [] };
    const sel = this.selectedYears();
    const h = r.data.filter(d => d.year !== r.current_year && sel.has(d.year));
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
    const sel = this.selectedYears();
    const filtered = r.data.filter(d => sel.has(d.year));
    const years = [...new Set(filtered.map(d => d.year))].sort((a, b) => b - a);
    const ymap = new Map<number, Map<number, number>>();
    for (const d of filtered) {
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
    const sel = this.selectedYears();
    if (sel.size === 0) return 300;
    return Math.max(300, sel.size * 36 + 80);
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

  private storageKey(): string {
    const ulId = this.ulOverrideService.override()?.id ?? this.authService.user()?.ul_id ?? 'anon';
    return `${LS_KEY_PREFIX}${ulId}`;
  }

  private readStoredYears(avail: number[]): Set<number> | null {
    try {
      const raw = localStorage.getItem(this.storageKey());
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return null;
      const availSet = new Set(avail);
      const filtered = parsed.filter((y: unknown) => typeof y === 'number' && availSet.has(y));
      return new Set(filtered);
    } catch {
      return null;
    }
  }

  private persistSelectedYears(years: Set<number>): void {
    try {
      localStorage.setItem(this.storageKey(), JSON.stringify([...years]));
    } catch { /* localStorage unavailable */ }
  }

  isYearSelected(year: number): boolean {
    return this.selectedYears().has(year);
  }

  toggleYear(year: number): void {
    const next = new Set(this.selectedYears());
    if (next.has(year)) next.delete(year); else next.add(year);
    this.selectedYears.set(next);
    this.persistSelectedYears(next);
  }

  toggleAllYears(): void {
    const avail = this.availableYears();
    const next = this.allYearsSelected() ? new Set<number>() : new Set(avail);
    this.selectedYears.set(next);
    this.persistSelectedYears(next);
  }

  async loadData(forceRefresh = false): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const url = forceRefresh ? '/api/repartition-jours?refresh=true' : '/api/repartition-jours';
      this.apiResponse.set(await firstValueFrom(this.api.get<RepartitionJoursResponse>(url)));
      const avail = this.availableYears();
      if (avail.length > 0) {
        const stored = this.readStoredYears(avail);
        this.selectedYears.set(stored ?? new Set(avail));
      }
    } catch { this.error.set('Erreur lors du chargement de la répartition journalière.'); }
    finally { this.loading.set(false); }
  }
}
