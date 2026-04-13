import { Component, inject, signal, effect, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';

// ── Interfaces ───────────────────────────────────────────────────────
interface DenominationCount {
  label: string;
  value_cents: number;
  count: number;
  total: number;
}

interface CbTicket {
  amount: number;
  count: number;
  total: number;
}

interface ComptagePiecesBilletsResponse {
  pieces: DenominationCount[];
  billets: DenominationCount[];
  cb_tickets: CbTicket[];
  year: number;
  available_years: number[];
}

// ── Formatters ───────────────────────────────────────────────────────
const fmtInt = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 });
const fmtEur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });

type SortDir = 'asc' | 'desc';

@Component({
  selector: 'app-comptage-pieces-billets-page',
  standalone: true,
  imports: [],
  styles: [`:host { display: block; height: 100%; }`],
  template: `
    <div class="h-full flex flex-col overflow-hidden p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-4">
        <h2 class="text-xl font-bold text-gray-800">🪙 Comptage pièces, billets et CB</h2>
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
        </div>
      </div>

      <!-- Loading / Error -->
      @if (loading()) {
        <div class="text-center py-12 text-gray-500">Chargement…</div>
      }
      @if (error()) {
        <div class="bg-red-50 text-red-700 p-4 rounded-md mb-4">{{ error() }}</div>
      }

      <!-- 3 tables side by side -->
      @if (!loading() && !error()) {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">

          <!-- Tableau 1 — Pièces -->
          <div class="bg-white rounded-lg shadow flex flex-col min-h-0">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700 shrink-0">🪙 Pièces</div>
            <div class="overflow-y-auto flex-1 min-h-0">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th (click)="onSortPieces('label')" class="px-4 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Type {{ sortIndicator('pieces', 'label') }}</th>
                    <th (click)="onSortPieces('count')" class="px-4 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Nombre {{ sortIndicator('pieces', 'count') }}</th>
                    <th (click)="onSortPieces('total')" class="px-4 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Total € {{ sortIndicator('pieces', 'total') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (row of sortedPieces(); track row.label) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-2 text-left">{{ row.label }}</td>
                      <td class="px-4 py-2 text-right">{{ formatInt(row.count) }}</td>
                      <td class="px-4 py-2 text-right">{{ formatEur(row.total) }}</td>
                    </tr>
                  }
                  @if (totalsPieces(); as t) {
                    <tr class="bg-white font-bold border-t-2 border-gray-300 sticky bottom-0">
                      <td class="px-4 py-2 text-left">TOTAL</td>
                      <td class="px-4 py-2 text-right">{{ formatInt(t.count) }}</td>
                      <td class="px-4 py-2 text-right">{{ formatEur(t.total) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Tableau 2 — Billets -->
          <div class="bg-white rounded-lg shadow flex flex-col min-h-0">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700 shrink-0">💶 Billets</div>
            <div class="overflow-y-auto flex-1 min-h-0">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th (click)="onSortBillets('label')" class="px-4 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Type {{ sortIndicator('billets', 'label') }}</th>
                    <th (click)="onSortBillets('count')" class="px-4 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Nombre {{ sortIndicator('billets', 'count') }}</th>
                    <th (click)="onSortBillets('total')" class="px-4 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Total € {{ sortIndicator('billets', 'total') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (row of sortedBillets(); track row.label) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-2 text-left">{{ row.label }}</td>
                      <td class="px-4 py-2 text-right">{{ formatInt(row.count) }}</td>
                      <td class="px-4 py-2 text-right">{{ formatEur(row.total) }}</td>
                    </tr>
                  }
                  @if (totalsBillets(); as t) {
                    <tr class="bg-white font-bold border-t-2 border-gray-300 sticky bottom-0">
                      <td class="px-4 py-2 text-left">TOTAL</td>
                      <td class="px-4 py-2 text-right">{{ formatInt(t.count) }}</td>
                      <td class="px-4 py-2 text-right">{{ formatEur(t.total) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

          <!-- Tableau 3 — Tickets CB -->
          <div class="bg-white rounded-lg shadow flex flex-col min-h-0">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700 shrink-0">💳 Tickets CB</div>
            <div class="overflow-y-auto flex-1 min-h-0">
              <table class="min-w-full divide-y divide-gray-200 text-sm">
                <thead class="bg-gray-50 sticky top-0 z-10">
                  <tr>
                    <th (click)="onSortCb('amount')" class="px-4 py-2 text-left font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Montant {{ sortIndicator('cb', 'amount') }}</th>
                    <th (click)="onSortCb('count')" class="px-4 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Nombre {{ sortIndicator('cb', 'count') }}</th>
                    <th (click)="onSortCb('total')" class="px-4 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">Total € {{ sortIndicator('cb', 'total') }}</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-100">
                  @for (row of sortedCb(); track row.amount) {
                    <tr class="hover:bg-gray-50">
                      <td class="px-4 py-2 text-left">{{ formatEur(row.amount) }}</td>
                      <td class="px-4 py-2 text-right">{{ formatInt(row.count) }}</td>
                      <td class="px-4 py-2 text-right">{{ formatEur(row.total) }}</td>
                    </tr>
                  }
                  @if (totalsCb(); as t) {
                    <tr class="bg-white font-bold border-t-2 border-gray-300 sticky bottom-0">
                      <td class="px-4 py-2 text-left">TOTAL</td>
                      <td class="px-4 py-2 text-right">{{ formatInt(t.count) }}</td>
                      <td class="px-4 py-2 text-right">{{ formatEur(t.total) }}</td>
                    </tr>
                  }
                </tbody>
              </table>
            </div>
          </div>

        </div>
      }
    </div>
  `,
})
export class ComptagePiecesBilletsPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly rawPieces = signal<DenominationCount[]>([]);
  readonly rawBillets = signal<DenominationCount[]>([]);
  readonly rawCb = signal<CbTicket[]>([]);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly availableYears = signal<number[]>([new Date().getFullYear()]);

  // Sort state per table
  readonly piecesSortCol = signal<string>('value_cents');
  readonly piecesSortDir = signal<SortDir>('desc');
  readonly billetsSortCol = signal<string>('value_cents');
  readonly billetsSortDir = signal<SortDir>('desc');
  readonly cbSortCol = signal<string>('amount');
  readonly cbSortDir = signal<SortDir>('asc');

  // ── Sorted data ────────────────────────────────────────────────────
  readonly sortedPieces = computed(() => this.sortDenom(this.rawPieces(), this.piecesSortCol(), this.piecesSortDir()));
  readonly sortedBillets = computed(() => this.sortDenom(this.rawBillets(), this.billetsSortCol(), this.billetsSortDir()));
  readonly sortedCb = computed(() => this.sortCbData(this.rawCb(), this.cbSortCol(), this.cbSortDir()));

  // ── Totals ─────────────────────────────────────────────────────────
  readonly totalsPieces = computed(() => this.denomTotals(this.rawPieces()));
  readonly totalsBillets = computed(() => this.denomTotals(this.rawBillets()));
  readonly totalsCb = computed(() => {
    const data = this.rawCb();
    if (data.length === 0) return null;
    return {
      count: data.reduce((s, d) => s + d.count, 0),
      total: data.reduce((s, d) => s + d.total, 0),
    };
  });

  // ── UL Override effect ─────────────────────────────────────────────
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

  // ── Event handlers ─────────────────────────────────────────────────
  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.loadData();
  }

  onSortPieces(col: string): void { this.toggleSort(this.piecesSortCol, this.piecesSortDir, col); }
  onSortBillets(col: string): void { this.toggleSort(this.billetsSortCol, this.billetsSortDir, col); }
  onSortCb(col: string): void { this.toggleSort(this.cbSortCol, this.cbSortDir, col); }

  sortIndicator(table: string, col: string): string {
    const current = table === 'pieces' ? this.piecesSortCol()
      : table === 'billets' ? this.billetsSortCol()
      : this.cbSortCol();
    const dir = table === 'pieces' ? this.piecesSortDir()
      : table === 'billets' ? this.billetsSortDir()
      : this.cbSortDir();
    if (current !== col) return '';
    return dir === 'asc' ? '▲' : '▼';
  }

  formatInt(v: number): string { return fmtInt.format(v); }
  formatEur(v: number): string { return fmtEur.format(v); }

  // ── Data loading ───────────────────────────────────────────────────
  async loadData(forceRefresh = false): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const params = [`year=${this.selectedYear()}`];
      if (forceRefresh) params.push('refresh=true');
      const resp = await firstValueFrom(
        this.api.get<ComptagePiecesBilletsResponse>(`/api/comptage-pieces-billets?${params.join('&')}`)
      );
      this.rawPieces.set(resp.pieces || []);
      this.rawBillets.set(resp.billets || []);
      this.rawCb.set(resp.cb_tickets || []);
      if (resp.available_years?.length) {
        this.availableYears.set(resp.available_years);
      }
    } catch {
      this.error.set('Erreur lors du chargement du comptage pièces et billets.');
    } finally {
      this.loading.set(false);
    }
  }

  // ── Private helpers ────────────────────────────────────────────────
  private toggleSort(colSignal: ReturnType<typeof signal<string>>, dirSignal: ReturnType<typeof signal<SortDir>>, col: string): void {
    if (colSignal() === col) {
      dirSignal.set(dirSignal() === 'asc' ? 'desc' : 'asc');
    } else {
      colSignal.set(col);
      dirSignal.set('asc');
    }
  }

  private sortDenom(data: DenominationCount[], col: string, dir: SortDir): DenominationCount[] {
    const sorted = [...data];
    const m = dir === 'asc' ? 1 : -1;
    return sorted.sort((a, b) => {
      const va = (a as unknown as Record<string, number | string>)[col] ?? 0;
      const vb = (b as unknown as Record<string, number | string>)[col] ?? 0;
      return va < vb ? -m : va > vb ? m : 0;
    });
  }

  private sortCbData(data: CbTicket[], col: string, dir: SortDir): CbTicket[] {
    const sorted = [...data];
    const m = dir === 'asc' ? 1 : -1;
    return sorted.sort((a, b) => {
      const va = (a as unknown as Record<string, number>)[col] ?? 0;
      const vb = (b as unknown as Record<string, number>)[col] ?? 0;
      return va < vb ? -m : va > vb ? m : 0;
    });
  }

  private denomTotals(data: DenominationCount[]): { count: number; total: number } | null {
    if (data.length === 0) return null;
    return {
      count: data.reduce((s, d) => s + d.count, 0),
      total: data.reduce((s, d) => s + d.total, 0),
    };
  }
}
