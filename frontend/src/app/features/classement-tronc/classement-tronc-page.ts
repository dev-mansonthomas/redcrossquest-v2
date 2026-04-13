import { Component, inject, signal, effect, computed } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { environment } from '../../../environments/environment';

interface QueteurTroncRow {
  queteur_id: number;
  first_name: string;
  last_name: string;
  secteur: number | null;
  best_montant: number;
  best_poids_kg: number;
  best_duree_h: number;
  best_taux_horaire: number | null;
}

interface BestTroncRow {
  tronc_queteur_id: number;
  total_euro: number;
  hours: number;
  weight_kg: number;
  point_quete_name: string;
  champion_types: string[];
}

// ── RCQ V1 URL constants ─────────────────────────────────────────────
const RCQ_TRONC_QUETEUR_URI = '#!/tronc_queteur/edit/';

type SortColumn = 'best_montant' | 'best_poids_kg' | 'best_duree_h' | 'best_taux_horaire';
type SortDirection = 'asc' | 'desc';

const CHAMPION_BADGES: Record<string, string> = {
  montant: '💰 Montant',
  poids: '⚖️ Poids',
  duree: '⏱️ Durée',
  taux_horaire: '📈 Taux horaire',
};

const CHAMPION_COLORS: Record<string, string> = {
  montant: 'bg-yellow-100 text-yellow-800',
  poids: 'bg-blue-100 text-blue-800',
  duree: 'bg-green-100 text-green-800',
  taux_horaire: 'bg-purple-100 text-purple-800',
};

