import { Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { FormsModule } from '@angular/forms';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';

// ── API response interfaces ─────────────────────────────────────────
interface CumulativeOpenPoint {
  open_date: string;
  secteur_label: string;
  cumulative_count: number;
}
interface SummaryBySecteur { secteur_label: string; total_sent: number; total_opened: number; }
interface SummaryByStatus { status_code: string; label: string; count: number; }
interface MailingStatsEntry { queteur_id: number; first_name: string; last_name: string; email_send_date: string; status_code: string; }
interface MailingStatsResponse {
  available_years: number[];
  cumulative_opens: CumulativeOpenPoint[];
  summary_by_secteur: SummaryBySecteur[];
  summary_by_status: SummaryByStatus[];
  table_data: MailingStatsEntry[];
}

// ── Constants ────────────────────────────────────────────────────────
const SECTEUR_COLORS: Record<string, string> = {
  'Bénévole': '#2563EB',
  "Bénévole d'un jour": '#16A34A',
  'Ancien bénévole': '#D97706',
  'Commerçant': '#9333EA',
  'Spécial': '#DC2626',
};

const STATUS_LABELS: Record<string, string> = {
  '202': 'Accepted', '400': 'Bad Request', '401': 'Unauthorized',
  '403': 'Forbidden', '413': 'Payload Too Large', '429': 'Too Many Requests',
  '500': 'Internal Server Error',
};

@Component({
  selector: 'app-mailing-stats-page',
  standalone: true,
  imports: [BaseChartDirective, FormsModule],
  styles: [`:host { display: block; height: 100%; }`],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">📧 Suivi Mail Remerciement</h2>
        <div class="flex items-center gap-2">
          <select [ngModel]="selectedYear()" (ngModelChange)="onYearChange($event)"
                  class="rounded-md border-gray-300 text-sm px-2 py-1 focus:ring-red-500 focus:border-red-500">
            @for (y of availableYears(); track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>
          <button (click)="refresh()"
                  class="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                  title="Actualiser">🔄</button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-4">
        @if (loading()) {
          <div class="flex items-center justify-center h-64"><p class="text-gray-500">⏳ Chargement…</p></div>
        } @else if (error()) {
          <div class="flex items-center justify-center h-64"><p class="text-red-600">❌ {{ error() }}</p></div>
        } @else {
          <!-- Line chart -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4 mb-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">📈 Cumul d'ouvertures par secteur</h3>
            <div style="height: 400px;">
              <canvas baseChart [data]="lineData()" [options]="lineOptions" type="line"></canvas>
            </div>
          </div>

          <!-- Charts: bar + donut -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 class="text-sm font-semibold text-gray-700 mb-3">📊 Taux d'ouverture par type de bénévole</h3>
              <div style="height: 280px;">
                <canvas baseChart [data]="barSecteurData()" [options]="barSecteurOptions" type="bar"></canvas>
              </div>
            </div>
            <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
              <h3 class="text-sm font-semibold text-gray-700 mb-3">🍩 Emails par statut</h3>
              <div style="height: 280px; max-width: 400px; margin: 0 auto;">
                <canvas baseChart [data]="donutStatusData()" [options]="donutOptions" type="doughnut"></canvas>
              </div>
            </div>
          </div>

          <!-- Filters + Table -->
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <h3 class="text-sm font-semibold text-gray-700 mb-3">📋 Détail des envois</h3>
            <div class="flex flex-wrap gap-3 mb-3 items-end">
              <div>
                <label class="block text-xs text-gray-500 mb-1">Status</label>
                <select [ngModel]="filterStatus()" (ngModelChange)="filterStatus.set($event)"
                        class="rounded-md border-gray-300 text-sm px-2 py-1 focus:ring-red-500 focus:border-red-500">
                  <option value="">Tous</option>
                  <option value="202">202 - Accepted</option>
                  <option value="400">400 - Bad Request</option>
                  <option value="401">401 - Unauthorized</option>
                  <option value="403">403 - Forbidden</option>
                  <option value="413">413 - Payload Too Large</option>
                  <option value="429">429 - Too Many Requests</option>
                  <option value="500">500 - Internal Server Error</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Prénom</label>
                <input type="text" [ngModel]="filterFirstName()" (ngModelChange)="filterFirstName.set($event)"
                       placeholder="Rechercher…" class="rounded-md border-gray-300 text-sm px-2 py-1 w-40 focus:ring-red-500 focus:border-red-500">
              </div>
              <div>
                <label class="block text-xs text-gray-500 mb-1">Nom</label>
                <input type="text" [ngModel]="filterLastName()" (ngModelChange)="filterLastName.set($event)"
                       placeholder="Rechercher…" class="rounded-md border-gray-300 text-sm px-2 py-1 w-40 focus:ring-red-500 focus:border-red-500">
              </div>
              <span class="text-xs text-gray-500 self-end pb-1">{{ filteredTable().length }} résultat(s)</span>
            </div>
            <div class="overflow-auto max-h-96">
              <table class="min-w-full text-sm">
                <thead class="bg-gray-50 sticky top-0">
                  <tr>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">ID Quêteur</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Prénom</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Nom</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Date d'envoi</th>
                    <th class="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-200">
                  @for (row of filteredTable(); track row.queteur_id) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-3 py-2 text-gray-900">{{ row.queteur_id }}</td>
                      <td class="px-3 py-2 text-gray-700">{{ row.first_name }}</td>
                      <td class="px-3 py-2 text-gray-700">{{ row.last_name }}</td>
                      <td class="px-3 py-2 text-gray-700">{{ row.email_send_date }}</td>
                      <td class="px-3 py-2 text-gray-700">{{ row.status_code }} - {{ getStatusLabel(row.status_code) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class MailingStatsPageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
  private readonly api = inject(ApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly availableYears = signal<number[]>([new Date().getFullYear()]);

  // Raw data
  private readonly cumulativeOpens = signal<CumulativeOpenPoint[]>([]);
  private readonly summaryBySecteur = signal<SummaryBySecteur[]>([]);
  private readonly summaryByStatus = signal<SummaryByStatus[]>([]);
  private readonly tableData = signal<MailingStatsEntry[]>([]);

  // Table filters
  readonly filterStatus = signal('');
  readonly filterFirstName = signal('');
  readonly filterLastName = signal('');

  // ── Computed: filtered table ────────────────────────────────────────
  readonly filteredTable = computed(() => {
    let rows = this.tableData();
    const st = this.filterStatus();
    const fn = this.filterFirstName().toLowerCase();
    const ln = this.filterLastName().toLowerCase();
    if (st) rows = rows.filter(r => r.status_code === st);
    if (fn) rows = rows.filter(r => r.first_name.toLowerCase().includes(fn));
    if (ln) rows = rows.filter(r => r.last_name.toLowerCase().includes(ln));
    return rows;
  });

  // ── Line chart ──────────────────────────────────────────────────────
  readonly lineData = computed<ChartData<'line'>>(() => {
    const points = this.cumulativeOpens();
    if (!points.length) return { labels: [], datasets: [] };

    const dateSet = [...new Set(points.map(p => p.open_date))].sort();
    const grouped = new Map<string, Map<string, number>>();
    for (const p of points) {
      if (!grouped.has(p.secteur_label)) grouped.set(p.secteur_label, new Map());
      grouped.get(p.secteur_label)!.set(p.open_date, p.cumulative_count);
    }

    const datasets: ChartData<'line'>['datasets'] = [];
    for (const [label, dateMap] of grouped) {
      datasets.push({
        label,
        data: dateSet.map(d => dateMap.get(d) ?? null) as (number | null)[],
        borderColor: SECTEUR_COLORS[label] ?? '#6B7280',
        backgroundColor: (SECTEUR_COLORS[label] ?? '#6B7280') + '20',
        borderWidth: 2,
        pointRadius: 2,
        tension: 0.3,
        fill: false,
      });
    }
    return { labels: dateSet, datasets };
  });

  readonly lineOptions: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true } },
    },
    scales: {
      x: { title: { display: true, text: 'Date' } },
      y: { beginAtZero: true, title: { display: true, text: 'Cumul ouvertures' } },
    },
  };

  // ── Bar chart: taux d'ouverture par secteur ─────────────────────────
  readonly barSecteurData = computed<ChartData<'bar'>>(() => {
    const s = this.summaryBySecteur();
    return {
      labels: s.map(x => x.secteur_label),
      datasets: [{
        label: "Taux d'ouverture (%)",
        data: s.map(x => x.total_sent > 0 ? Math.round(x.total_opened / x.total_sent * 1000) / 10 : 0),
        backgroundColor: s.map(x => SECTEUR_COLORS[x.secteur_label] ?? '#6B7280'),
        borderWidth: 1, borderColor: '#fff',
        borderRadius: 4,
      }],
    };
  });

  readonly barSecteurOptions: ChartOptions<'bar'> = {
    responsive: true, maintainAspectRatio: false,
    indexAxis: 'y',
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const s = this.summaryBySecteur();
            const i = ctx.dataIndex;
            const item = s[i];
            if (!item) return `${ctx.formattedValue}%`;
            return `${ctx.formattedValue}% (${item.total_opened}/${item.total_sent})`;
          },
        },
      },
    },
    scales: {
      x: { beginAtZero: true, max: 100, title: { display: true, text: "Taux d'ouverture (%)" } },
      y: { title: { display: false } },
    },
  };

  // ── Donut: by status ────────────────────────────────────────────────
  readonly donutStatusData = computed<ChartData<'doughnut'>>(() => {
    const s = this.summaryByStatus();
    const palette = ['#2563EB', '#16A34A', '#D97706', '#9333EA', '#DC2626', '#0891B2', '#4F46E5'];
    return {
      labels: s.map(x => `${x.status_code} - ${x.label}`),
      datasets: [{
        data: s.map(x => x.count),
        backgroundColor: s.map((_, i) => palette[i % palette.length]),
        borderWidth: 2, borderColor: '#fff',
      }],
    };
  });

  readonly donutOptions: ChartOptions<'doughnut'> = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { padding: 12, usePointStyle: true, font: { size: 12 } } },
    },
  };

  constructor() {
    this.loadData();
  }

  onYearChange(year: number | string): void {
    this.selectedYear.set(Number(year));
    this.loadData();
  }

  refresh(): void {
    this.loadData();
  }

  getStatusLabel(code: string): string {
    return STATUS_LABELS[code] ?? 'Unknown';
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const year = this.selectedYear();
      const res = await firstValueFrom(this.api.get<MailingStatsResponse>(`/api/mailing-stats?year=${year}`));
      if (res.available_years?.length) this.availableYears.set(res.available_years);
      this.cumulativeOpens.set(res.cumulative_opens ?? []);
      this.summaryBySecteur.set(res.summary_by_secteur ?? []);
      this.summaryByStatus.set(res.summary_by_status ?? []);
      this.tableData.set(res.table_data ?? []);
    } catch {
      this.error.set('Erreur lors du chargement des données.');
    } finally {
      this.loading.set(false);
    }
  }
}
