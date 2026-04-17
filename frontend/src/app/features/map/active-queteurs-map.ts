import {
  Component,
  OnDestroy,
  inject,
  signal,
  computed,
  effect,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import {
  QueteursMapComponent,
  ActiveQueteur,
  formatDuration,
  getDurationColor,
  formatPhone,
} from '../../shared/components/queteurs-map';

interface PointQueteStats {
  id: number;
  name: string | null;
  code: string | null;
  latitude: number | null;
  longitude: number | null;
  type: number;
  address: string | null;
  total_amount: number;
  hourly_rate: number;
  tronc_count: number;
  total_hours: number;
  active_queteurs: number;
}

interface PointQueteStatsResponse {
  points_quete: PointQueteStats[];
}

@Component({
  selector: 'app-active-queteurs-map',
  standalone: true,
  imports: [QueteursMapComponent],
  template: `
    <div class="h-full w-full bg-white overflow-y-auto">
      <app-queteurs-map
        heightClass="h-[75vh]"
        [showRefreshButton]="true"
        [showHeader]="true"
        (queteursLoaded)="onQueteursLoaded($event)">
      </app-queteurs-map>

      <!-- Tables below the map -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4">

        <!-- Column 1: Quêteurs actifs -->
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
          <h3 class="px-4 py-3 text-base font-semibold text-gray-800 border-b border-gray-200">
            🚶 Quêteurs actifs ({{ activeQueteurs().length }})
          </h3>
          <div class="max-h-[50vh] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th (click)="onSortQueteurs('first_name')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Prénom {{ sortIndicatorQueteurs('first_name') }}</th>
                  <th (click)="onSortQueteurs('last_name')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Nom {{ sortIndicatorQueteurs('last_name') }}</th>
                  <th (click)="onSortQueteurs('mobile')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Téléphone {{ sortIndicatorQueteurs('mobile') }}</th>
                  <th (click)="onSortQueteurs('point_name')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Point de quête {{ sortIndicatorQueteurs('point_name') }}</th>
                  <th (click)="onSortQueteurs('depart')" class="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Durée {{ sortIndicatorQueteurs('depart') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (q of sortedQueteurs(); track q.point_quete_id + '_' + q.first_name + '_' + q.last_name) {
                  <tr class="hover:bg-gray-50">
                    <td class="px-3 py-2">{{ q.first_name }}</td>
                    <td class="px-3 py-2">{{ q.last_name }}</td>
                    <td class="px-3 py-2">
                      @if (q.mobile) {
                        <a [href]="'tel:' + formatPhoneRaw(q.mobile)" class="text-blue-600 hover:underline">{{ formatPhoneDisplay(q.mobile) }}</a>
                      } @else {
                        —
                      }
                    </td>
                    <td class="px-3 py-2">{{ q.point_name || '' }}</td>
                    <td class="px-3 py-2 text-right font-mono text-white rounded-r-lg"
                        [style.backgroundColor]="getDurationBgColor(q.depart)">{{ formatDurationDisplay(q.depart) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

        <!-- Column 2: Points de quête -->
        <div class="bg-white border border-gray-200 rounded-lg shadow-sm">
          <h3 class="px-4 py-3 text-base font-semibold text-gray-800 border-b border-gray-200">
            📍 Points de quête ({{ pointsQueteStats().length }})
          </h3>
          <div class="max-h-[50vh] overflow-y-auto">
            <table class="w-full text-sm">
              <thead class="bg-gray-50 sticky top-0">
                <tr>
                  <th (click)="onSortPoints('name')" class="px-3 py-2 text-left font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Nom {{ sortIndicatorPoints('name') }}</th>
                  <th (click)="onSortPoints('hourly_rate')" class="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Taux horaire {{ sortIndicatorPoints('hourly_rate') }}</th>
                  <th (click)="onSortPoints('total_amount')" class="px-3 py-2 text-right font-semibold text-gray-700 cursor-pointer select-none hover:bg-gray-100">Total collecté {{ sortIndicatorPoints('total_amount') }}</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-gray-100">
                @for (p of sortedPoints(); track p.id) {
                  <tr class="hover:bg-gray-50">
                    <td class="px-3 py-2">{{ p.name || '' }}</td>
                    <td class="px-3 py-2 text-right font-mono">{{ formatHourlyRate(p.hourly_rate) }}</td>
                    <td class="px-3 py-2 text-right font-mono">{{ formatCurrency(p.total_amount) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; width: 100%; }
  `],
})
export class ActiveQueteursMapComponent implements OnDestroy {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);
  private overrideInitialized = false;

  private readonly currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  private readonly numberFormatter = new Intl.NumberFormat('fr-FR');

  readonly activeQueteurs = signal<ActiveQueteur[]>([]);
  readonly pointsQueteStats = signal<PointQueteStats[]>([]);

  readonly queteursSortColumn = signal<string>('first_name');
  readonly queteursSortDirection = signal<'asc' | 'desc'>('asc');

  readonly pointsSortColumn = signal<string>('name');
  readonly pointsSortDirection = signal<'asc' | 'desc'>('asc');


  readonly sortedQueteurs = computed(() => {
    const list = [...this.activeQueteurs()];
    const col = this.queteursSortColumn();
    const dir = this.queteursSortDirection();
    list.sort((a, b) => {
      let va: any;
      let vb: any;
      if (col === 'depart') {
        va = new Date(a.depart).getTime();
        vb = new Date(b.depart).getTime();
      } else {
        va = (a as any)[col] ?? '';
        vb = (b as any)[col] ?? '';
      }
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  });

  readonly sortedPoints = computed(() => {
    const list = [...this.pointsQueteStats()];
    const col = this.pointsSortColumn();
    const dir = this.pointsSortDirection();
    list.sort((a, b) => {
      let va: any = (a as any)[col] ?? '';
      let vb: any = (b as any)[col] ?? '';
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va < vb) return dir === 'asc' ? -1 : 1;
      if (va > vb) return dir === 'asc' ? 1 : -1;
      return 0;
    });
    return list;
  });

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      this.loadPointsQueteStats();
      return;
    }
    this.loadPointsQueteStats();
  });

  ngOnDestroy(): void {}

  onQueteursLoaded(queteurs: ActiveQueteur[]): void {
    this.activeQueteurs.set(queteurs);
  }

  private async loadPointsQueteStats(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.get<PointQueteStatsResponse>('/api/map/points-quete-stats?all_years=true'),
      );
      this.pointsQueteStats.set(response.points_quete.filter(
        (p) => p.type !== 3 && p.type !== 5,
      ));
    } catch (err) {
      console.error('Failed to load points quête stats', err);
    }
  }

  onSortQueteurs(column: string): void {
    if (this.queteursSortColumn() === column) {
      this.queteursSortDirection.set(this.queteursSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.queteursSortColumn.set(column);
      this.queteursSortDirection.set('asc');
    }
  }

  sortIndicatorQueteurs(column: string): string {
    if (this.queteursSortColumn() !== column) return '';
    return this.queteursSortDirection() === 'asc' ? '▲' : '▼';
  }

  onSortPoints(column: string): void {
    if (this.pointsSortColumn() === column) {
      this.pointsSortDirection.set(this.pointsSortDirection() === 'asc' ? 'desc' : 'asc');
    } else {
      this.pointsSortColumn.set(column);
      this.pointsSortDirection.set('asc');
    }
  }

  sortIndicatorPoints(column: string): string {
    if (this.pointsSortColumn() !== column) return '';
    return this.pointsSortDirection() === 'asc' ? '▲' : '▼';
  }

  getDurationBgColor(departIso: string): string {
    return getDurationColor(departIso);
  }

  formatDurationDisplay(departIso: string): string {
    return formatDuration(departIso);
  }

  formatCurrency(amount: number): string {
    return this.currencyFormatter.format(amount);
  }

  formatHourlyRate(rate: number): string {
    return this.numberFormatter.format(rate) + ' €/h';
  }

  formatPhoneDisplay(mobile: string | null): string {
    return formatPhone(mobile);
  }

  formatPhoneRaw(mobile: string): string {
    let cleaned = mobile.replace(/[\s\-.]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('33')) return '+' + cleaned;
    if (cleaned.startsWith('0')) return '+33' + cleaned.substring(1);
    return cleaned;
  }
}