@Component({
  selector: 'app-classement-tronc-page',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div class="h-14 px-4 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0">
        <h2 class="text-lg font-semibold text-gray-800">🏆 Classement par Tronc</h2>
        <div class="flex items-center gap-3">
          <select
            [value]="selectedSecteur()"
            (change)="onSecteurChange($event)"
            class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500">
            <option value="">Tous secteurs</option>
            <option value="benevole">Bénévole</option>
            <option value="benevole_jour">Bénévole d'un jour</option>
            <option value="ancien">Ancien bénévole</option>
            <option value="commercant">Commerçant</option>
            <option value="special">Spécial</option>
          </select>
          <select
            [value]="selectedYear()"
            (change)="onYearChange($event)"
            class="px-3 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500">
            <option [value]="0" [selected]="0 === selectedYear()">Toutes années</option>
            @for (year of yearOptions(); track year) {
              <option [value]="year" [selected]="year === selectedYear()">{{ year }}</option>
            }
          </select>
          <button
            (click)="refresh()"
            class="px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition-colors shadow-sm"
            [disabled]="loading()">
            🔄 Actualiser
          </button>
        </div>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-4">
        @if (error()) {
          <div class="p-4 bg-red-50 text-red-600 border border-red-200 rounded-lg mb-4">{{ error() }}</div>
        }
        @if (loading()) {
          <div class="flex items-center justify-center py-12">
            <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
            <span class="ml-3 text-gray-500">Chargement...</span>
          </div>
        } @else if (sortedQueteurs().length === 0 && !error()) {
          <div class="text-center py-12 text-gray-500">Aucun quêteur trouvé pour cette année.</div>
        } @else {
          <table class="w-full text-sm border-collapse">
            <thead>
              <tr class="bg-gray-50 border-b border-gray-200">
                <th class="px-3 py-2 text-left font-semibold text-gray-600">#</th>
                <th class="px-3 py-2 text-left font-semibold text-gray-600">Nom</th>
                <th class="px-3 py-2 text-left font-semibold text-gray-600">Prénom</th>
                <th class="px-3 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:text-red-600 select-none"
                    (click)="toggleSort('best_montant')">Meilleur €{{ sortIndicator('best_montant') }}</th>
                <th class="px-3 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:text-red-600 select-none"
                    (click)="toggleSort('best_poids_kg')">Meilleur poids (kg){{ sortIndicator('best_poids_kg') }}</th>
                <th class="px-3 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:text-red-600 select-none"
                    (click)="toggleSort('best_duree_h')">Plus longue durée (h){{ sortIndicator('best_duree_h') }}</th>
                <th class="px-3 py-2 text-right font-semibold text-gray-600 cursor-pointer hover:text-red-600 select-none"
                    (click)="toggleSort('best_taux_horaire')">Meilleur €/h{{ sortIndicator('best_taux_horaire') }}</th>
              </tr>
            </thead>
            <tbody>
              @for (q of sortedQueteurs(); track q.queteur_id; let i = $index) {
                <tr (click)="toggleExpand(q)"
                    class="cursor-pointer transition-colors"
                    [class.bg-blue-50]="expandedQueteurId() === q.queteur_id"
                    [class.hover:bg-gray-50]="expandedQueteurId() !== q.queteur_id"
                    [class.bg-white]="expandedQueteurId() !== q.queteur_id && i % 2 === 0"
                    [class.bg-gray-50\/50]="expandedQueteurId() !== q.queteur_id && i % 2 !== 0">
                  <td class="px-3 py-2 text-gray-500 font-mono">{{ i + 1 }}</td>
                  <td class="px-3 py-2 font-medium text-gray-800">{{ q.last_name }}</td>
                  <td class="px-3 py-2 text-gray-700">{{ q.first_name }}</td>
                  <td class="px-3 py-2 text-right font-medium text-gray-800">{{ q.best_montant | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right text-gray-700">{{ q.best_poids_kg | number:'1.2-2' }}</td>
                  <td class="px-3 py-2 text-right text-gray-700">{{ q.best_duree_h | number:'1.1-1' }}</td>
                  <td class="px-3 py-2 text-right text-gray-700">{{ q.best_taux_horaire != null ? (q.best_taux_horaire | number:'1.2-2') : '—' }}</td>
                </tr>
                <!-- Drill-down -->
                @if (expandedQueteurId() === q.queteur_id) {
                  <tr class="expand-enter">
                    <td colspan="7" class="p-0">
                      <div class="ml-8 mr-4 my-2 bg-gray-50 rounded-lg border border-gray-200 p-3">
                        @if (troncsLoading()) {
                          <div class="flex items-center py-3 text-gray-500">
                            <div class="animate-spin rounded-full h-5 w-5 border-b-2 border-red-600 mr-2"></div>
                            Chargement des meilleurs troncs...
                          </div>
                        } @else if (bestTroncs().length === 0) {
                          <p class="text-gray-500 py-2">Aucun tronc trouvé.</p>
                        } @else {
                          <table class="w-full text-sm">
                            <thead>
                              <tr class="border-b border-gray-200">
                                <th class="px-3 py-1.5 text-left font-semibold text-gray-600">ID TQ</th>
                                <th class="px-3 py-1.5 text-right font-semibold text-gray-600">Total €</th>
                                <th class="px-3 py-1.5 text-right font-semibold text-gray-600">Durée (h)</th>
                                <th class="px-3 py-1.5 text-right font-semibold text-gray-600">Poids (kg)</th>
                                <th class="px-3 py-1.5 text-left font-semibold text-gray-600">Point de quête</th>
                                <th class="px-3 py-1.5 text-left font-semibold text-gray-600">Champion de</th>
                              </tr>
                            </thead>
                            <tbody>
                              @for (t of bestTroncs(); track t.tronc_queteur_id) {
                                <tr (click)="openTroncQueteur(t.tronc_queteur_id); $event.stopPropagation()"
                                    class="cursor-pointer hover:bg-blue-50 transition-colors border-b border-gray-100 last:border-0">
                                  <td class="px-3 py-1.5 font-mono text-gray-600">{{ t.tronc_queteur_id }}</td>
                                  <td class="px-3 py-1.5 text-right text-gray-800">{{ t.total_euro | number:'1.2-2' }}</td>
                                  <td class="px-3 py-1.5 text-right text-gray-700">{{ t.hours | number:'1.1-1' }}h</td>
                                  <td class="px-3 py-1.5 text-right text-gray-700">{{ t.weight_kg | number:'1.2-2' }}</td>
                                  <td class="px-3 py-1.5 text-gray-700">{{ t.point_quete_name }}</td>
                                  <td class="px-3 py-1.5">
                                    <div class="flex flex-wrap gap-1">
                                      @for (c of t.champion_types; track c) {
                                        <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium {{ championColor(c) }}">{{ championLabel(c) }}</span>
                                      }
                                    </div>
                                  </td>
                                </tr>
                              }
                            </tbody>
                          </table>
                        }
                      </div>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .expand-enter { animation: expandIn 200ms ease-out; }
    @keyframes expandIn {
      from { opacity: 0; max-height: 0; overflow: hidden; }
      to { opacity: 1; max-height: 500px; overflow: hidden; }
    }
  `],
})
export class ClassementTroncPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly selectedYear = signal(new Date().getFullYear());
  readonly selectedSecteur = signal('');
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly queteurs = signal<QueteurTroncRow[]>([]);
  readonly sortColumn = signal<SortColumn>('best_montant');
  readonly sortDirection = signal<SortDirection>('desc');
  readonly expandedQueteurId = signal<number | null>(null);
  readonly bestTroncs = signal<BestTroncRow[]>([]);
  readonly troncsLoading = signal(false);

  private readonly rcqBaseUrl = environment.rcqV1Url;
  private readonly rcqTroncQueteurUri = RCQ_TRONC_QUETEUR_URI;
  private overrideInitialized = false;

  readonly sortedQueteurs = computed(() => {
    const list = [...this.queteurs()];
    const col = this.sortColumn();
    const dir = this.sortDirection();
    list.sort((a, b) => {
      const va = a[col] ?? 0;
      const vb = b[col] ?? 0;
      return dir === 'asc' ? va - vb : vb - va;
    });
    return list;
  });

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.expandedQueteurId.set(null);
    this.bestTroncs.set([]);
    this.loadQueteurs();
  });

  constructor() {
    this.loadQueteurs();
  }

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.expandedQueteurId.set(null);
    this.bestTroncs.set([]);
    this.loadQueteurs();
  }

  onSecteurChange(event: Event): void {
    const secteur = (event.target as HTMLSelectElement).value;
    this.selectedSecteur.set(secteur);
    this.expandedQueteurId.set(null);
    this.bestTroncs.set([]);
    this.loadQueteurs();
  }

  refresh(): void {
    this.expandedQueteurId.set(null);
    this.bestTroncs.set([]);
    this.loadQueteurs();
  }

  toggleSort(column: SortColumn): void {
    if (this.sortColumn() === column) {
      this.sortDirection.set(this.sortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortColumn.set(column);
      this.sortDirection.set('desc');
    }
  }

  sortIndicator(column: SortColumn): string {
    if (this.sortColumn() !== column) return '';
    return this.sortDirection() === 'asc' ? ' ▲' : ' ▼';
  }

  async toggleExpand(queteur: QueteurTroncRow): Promise<void> {
    if (this.expandedQueteurId() === queteur.queteur_id) {
      this.expandedQueteurId.set(null);
      this.bestTroncs.set([]);
      return;
    }
    this.expandedQueteurId.set(queteur.queteur_id);
    this.troncsLoading.set(true);
    this.bestTroncs.set([]);
    try {
      const resp = await firstValueFrom(
        this.api.get<{ troncs: BestTroncRow[] }>(
          `/api/classement-tronc/${queteur.queteur_id}/troncs-champions?year=${this.selectedYear()}`
        )
      );
      this.bestTroncs.set(resp.troncs || []);
    } catch (err) {
      console.error('Failed to load best troncs', err);
    } finally {
      this.troncsLoading.set(false);
    }
  }

  openTroncQueteur(troncQueteurId: number): void {
    if (this.rcqBaseUrl && this.rcqTroncQueteurUri) {
      window.open(`${this.rcqBaseUrl}/${this.rcqTroncQueteurUri}${troncQueteurId}`, '_blank');
    }
  }

  championLabel(key: string): string {
    return CHAMPION_BADGES[key] || key;
  }

  championColor(key: string): string {
    return CHAMPION_COLORS[key] || 'bg-gray-100 text-gray-800';
  }

  private async loadQueteurs(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const secteurParam = this.selectedSecteur() ? `&secteur=${this.selectedSecteur()}` : '';
      const resp = await firstValueFrom(
        this.api.get<{ queteurs: QueteurTroncRow[] }>(
          `/api/classement-tronc?year=${this.selectedYear()}${secteurParam}`
        )
      );
      this.queteurs.set(resp.queteurs || []);
    } catch (err) {
      this.error.set('Erreur lors du chargement du classement par tronc');
      console.error('Failed to load classement tronc', err);
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
