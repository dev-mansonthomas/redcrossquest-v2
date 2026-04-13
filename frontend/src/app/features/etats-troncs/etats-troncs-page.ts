import { Component, inject, signal, effect } from '@angular/core';
import { DatePipe, DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { environment } from '../../../environments/environment';

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
  total_amount?: number;
  total_hours?: number;
}

interface EtatsTroncsResponse {
  troncs: TroncEtatDetail[];
}

type TroncStatusFilter = 'prepared' | 'collecting' | 'uncounted' | 'counted';

// ── RCQ V1 URL constants ─────────────────────────────────────────────
const RCQ_TRONC_QUETEUR_URI = '#!/tronc_queteur/edit/';
const RCQ_TRONC_URI = '#!/troncs/edit/';
const RCQ_QUETEUR_URI = '#!/queteurs/edit/';

@Component({
  selector: 'app-etats-troncs-page',
  standalone: true,
  imports: [DatePipe, DecimalPipe],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div class="min-h-14 px-4 py-2 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 gap-4">
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
        } @else if (troncs().length === 0) {
          <div class="flex items-center justify-center h-64">
            <p class="text-gray-500">Aucun tronc trouvé pour ce filtre.</p>
          </div>
        } @else {
          <div class="bg-white rounded-xl shadow-sm border border-gray-100 overflow-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">ID TQ</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Quêteur</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Tronc</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Prénom</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Nom</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Départ théorique</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Départ</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Retour</th>
                  <th class="px-3 py-2 text-left font-semibold text-gray-700">Point de quête</th>
                  @if (selectedFilter() === 'counted') {
                    <th class="px-3 py-2 text-right font-semibold text-gray-700">Montant (€)</th>
                    <th class="px-3 py-2 text-right font-semibold text-gray-700">Heures</th>
                    <th class="px-3 py-2 text-right font-semibold text-gray-700">€/h</th>
                  }
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (t of troncs(); track t.tronc_queteur_id) {
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
                    @if (selectedFilter() === 'counted') {
                      <td class="px-3 py-2 text-right">{{ t.total_amount | number:'1.2-2' }}</td>
                      <td class="px-3 py-2 text-right">{{ t.total_hours | number:'1.1-1' }}h</td>
                      <td class="px-3 py-2 text-right">{{ t.total_hours && t.total_hours > 0 ? (t.total_amount! / t.total_hours | number:'1.2-2') : '–' }}</td>
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
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly filters: { value: TroncStatusFilter; label: string }[] = [
    { value: 'prepared', label: '⏳ Préparé' },
    { value: 'collecting', label: '🚶 En quête' },
    { value: 'uncounted', label: '📥 Non compté' },
    { value: 'counted', label: '✅ Compté' },
  ];

  readonly selectedFilter = signal<TroncStatusFilter>('prepared');
  readonly selectedYear = signal(new Date().getFullYear());
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly troncs = signal<TroncEtatDetail[]>([]);

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
