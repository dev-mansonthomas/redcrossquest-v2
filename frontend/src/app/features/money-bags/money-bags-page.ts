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

@Component({
  selector: 'app-money-bags-page',
  standalone: true,
  imports: [DecimalPipe],
  template: `
    <div class="h-full overflow-auto p-6">
      <!-- Header -->
      <div class="flex items-center justify-between mb-6">
        <h1 class="text-2xl font-bold text-gray-800">💰 Sacs de Banque</h1>
        <div class="flex items-center gap-3">
          <select
            [value]="selectedYear()"
            (change)="onYearChange($event)"
            class="px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white shadow-sm focus:ring-2 focus:ring-red-500 focus:border-red-500">
            @for (y of yearOptions(); track y) {
              <option [value]="y">{{ y }}</option>
            }
          </select>
          <button
            (click)="refresh()"
            [disabled]="loading()"
            class="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            [class.animate-spin-slow]="loading()">
            🔄
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="mb-4 p-4 bg-red-50 text-red-600 rounded-lg border border-red-200">{{ error() }}</div>
      }

      <!-- 2-column layout -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Coins column -->
        <div>
          <h2 class="text-lg font-semibold text-gray-700 mb-3">🪙 Pièces</h2>
          @if (coinBags().length === 0 && !loading()) {
            <p class="text-sm text-gray-400 italic">Aucun sac de pièces</p>
          }
          @for (bag of coinBags(); track bag.bag_id) {
            <div
              (click)="toggleBag(bag)"
              class="mb-3 bg-white rounded-xl shadow-sm border-2 cursor-pointer transition-all duration-200 hover:shadow-md"
              [class.border-blue-500]="expandedBag() === bag.bag_id + '-coins'"
              [class.border-gray-100]="expandedBag() !== bag.bag_id + '-coins'">
              <div class="p-4">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-gray-800">{{ bag.bag_id }}</span>
                  <span class="text-sm font-medium text-gray-600">{{ bag.total_amount | number:'1.2-2' }} €</span>
                </div>
                <div class="flex items-center justify-between mt-1 text-sm">
                  <span [class.text-red-600]="bag.weight_grams > 30000" [class.font-bold]="bag.weight_grams > 30000">
                    @if (bag.weight_grams > 30000) { ⚠️ }
                    {{ (bag.weight_grams / 1000) | number:'1.1-1' }} kg
                  </span>
                  <span class="text-gray-500">{{ bag.tronc_count }} troncs</span>
                </div>
              </div>
              @if (expandedBag() === bag.bag_id + '-coins') {
                <div class="border-t border-gray-100 p-4">
                  @if (detailLoading()) {
                    <p class="text-sm text-gray-400">Chargement...</p>
                  } @else if (bagDetail()) {
                    <p class="text-sm font-medium text-gray-600 mb-2">
                      Poids total : {{ bagDetail()!.weight_grams | number:'1.0-0' }} g
                      ({{ (bagDetail()!.weight_grams / 1000) | number:'1.2-2' }} kg)
                    </p>
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
              }
            </div>
          }
        </div>

        <!-- Bills column -->
        <div>
          <h2 class="text-lg font-semibold text-gray-700 mb-3">💵 Billets</h2>
          @if (billBags().length === 0 && !loading()) {
            <p class="text-sm text-gray-400 italic">Aucun sac de billets</p>
          }
          @for (bag of billBags(); track bag.bag_id) {
            <div
              (click)="toggleBag(bag)"
              class="mb-3 bg-white rounded-xl shadow-sm border-2 cursor-pointer transition-all duration-200 hover:shadow-md"
              [class.border-blue-500]="expandedBag() === bag.bag_id + '-bills'"
              [class.border-gray-100]="expandedBag() !== bag.bag_id + '-bills'">
              <div class="p-4">
                <div class="flex items-center justify-between">
                  <span class="font-bold text-gray-800">{{ bag.bag_id }}</span>
                  <span class="text-sm font-medium text-gray-600">{{ bag.total_amount | number:'1.2-2' }} €</span>
                </div>
                <div class="flex items-center justify-between mt-1 text-sm">
                  <span [class.text-red-600]="bag.weight_grams > 30000" [class.font-bold]="bag.weight_grams > 30000">
                    @if (bag.weight_grams > 30000) { ⚠️ }
                    {{ (bag.weight_grams / 1000) | number:'1.1-1' }} kg
                  </span>
                  <span class="text-gray-500">{{ bag.tronc_count }} troncs</span>
                </div>
              </div>
              @if (expandedBag() === bag.bag_id + '-bills') {
                <div class="border-t border-gray-100 p-4">
                  @if (detailLoading()) {
                    <p class="text-sm text-gray-400">Chargement...</p>
                  } @else if (bagDetail()) {
                    <p class="text-sm font-medium text-gray-600 mb-2">
                      Poids total : {{ bagDetail()!.weight_grams | number:'1.0-0' }} g
                      ({{ (bagDetail()!.weight_grams / 1000) | number:'1.2-2' }} kg)
                    </p>
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
              }
            </div>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; }
    .animate-spin-slow { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `],
})
export class MoneyBagsPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly selectedYear = signal(new Date().getFullYear());
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly bags = signal<MoneyBagSummary[]>([]);
  readonly expandedBag = signal<string | null>(null);
  readonly bagDetail = signal<MoneyBagDetail | null>(null);
  readonly detailLoading = signal(false);

  readonly coinBags = signal<MoneyBagSummary[]>([]);
  readonly billBags = signal<MoneyBagSummary[]>([]);

  private overrideInitialized = false;

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.loadBags();
  });

  constructor() {
    this.loadBags();
  }

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.expandedBag.set(null);
    this.bagDetail.set(null);
    this.loadBags();
  }

  refresh(): void {
    this.expandedBag.set(null);
    this.bagDetail.set(null);
    this.loadBags();
  }

  async toggleBag(bag: MoneyBagSummary): Promise<void> {
    const key = `${bag.bag_id}-${bag.bag_type}`;
    if (this.expandedBag() === key) {
      this.expandedBag.set(null);
      this.bagDetail.set(null);
      return;
    }
    this.expandedBag.set(key);
    this.bagDetail.set(null);
    this.detailLoading.set(true);
    try {
      const detail = await firstValueFrom(
        this.api.get<MoneyBagDetail>(
          `/api/money-bags/${encodeURIComponent(bag.bag_id)}/detail?type=${bag.bag_type}&year=${this.selectedYear()}`
        )
      );
      this.bagDetail.set(detail);
    } catch (err) {
      console.error('Failed to load bag detail', err);
    } finally {
      this.detailLoading.set(false);
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
      this.coinBags.set(response.bags.filter(b => b.bag_type === 'coins'));
      this.billBags.set(response.bags.filter(b => b.bag_type === 'bills'));
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
