import { Component, inject, signal, effect, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UlOverrideService } from '../../core/services/ul-override.service';

// ── Interfaces ───────────────────────────────────────────────────────
interface DailyStats {
  jour_num: number;
  montant_jour: number;
  montant_cb: number;
  nb_benevoles: number;
  nb_benevoles_1j: number;
  nb_heures: number;
}

interface StatsJournalieresResponse {
  data: DailyStats[];
  year: number;
  available_years: number[];
}

const DAY_LABELS = [
  'J1: Sam', 'J2: Dim', 'J3: Lun', 'J4: Mar', 'J5: Mer',
  'J6: Jeu', 'J7: Ven', 'J8: Sam', 'J9: Dim',
];

@Component({
  selector: 'app-stats-journalieres-page',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="flex-1 overflow-auto p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-800">📊 Stats journalières</h2>
        <div class="flex items-center gap-2">
          <select
            [value]="selectedYear()"
            (change)="onYearChange($event)"
            class="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:ring-red-500 focus:border-red-500">
            @for (y of availableYears(); track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>
          <button (click)="loadData(true)" class="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
            🔄 Rafraîchir
          </button>
          <button (click)="downloadCsv()" class="px-3 py-1.5 text-sm rounded-md bg-green-100 text-green-700 hover:bg-green-200"
            [disabled]="loading() || sortedData().length === 0">
            📥 Télécharger CSV
          </button>
        </div>
      </div>

      <!-- Warning banner -->
      <div class="bg-amber-50 border border-amber-300 text-amber-800 px-4 py-3 rounded-md text-sm font-medium mb-4">
        ⚠️ Attention : pensez à contrôler vos données et corriger les erreurs avant de communiquer ces données.
      </div>

      <!-- Loading / Error -->
      @if (loading()) {
        <div class="text-center py-12 text-gray-500">Chargement…</div>
      }
      @if (error()) {
        <div class="bg-red-50 text-red-700 p-4 rounded-md mb-4">{{ error() }}</div>
      }

      <!-- Table -->
      @if (!loading() && !error()) {
        <div class="bg-white rounded-lg shadow overflow-hidden">
          <table class="min-w-full divide-y divide-gray-200 text-sm">
            <thead class="bg-gray-50">
              <tr>
                @for (col of columns; track col.label) {
                  <th (click)="onSort(col.key)"
                    class="px-4 py-3 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none"
                    [class.text-left]="col.align === 'left'"
                    [class.text-right]="col.align === 'right'">
                    {{ col.label }} {{ sortIndicator(col.key) }}
                  </th>
                }
              </tr>
            </thead>
            <tbody class="divide-y divide-gray-100">
              @for (row of sortedData(); track row.jour_num) {
                <tr class="hover:bg-gray-50">
                  <td class="px-4 py-2 text-left font-medium text-gray-700">{{ dayLabel(row.jour_num) }}</td>
                  <td class="px-4 py-2 text-right">{{ row.montant_jour | number:'1.2-2' }}</td>
                  <td class="px-4 py-2 text-right">{{ row.montant_cb | number:'1.2-2' }}</td>
                  <td class="px-4 py-2 text-right">{{ row.nb_benevoles }}</td>
                  <td class="px-4 py-2 text-right">{{ row.nb_benevoles_1j }}</td>
                  <td class="px-4 py-2 text-right">{{ row.nb_heures | number:'1.1-1' }}</td>
                </tr>
              }
              <!-- TOTAL row -->
              @if (totals(); as t) {
                <tr class="bg-gray-50 font-bold border-t-2 border-gray-300">
                  <td class="px-4 py-2 text-left">TOTAL</td>
                  <td class="px-4 py-2 text-right">{{ t.montant_jour | number:'1.2-2' }}</td>
                  <td class="px-4 py-2 text-right">{{ t.montant_cb | number:'1.2-2' }}</td>
                  <td class="px-4 py-2 text-right">{{ t.nb_benevoles }}</td>
                  <td class="px-4 py-2 text-right">{{ t.nb_benevoles_1j }}</td>
                  <td class="px-4 py-2 text-right">{{ t.nb_heures | number:'1.1-1' }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
})
export class StatsJournalieresPageComponent {
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly rawData = signal<DailyStats[]>([]);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly availableYears = signal<number[]>([new Date().getFullYear()]);
  readonly sortColumn = signal<string>('jour_num');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  readonly columns = [
    { key: 'jour_num', label: 'Jour', align: 'left' as const },
    { key: 'montant_jour', label: 'Montant (€)', align: 'right' as const },
    { key: 'montant_cb', label: 'Montant CB (€)', align: 'right' as const },
    { key: 'nb_benevoles', label: 'Bénévoles', align: 'right' as const },
    { key: 'nb_benevoles_1j', label: 'Bénévoles 1j', align: 'right' as const },
    { key: 'nb_heures', label: 'Heures', align: 'right' as const },
  ];

  readonly sortedData = computed(() => {
    const data = [...this.rawData()];
    const col = this.sortColumn();
    const dir = this.sortDirection() === 'asc' ? 1 : -1;
    return data.sort((a, b) => {
      const va = (a as unknown as Record<string, number>)[col] ?? 0;
      const vb = (b as unknown as Record<string, number>)[col] ?? 0;
      return va < vb ? -dir : va > vb ? dir : 0;
    });
  });

  readonly totals = computed(() => {
    const data = this.rawData();
    if (data.length === 0) return null;
    return {
      montant_jour: data.reduce((s, d) => s + d.montant_jour, 0),
      montant_cb: data.reduce((s, d) => s + d.montant_cb, 0),
      nb_benevoles: data.reduce((s, d) => s + d.nb_benevoles, 0),
      nb_benevoles_1j: data.reduce((s, d) => s + d.nb_benevoles_1j, 0),
      nb_heures: data.reduce((s, d) => s + d.nb_heures, 0),
    };
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

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.loadData();
  }

  onSort(column: string): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('asc');
    }
  }

  sortIndicator(column: string): string {
    if (this.sortColumn() !== column) return '';
    return this.sortDirection() === 'asc' ? '▲' : '▼';
  }

  dayLabel(jourNum: number): string {
    return DAY_LABELS[jourNum - 1] || `J${jourNum}`;
  }

  async loadData(forceRefresh = false): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const params = [`year=${this.selectedYear()}`];
      if (forceRefresh) params.push('refresh=true');
      const resp = await firstValueFrom(
        this.api.get<StatsJournalieresResponse>(`/api/stats-journalieres?${params.join('&')}`)
      );
      this.rawData.set(resp.data || []);
      if (resp.available_years?.length) {
        this.availableYears.set(resp.available_years);
      }
    } catch {
      this.error.set('Erreur lors du chargement des stats journalières.');
    } finally {
      this.loading.set(false);
    }
  }

  downloadCsv(): void {
    const data = this.sortedData();
    if (data.length === 0) return;

    const BOM = '\uFEFF';
    const headers = ['Jour', 'Montant (€)', 'Montant CB (€)', 'Bénévoles', 'Bénévoles 1j', 'Heures'];
    const rows = data.map(d => [
      this.dayLabel(d.jour_num),
      d.montant_jour.toFixed(2),
      d.montant_cb.toFixed(2),
      String(d.nb_benevoles),
      String(d.nb_benevoles_1j),
      d.nb_heures.toFixed(1),
    ]);

    // Add TOTAL row
    const t = this.totals();
    if (t) {
      rows.push([
        'TOTAL',
        t.montant_jour.toFixed(2),
        t.montant_cb.toFixed(2),
        String(t.nb_benevoles),
        String(t.nb_benevoles_1j),
        t.nb_heures.toFixed(1),
      ]);
    }

    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const ulName = this.ulOverrideService.override()?.name ?? this.authService.user()?.ul_name ?? 'UL';
    const safeName = ulName.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ _-]/g, '').replace(/\s+/g, '_');
    const filename = `stats-journalieres-${this.selectedYear()}-${safeName}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }
}
