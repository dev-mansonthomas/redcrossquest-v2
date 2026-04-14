import { Component, inject, signal, effect, computed } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { environment } from '../../../environments/environment';
import { ENV_HEADER_BG } from '../../core/utils/env-header';

// ── Interfaces ───────────────────────────────────────────────────────
interface TroncEtatDetail {
  tronc_queteur_id: number;
  queteur_id: number;
  tronc_id: number;
  first_name: string | null;
  last_name: string | null;
  depart_theorique: string | null;
  depart: string | null;
  retour: string | null;
  point_quete_name: string | null;
  quete_day_num?: number | null;
  total_amount?: number;
  total_hours?: number;
  coins_money_bag_id?: string | null;
  bills_money_bag_id?: string | null;
}

interface EtatsTroncsResponse {
  troncs: TroncEtatDetail[];
}

type TroncStatusFilter = 'prepared' | 'collecting' | 'uncounted' | 'counted' | 'missing_bags';

// ── RCQ V1 URL constants ─────────────────────────────────────────────
const RCQ_TRONC_QUETEUR_URI = '#!/tronc_queteur/edit/';
const RCQ_TRONC_URI = '#!/troncs/edit/';
const RCQ_QUETEUR_URI = '#!/queteurs/edit/';

const DAY_LABELS = [
  'J1: Sam',
  'J2: Dim',
  'J3: Lun',
  'J4: Mar',
  'J5: Mer',
  'J6: Jeu',
  'J7: Ven',
  'J8: Sam',
  'J9: Dim',
];

