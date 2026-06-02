import { Component, inject, signal, effect, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';
import { DayFilterComponent } from '../../shared/components/day-filter/day-filter.component';

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
  cheques_total: number;
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
  imports: [DayFilterComponent],
  styles: [`:host { display: block; height: 100%; }`],
  template: `
    <div class="h-full flex flex-col overflow-hidden">
      <!-- Header -->
      <div [class]="'min-h-14 px-4 py-2 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 gap-4 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800 whitespace-nowrap">🪙 Comptage pièces, billets et CB</h2>
        <app-day-filter [selected]="selectedDays()" (selectedChange)="onDaysChanged($event)" />
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
          <button (click)="downloadCsv()" [disabled]="loading()" class="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50">
            📥 Export CSV
          </button>
        </div>
      </div>

      <div class="flex-1 overflow-y-auto lg:overflow-hidden p-6">
      <!-- Loading / Error -->
      @if (loading()) {
        <div class="text-center py-12 text-gray-500">Chargement…</div>
      }
      @if (error()) {
        <div class="bg-red-50 text-red-700 p-4 rounded-md mb-4">{{ error() }}</div>
      }

      <!-- 3 tables side by side -->
      @if (!loading() && !error()) {
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:h-full">

          <!-- Tableau 1 — Pièces -->
          <div class="bg-white rounded-lg shadow flex flex-col lg:min-h-0">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700 shrink-0">🪙 Pièces</div>
            <div class="lg:overflow-y-auto lg:flex-1 lg:min-h-0">
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
          <div class="bg-white rounded-lg shadow flex flex-col lg:min-h-0">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700 shrink-0">💶 Billets</div>
            <div class="lg:overflow-y-auto lg:flex-1 lg:min-h-0">
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
          <div class="bg-white rounded-lg shadow flex flex-col lg:min-h-0">
            <div class="px-4 py-3 bg-gray-50 border-b font-semibold text-gray-700 shrink-0">💳 Tickets CB</div>
            <div class="lg:overflow-y-auto lg:flex-1 lg:min-h-0">
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

      <!-- Grand total footer -->
      @if (!loading() && !error()) {
        <div class="shrink-0 px-4 py-3 bg-white border-t border-gray-200 shadow-inner">
          <div class="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-gray-700">
            <span><span class="font-medium text-gray-600">Pièces :</span> {{ formatEur(piecesGrandTotal()) }}</span>
            <span class="text-gray-300">|</span>
            <span><span class="font-medium text-gray-600">Billets :</span> {{ formatEur(billetsGrandTotal()) }}</span>
            <span class="text-gray-300">|</span>
            <span><span class="font-medium text-gray-600">CB :</span> {{ formatEur(cbGrandTotal()) }}</span>
            <span class="text-gray-300">|</span>
            <span><span class="font-medium text-gray-600">Chèques :</span> {{ formatEur(chequesTotal()) }}</span>
            <span class="text-gray-300">|</span>
            <span class="text-base font-bold text-red-700"><span class="font-semibold">Grand total :</span> {{ formatEur(grandTotal()) }}</span>
          </div>
        </div>
      }
    </div>
  `,
})
export class ComptagePiecesBilletsPageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly rawPieces = signal<DenominationCount[]>([]);
  readonly rawBillets = signal<DenominationCount[]>([]);
  readonly rawCb = signal<CbTicket[]>([]);
  readonly chequesTotal = signal<number>(0);
  readonly selectedYear = signal(new Date().getFullYear());
  readonly availableYears = signal<number[]>([new Date().getFullYear()]);
  readonly selectedDays = signal<boolean[]>(Array(9).fill(true));

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

  // ── Footer totals (Grand total) ────────────────────────────────────
  readonly piecesGrandTotal = computed(() => this.rawPieces().reduce((s, d) => s + d.total, 0));
  readonly billetsGrandTotal = computed(() => this.rawBillets().reduce((s, d) => s + d.total, 0));
  readonly cbGrandTotal = computed(() => this.rawCb().reduce((s, d) => s + d.total, 0));
  readonly grandTotal = computed(() =>
    this.piecesGrandTotal() + this.billetsGrandTotal() + this.cbGrandTotal() + this.chequesTotal()
  );

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

  onDaysChanged(days: boolean[]): void {
    this.selectedDays.set(days);
    this.loadData();
  }

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
      const checked = this.selectedDays();
      const nbChecked = checked.filter(Boolean).length;
      if (nbChecked === 0) {
        params.push('days=');
      } else if (nbChecked < 9) {
        const days = checked.map((v, i) => v ? i + 1 : null).filter(x => x !== null).join(',');
        params.push(`days=${days}`);
      }
      const resp = await firstValueFrom(
        this.api.get<ComptagePiecesBilletsResponse>(`/api/comptage-pieces-billets?${params.join('&')}`)
      );
      this.rawPieces.set(resp.pieces || []);
      this.rawBillets.set(resp.billets || []);
      this.rawCb.set(resp.cb_tickets || []);
      this.chequesTotal.set(resp.cheques_total || 0);
      if (resp.available_years?.length) {
        this.availableYears.set(resp.available_years);
      }
    } catch {
      if (this.selectedDays().filter(Boolean).length === 0) {
        this.rawPieces.set([]);
        this.rawBillets.set([]);
        this.rawCb.set([]);
        this.chequesTotal.set(0);
      } else {
        this.error.set('Erreur lors du chargement du comptage pièces et billets.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  // ── CSV Export ─────────────────────────────────────────────────────
  downloadCsv(): void {
    const pieces = this.sortedPieces();
    const billets = this.sortedBillets();
    const cb = this.sortedCb();

    if (pieces.length === 0 && billets.length === 0 && cb.length === 0) return;

    const BOM = '\uFEFF';
    const lines: string[] = [];

    lines.push('--- Pièces ---');
    lines.push('Dénomination,Quantité,Total €');
    for (const row of pieces) {
      lines.push(`${row.label},${row.count},${row.total.toFixed(2)}`);
    }
    const totalPieces = pieces.reduce((s, r) => s + r.total, 0);
    lines.push(`TOTAL,,${totalPieces.toFixed(2)}`);

    lines.push('');

    lines.push('--- Billets ---');
    lines.push('Dénomination,Quantité,Total €');
    for (const row of billets) {
      lines.push(`${row.label},${row.count},${row.total.toFixed(2)}`);
    }
    const totalBillets = billets.reduce((s, r) => s + r.total, 0);
    lines.push(`TOTAL,,${totalBillets.toFixed(2)}`);

    lines.push('');

    lines.push('--- Carte Bancaire ---');
    lines.push('Montant,Quantité,Total €');
    for (const row of cb) {
      lines.push(`${row.amount.toFixed(2)},${row.count},${row.total.toFixed(2)}`);
    }
    const totalCb = cb.reduce((s, r) => s + r.total, 0);
    lines.push(`TOTAL,,${totalCb.toFixed(2)}`);

    lines.push('');

    const totalCheques = this.chequesTotal();
    lines.push('--- Chèques ---');
    lines.push(`TOTAL,,${totalCheques.toFixed(2)}`);

    lines.push('');
    lines.push(`TOTAL GÉNÉRAL,,${(totalPieces + totalBillets + totalCb + totalCheques).toFixed(2)}`);

    const csv = lines.join('\n');
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const ulName = this.ulOverrideService.override()?.name ?? this.authService.user()?.ul_name ?? 'UL';
    const safeName = ulName.replace(/[^a-zA-Z0-9àâäéèêëïîôùûüçÀÂÄÉÈÊËÏÎÔÙÛÜÇ _-]/g, '').replace(/\s+/g, '_');
    const checked = this.selectedDays();
    const nbChecked = checked.filter(Boolean).length;
    let daysSuffix = '';
    if (nbChecked > 0 && nbChecked < 9) {
      const days = checked.map((v, i) => v ? i + 1 : null).filter(x => x !== null).join('-');
      daysSuffix = `-jours-${days}`;
    }
    const filename = `comptage-pieces-billets-${this.selectedYear()}-${safeName}${daysSuffix}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
