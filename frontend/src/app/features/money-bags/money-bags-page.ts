import { Component, inject, signal, effect } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';

interface MoneyBagSummary {
  bag_id: string;
  bag_type: 'coins' | 'bills';
  tronc_count: number;
  weight_grams: number;
  total_amount: number;
}

interface MoneyBagItem {
  type: string;
  count: number;
  amount: number;
}

interface MoneyBagDetail {
  bag_id: string;
  bag_type: string;
  weight_grams: number;
  total_amount: number;
  tronc_count: number;
  items: MoneyBagItem[];
}

interface TroncQueteurItem {
  tronc_queteur_id: number;
  first_name: string;
  last_name: string;
  point_quete_name: string;
  tronc_id: number;
}

interface RcqUrls {
  base_url: string;
  tronc_queteur_uri: string;
}

@Component({
  selector: 'app-money-bags-page',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header — same h-14 as sidebar header -->
      <div class="h-14 px-4 bg-white border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0">
        <h2 class="text-lg font-semibold text-gray-800">💰 Sacs de Banque</h2>
        <div class="flex items-center gap-3">
          <!-- Toggle Pièces / Billets -->
          <div class="flex rounded-lg overflow-hidden border border-gray-300 shadow-sm">
            <button
              (click)="setType('coins')"
              class="px-3 py-1.5 text-sm font-medium transition-colors"
              [class.bg-red-600]="selectedType() === 'coins'"
              [class.text-white]="selectedType() === 'coins'"
              [class.bg-white]="selectedType() !== 'coins'"
              [class.text-gray-700]="selectedType() !== 'coins'">
              🪙 Pièces
            </button>
            <button
              (click)="setType('bills')"
              class="px-3 py-1.5 text-sm font-medium transition-colors"
              [class.bg-red-600]="selectedType() === 'bills'"
              [class.text-white]="selectedType() === 'bills'"
              [class.bg-white]="selectedType() !== 'bills'"
              [class.text-gray-700]="selectedType() !== 'bills'">
              💵 Billets
            </button>
          </div>
          <select
            [value]="selectedYear()"
            (change)="onYearChange($event)"
            class="px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500">
            @for (y of yearOptions(); track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>
          <button
            (click)="refresh()"
            [disabled]="loading()"
            class="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            [class.animate-spin-slow]="loading()">
            🔄
          </button>
        </div>
      </div>

      <!-- Content area -->
      <div class="flex-1 flex flex-col overflow-hidden" style="min-height: 0;">
        @if (error()) {
          <div class="mx-4 mt-2 p-3 bg-red-50 text-red-600 rounded-lg border border-red-200 text-sm">{{ error() }}</div>
        }

        <!-- Row 1 — Detail zone (always visible, fixed height) -->
        <div class="flex overflow-hidden" style="flex: 6; min-height: 0;">
          @if (selectedBag()) {
            <div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 overflow-auto">
              <!-- Left column: Bag detail table -->
              <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-auto">
                @if (detailLoading()) {
                  <p class="text-sm text-gray-400">Chargement du détail...</p>
                } @else if (bagDetail()) {
                  <div class="flex items-center justify-between mb-3">
                    <h3 class="text-base font-semibold text-gray-800">{{ bagDetail()!.bag_id }}</h3>
                    <div class="text-sm text-gray-600">
                      <span class="font-medium">{{ bagDetail()!.weight_grams }} g</span>
                      <span class="mx-1">|</span>
                      <span class="font-bold text-green-700">{{ bagDetail()!.total_amount | number:'1.2-2' }} €</span>
                    </div>
                  </div>
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-gray-500 border-b">
                        <th class="pb-1">Type</th>
                        <th class="pb-1 text-right">Nombre</th>
                        <th class="pb-1 text-right">Total €</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (item of bagDetail()!.items; track item.type) {
                        <tr class="border-b border-gray-50">
                          <td class="py-1">{{ item.type }}</td>
                          <td class="py-1 text-right">{{ item.count }}</td>
                          <td class="py-1 text-right">{{ item.amount | number:'1.2-2' }} €</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>

              <!-- Right column: Tronc_queteurs list -->
              <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4 overflow-auto">
                <h3 class="text-base font-semibold text-gray-800 mb-3">Tronc Quêteurs</h3>
                @if (troncsLoading()) {
                  <p class="text-sm text-gray-400">Chargement des troncs...</p>
                } @else if (troncs().length === 0) {
                  <p class="text-sm text-gray-400 italic">Aucun tronc</p>
                } @else {
                  <table class="w-full text-sm">
                    <thead>
                      <tr class="text-left text-gray-500 border-b">
                        <th class="pb-1">ID TQ</th>
                        <th class="pb-1">Nom</th>
                        <th class="pb-1">Prénom</th>
                        <th class="pb-1">Point de quête</th>
                        <th class="pb-1 text-right">ID Tronc</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (tq of troncs(); track tq.tronc_queteur_id) {
                        <tr
                          (click)="openTroncQueteur(tq.tronc_queteur_id)"
                          class="border-b border-gray-50 cursor-pointer hover:bg-blue-50 transition-colors">
                          <td class="py-1">{{ tq.tronc_queteur_id }}</td>
                          <td class="py-1">{{ tq.last_name }}</td>
                          <td class="py-1">{{ tq.first_name }}</td>
                          <td class="py-1">{{ tq.point_quete_name }}</td>
                          <td class="py-1 text-right">{{ tq.tronc_id }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                }
              </div>
            </div>
          } @else {
            <div class="flex-1 flex items-center justify-center">
              <p class="text-2xl text-gray-300 font-medium">Sélectionnez un sac</p>
            </div>
          }
        </div>

        <!-- Row 2 — Bag cards (scrollable grid) -->
        <div class="p-4 overflow-auto" style="flex: 4; min-height: 0;">
          @if (filteredBags().length === 0 && !loading()) {
            <p class="text-sm text-gray-400 italic">Aucun sac</p>
          }
          <div class="flex flex-wrap gap-3 content-start">
            @for (bag of filteredBags(); track bag.bag_id) {
              <div
                (click)="selectBag(bag)"
                class="w-[200px] bg-white rounded-xl shadow-sm border-2 cursor-pointer transition-all duration-200 hover:shadow-md p-3"
                [class.border-blue-500]="selectedBag()?.bag_id === bag.bag_id"
                [class.border-gray-100]="selectedBag()?.bag_id !== bag.bag_id">
                <p class="font-bold text-gray-800 truncate" style="max-width: 180px;">{{ bag.bag_id }}</p>
                <div class="flex items-center justify-between mt-1 text-sm text-gray-600">
                  <span>{{ bag.weight_grams }} g</span>
                  <span>{{ bag.total_amount | number:'1.2-2' }} €</span>
                  <span>{{ bag.tronc_count }} troncs</span>
                </div>
              </div>
            }
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; width: 100%; }
    .animate-spin-slow { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `],
})
export class MoneyBagsPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly selectedYear = signal(new Date().getFullYear());
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly selectedType = signal<'coins' | 'bills'>('coins');
  readonly loading = signal(false);
  readonly error = signal('');
  readonly bags = signal<MoneyBagSummary[]>([]);
  readonly filteredBags = signal<MoneyBagSummary[]>([]);
  readonly selectedBag = signal<MoneyBagSummary | null>(null);
  readonly bagDetail = signal<MoneyBagDetail | null>(null);
  readonly detailLoading = signal(false);
  readonly troncs = signal<TroncQueteurItem[]>([]);
  readonly troncsLoading = signal(false);

  private rcqBaseUrl = '';
  private rcqTroncQueteurUri = '';
  private overrideInitialized = false;

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.clearSelection();
    this.loadBags();
  });

  constructor() {
    this.loadRcqUrls();
    this.loadBags();
  }

  setType(type: 'coins' | 'bills'): void {
    if (this.selectedType() === type) return;
    this.selectedType.set(type);
    this.clearSelection();
    this.loadBags();
  }

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.clearSelection();
    this.loadBags();
  }

  refresh(): void {
    this.clearSelection();
    this.loadBags();
  }

  async selectBag(bag: MoneyBagSummary): Promise<void> {
    if (this.selectedBag()?.bag_id === bag.bag_id) {
      this.clearSelection();
      return;
    }
    this.selectedBag.set(bag);
    this.bagDetail.set(null);
    this.troncs.set([]);
    this.detailLoading.set(true);
    this.troncsLoading.set(true);

    const type = this.selectedType();
    const year = this.selectedYear();
    const encodedId = encodeURIComponent(bag.bag_id);

    try {
      const [detail, troncsResp] = await Promise.all([
        firstValueFrom(
          this.api.get<MoneyBagDetail>(
            `/api/money-bags/${encodedId}/detail?type=${type}&year=${year}`
          )
        ),
        firstValueFrom(
          this.api.get<{ troncs: TroncQueteurItem[] }>(
            `/api/money-bags/${encodedId}/troncs?type=${type}&year=${year}`
          )
        ),
      ]);
      this.bagDetail.set(detail);
      this.troncs.set(troncsResp.troncs);
    } catch (err) {
      console.error('Failed to load bag detail/troncs', err);
    } finally {
      this.detailLoading.set(false);
      this.troncsLoading.set(false);
    }
  }

  openTroncQueteur(troncQueteurId: number): void {
    if (this.rcqBaseUrl && this.rcqTroncQueteurUri) {
      window.open(`${this.rcqBaseUrl}/${this.rcqTroncQueteurUri}${troncQueteurId}`, '_blank');
    }
  }

  private clearSelection(): void {
    this.selectedBag.set(null);
    this.bagDetail.set(null);
    this.troncs.set([]);
  }

  private async loadRcqUrls(): Promise<void> {
    try {
      const urls = await firstValueFrom(
        this.api.get<RcqUrls>('/api/config/rcq-urls')
      );
      this.rcqBaseUrl = urls.base_url;
      this.rcqTroncQueteurUri = urls.tronc_queteur_uri;
    } catch (err) {
      console.error('Failed to load RCQ URLs', err);
    }
  }

  private async loadBags(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const response = await firstValueFrom(
        this.api.get<{ bags: MoneyBagSummary[] }>(
          `/api/money-bags?year=${this.selectedYear()}`
        )
      );
      this.bags.set(response.bags);
      this.filteredBags.set(
        response.bags.filter(b => b.bag_type === this.selectedType())
      );
    } catch (err) {
      this.error.set('Erreur lors du chargement des sacs');
      console.error('Failed to load money bags', err);
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