@Component({
  selector: 'app-etats-troncs-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div [class]="'min-h-14 px-4 py-2 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 gap-4 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800 whitespace-nowrap">📦 États des troncs</h2>
        <div class="flex items-center gap-2">
          <!-- Toggle group -->
          @for (f of filters; track f.value) {
            <button
              (click)="onFilterChange(f.value)"
              [class]="selectedFilter() === f.value
                ? 'px-3 py-1.5 text-sm font-medium rounded-md bg-red-600 text-white shadow-sm'
                : 'px-3 py-1.5 text-sm font-medium rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200'">
              {{ f.label }}
            </button>
          }
          <!-- Search -->
          <input type="text"
            [value]="searchQuery()"
            (input)="searchQuery.set($any($event.target).value)"
            placeholder="🔍 Rechercher (nom, prénom, ID…)"
            class="px-3 py-1 text-sm border border-gray-300 rounded-md focus:ring-red-500 focus:border-red-500 w-48">
          <!-- Year dropdown -->
          <select
            [value]="selectedYear()"
            (change)="onYearChange($event)"
            class="text-sm border border-gray-300 rounded-md px-2 py-1.5 bg-white focus:ring-red-500 focus:border-red-500">
            @for (y of yearOptions(); track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>
          <!-- Refresh -->
          <button (click)="loadData()" class="px-3 py-1.5 text-sm rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200">
            🔄
          </button>
        </div>
      </div>

      <!-- Day filter bar -->
      <div class="px-4 py-2 bg-gray-50 border-b border-gray-200 flex flex-wrap items-center justify-center gap-3 shrink-0">
        <span class="text-sm font-medium text-gray-700 whitespace-nowrap">Jour :</span>
        @for (label of dayLabels; track label; let i = $index) {
          <label class="flex items-center gap-1 text-sm text-gray-700 cursor-pointer select-none">
            <input type="checkbox"
              [checked]="selectedDays()[i]"
              (change)="toggleDay(i)"
              class="rounded border-gray-300 text-red-600 focus:ring-red-500">
            {{ label }}
          </label>
        }
        <button (click)="selectAllDays()"
          class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Tous</button>
        <button (click)="selectNoDays()"
          class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Aucun</button>
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
        } @else if (filteredTroncs().length === 0) {
          <div class="flex items-center justify-center h-64">
            <p class="text-gray-500">Aucun tronc trouvé pour ce filtre.</p>
          </div>
        } @else {
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th (click)="onSort('tronc_queteur_id')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">ID TQ {{ sortIndicator('tronc_queteur_id') }}</th>
                  <th (click)="onSort('queteur_id')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Quêteur {{ sortIndicator('queteur_id') }}</th>
                  <th (click)="onSort('tronc_id')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Tronc {{ sortIndicator('tronc_id') }}</th>
                  <th (click)="onSort('first_name')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Prénom {{ sortIndicator('first_name') }}</th>
                  <th (click)="onSort('last_name')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Nom {{ sortIndicator('last_name') }}</th>
                  <th (click)="onSort('depart_theorique')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Départ théorique {{ sortIndicator('depart_theorique') }}</th>
                  <th (click)="onSort('depart')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Départ {{ sortIndicator('depart') }}</th>
                  <th (click)="onSort('retour')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Retour {{ sortIndicator('retour') }}</th>
                  <th (click)="onSort('point_quete_name')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Point de quête {{ sortIndicator('point_quete_name') }}</th>
                  <th (click)="onSort('quete_day_num')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Jour {{ sortIndicator('quete_day_num') }}</th>
                  @if (selectedFilter() === 'counted' || selectedFilter() === 'missing_bags') {
                    <th (click)="onSort('total_amount')" class="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Montant (€) {{ sortIndicator('total_amount') }}</th>
                    <th (click)="onSort('total_hours')" class="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Heures {{ sortIndicator('total_hours') }}</th>
                    <th (click)="onSort('euro_per_hour')" class="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">€/h {{ sortIndicator('euro_per_hour') }}</th>
                  }
                  @if (selectedFilter() === 'missing_bags') {
                    <th (click)="onSort('coins_money_bag_id')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Sac pièces {{ sortIndicator('coins_money_bag_id') }}</th>
                    <th (click)="onSort('bills_money_bag_id')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Sac billets {{ sortIndicator('bills_money_bag_id') }}</th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (t of filteredTroncs(); track t.tronc_queteur_id) {
                  <tr class="hover:bg-gray-50">
                    <td class="px-3 py-2"><a [href]="rcqBaseUrl + rcqTroncQueteurUri + t.tronc_queteur_id" target="_blank" class="text-red-600 hover:underline">{{ t.tronc_queteur_id }}</a></td>
                    <td class="px-3 py-2"><a [href]="rcqBaseUrl + rcqQueteurUri + t.queteur_id" target="_blank" class="text-red-600 hover:underline">{{ t.queteur_id }}</a></td>
                    <td class="px-3 py-2"><a [href]="rcqBaseUrl + rcqTroncUri + t.tronc_id" target="_blank" class="text-red-600 hover:underline">{{ t.tronc_id }}</a></td>
                    <td class="px-3 py-2">{{ t.first_name }}</td>
                    <td class="px-3 py-2">{{ t.last_name }}</td>
                    <td class="px-3 py-2">{{ t.depart_theorique | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td class="px-3 py-2">{{ t.depart | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td class="px-3 py-2">{{ t.retour | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td class="px-3 py-2">{{ t.point_quete_name }}</td>
                    <td class="px-3 py-2">{{ t.quete_day_num ? 'J' + t.quete_day_num : '' }}</td>
                    @if (selectedFilter() === 'counted' || selectedFilter() === 'missing_bags') {
                      <td class="px-3 py-2 text-right">{{ t.total_amount | number:'1.2-2' }}</td>
                      <td class="px-3 py-2 text-right">{{ t.total_hours | number:'1.1-1' }}h</td>
                      <td class="px-3 py-2 text-right">{{ t.total_hours && t.total_hours > 0 ? (t.total_amount! / t.total_hours | number:'1.2-2') : '–' }}</td>
                    }
                    @if (selectedFilter() === 'missing_bags') {
                      <td class="px-3 py-2">{{ t.coins_money_bag_id ?? '❌' }}</td>
                      <td class="px-3 py-2">{{ t.bills_money_bag_id ?? '❌' }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </div>
  `,
})
export class EtatsTroncsPageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly filters: { value: TroncStatusFilter; label: string }[] = [
    { value: 'prepared', label: '⏳ Préparé' },
    { value: 'collecting', label: '🚶 En quête' },
    { value: 'uncounted', label: '📥 Non compté' },
    { value: 'counted', label: '✅ Compté' },
    { value: 'missing_bags', label: '🏷️ Sans sacs' },
  ];

  readonly dayLabels = DAY_LABELS;
  readonly selectedFilter = signal<TroncStatusFilter>('prepared');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly troncs = signal<TroncEtatDetail[]>([]);
  readonly searchQuery = signal('');
  readonly selectedDays = signal<boolean[]>(Array(9).fill(true));
  readonly sortColumn = signal<string>('tronc_queteur_id');
  readonly sortDirection = signal<'asc' | 'desc'>('asc');

  private static readonly DATE_COLUMNS = new Set(['depart_theorique', 'depart', 'retour']);
  private static readonly NUMBER_COLUMNS = new Set([
    'tronc_queteur_id', 'queteur_id', 'tronc_id', 'quete_day_num',
    'total_amount', 'total_hours', 'euro_per_hour',
  ]);

  readonly filteredTroncs = computed(() => {
    const query = this.searchQuery().toLowerCase().trim();
    const days = this.selectedDays();
    const anyDaySelected = days.some(d => d);

    let result = this.troncs();

    // Day filter
    if (!anyDaySelected) {
      return [];
    }
    if (!days.every(d => d)) {
      result = result.filter(t => {
        if (t.quete_day_num == null) return false;
        return days[t.quete_day_num - 1] === true;
      });
    }

    // Search filter
    if (query) {
      result = result.filter(t => {
        const fields = [
          t.first_name ?? '',
          t.last_name ?? '',
          String(t.tronc_id),
          String(t.tronc_queteur_id),
          String(t.queteur_id),
          t.point_quete_name ?? '',
        ];
        return fields.some(f => f.toLowerCase().includes(query));
      });
    }

    // Sort
    const col = this.sortColumn();
    const dir = this.sortDirection();
    if (col) {
      result = [...result].sort((a, b) => {
        let valA: any;
        let valB: any;

        if (col === 'euro_per_hour') {
          valA = (a.total_hours && a.total_hours > 0) ? a.total_amount! / a.total_hours : null;
          valB = (b.total_hours && b.total_hours > 0) ? b.total_amount! / b.total_hours : null;
        } else {
          valA = (a as any)[col];
          valB = (b as any)[col];
        }

        // Nulls last
        if (valA == null && valB == null) return 0;
        if (valA == null) return 1;
        if (valB == null) return -1;

        let cmp = 0;
        if (EtatsTroncsPageComponent.DATE_COLUMNS.has(col)) {
          cmp = new Date(valA).getTime() - new Date(valB).getTime();
        } else if (EtatsTroncsPageComponent.NUMBER_COLUMNS.has(col)) {
          cmp = Number(valA) - Number(valB);
        } else {
          cmp = String(valA).localeCompare(String(valB), 'fr', { sensitivity: 'base' });
        }

        return dir === 'asc' ? cmp : -cmp;
      });
    }

    return result;
  });

  readonly rcqBaseUrl = environment.rcqV1Url;
  readonly rcqTroncQueteurUri = RCQ_TRONC_QUETEUR_URI;
  readonly rcqTroncUri = RCQ_TRONC_URI;
  readonly rcqQueteurUri = RCQ_QUETEUR_URI;
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

  onFilterChange(filter: TroncStatusFilter): void {
    this.selectedFilter.set(filter);
    this.loadData();
  }

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.loadData();
  }

  toggleDay(index: number): void {
    const current = [...this.selectedDays()];
    current[index] = !current[index];
    this.selectedDays.set(current);
  }

  selectAllDays(): void {
    this.selectedDays.set(Array(9).fill(true));
  }

  selectNoDays(): void {
    this.selectedDays.set(Array(9).fill(false));
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

  async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const resp = await firstValueFrom(
        this.api.get<EtatsTroncsResponse>(
          `/api/etats-troncs?status=${this.selectedFilter()}&year=${this.selectedYear()}`
        )
      );
      this.troncs.set(resp.troncs || []);
    } catch {
      this.error.set('Erreur lors du chargement des états des troncs.');
    } finally {
      this.loading.set(false);
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
