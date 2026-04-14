import {
  Component,
  OnDestroy,
  inject,
  signal,
  computed,
  ElementRef,
  ViewChild,
  AfterViewInit,
  effect,
} from '@angular/core';
import * as L from 'leaflet';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';
import { firstValueFrom } from 'rxjs';

interface ActiveQueteur {
  first_name: string;
  last_name: string;
  man: boolean;
  latitude: number | null;
  longitude: number | null;
  point_name: string | null;
  address: string | null;
  depart: string;
  point_quete_id: number;
  point_code: string | null;
  mobile: string | null;
}

interface ActiveQueteursResponse {
  queteurs: ActiveQueteur[];
}

interface PointQuete {
  id: number;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  type: number;
  code: string | null;
}

interface PointsQueteResponse {
  points_quete: PointQuete[];
}

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

// Default center: Paris
const DEFAULT_CENTER: L.LatLngExpression = [48.8566, 2.3522];
const DEFAULT_ZOOM = 13;

function formatDuration(departIso: string): string {
  const diff = Date.now() - new Date(departIso).getTime();
  if (diff < 0) return '0h 00min';
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

function getPointQueteIcon(type: number): L.DivIcon {
  let emoji: string;
  let bg: string;
  switch (type) {
    case 1: emoji = '🚦'; bg = '#5b8def'; break;   // Voie Publique/Feux Rouge — bleu
    case 2: emoji = '🚶'; bg = '#4caf50'; break;   // Piéton — vert
    case 3: emoji = '🏪'; bg = '#ff9800'; break;   // Commerçant — orange
    case 4: emoji = '🏠'; bg = '#9c27b0'; break;   // Base UL — violet
    case 5: emoji = '📌'; bg = '#9e9e9e'; break;   // Autre — gris
    default: emoji = '📍'; bg = '#5b8def'; break;
  }
  return L.divIcon({
    className: 'point-quete-marker',
    html: `<div style="background: ${bg}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><span style="font-size: 14px;">${emoji}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

function formatPhone(mobile: string | null): string {
  if (!mobile) return '';
  // Remove all spaces, dashes, dots
  let cleaned = mobile.replace(/[\s\-.]/g, '');
  // If starts with +, keep it; if starts with 33 (no +), prefix with +
  if (cleaned.startsWith('+')) {
    // already has +
  } else if (cleaned.startsWith('33')) {
    cleaned = '+' + cleaned;
  } else if (cleaned.startsWith('0')) {
    cleaned = '+33' + cleaned.substring(1);
  } else {
    return mobile; // unrecognized format, return as-is
  }
  // Now cleaned should be like +33XXXXXXXXX
  // Format: +33 X XX XX XX XX
  const match = cleaned.match(/^\+33([0-9])([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})$/);
  if (match) {
    return `+33 ${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`;
  }
  return mobile; // fallback
}

function getDurationColor(departIso: string): string {
  const hours = (Date.now() - new Date(departIso).getTime()) / 3_600_000;
  if (hours < 2) return '#4caf50';
  if (hours < 4) return '#ff9800';
  return '#f44336';
}

function getQueteurLabelIcon(q: ActiveQueteur): L.DivIcon {
  const color = getDurationColor(q.depart);
  const icon = q.man ? '🚹' : '🚺';
  const pointLabel = q.point_code || q.point_name || '';
  const label = `${icon} ${q.first_name} ${q.last_name} – ${pointLabel} – ${formatDuration(q.depart)}`;
  const html = `<div style="
    display: inline-block;
    background: ${color};
    color: #fff;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    box-shadow: 0 2px 6px rgba(0,0,0,0.25);
    line-height: 1.4;
  ">${label}</div>`;
  return L.divIcon({
    className: 'queteur-label',
    html,
    iconSize: [0, 0],   // let content determine size
    iconAnchor: [0, 14], // left-aligned, vertically centered
  });
}

function getOffsetPosition(lat: number, lng: number, index: number, total: number): [number, number] {
  const OFFSET = 0.002; // ~200m at Paris latitude
  if (total === 1) {
    // Single quêteur: offset to upper-right
    return [lat + OFFSET * 0.7, lng + OFFSET * 0.7];
  }
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return [
    lat + OFFSET * Math.sin(angle),
    lng + OFFSET * Math.cos(angle),
  ];
}

@Component({
  selector: 'app-active-queteurs-map',
  standalone: true,
  template: `
    <div class="h-full w-full bg-white overflow-y-auto">
      <div [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">🗺️ Carte des quêteurs actifs</h2>
        <div class="flex items-center gap-3">
          <button
            (click)="onRefreshClick()"
            [disabled]="refreshing()"
            class="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            [class.animate-spin-slow]="refreshing()">
            🔄
          </button>
        </div>
      </div>
      <div #mapContainer class="h-[75vh]"></div>

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
    :host ::ng-deep .queteur-label {
      background: none !important;
      border: none !important;
      box-shadow: none !important;
      overflow: visible !important;
    }
    .animate-spin-slow { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `],
})
export class ActiveQueteursMapComponent implements AfterViewInit, OnDestroy {
  protected readonly headerBg = ENV_HEADER_BG;
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLElement>;

  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);
  private map: L.Map | null = null;
  private pointsQueteLayer = L.layerGroup();
  private queteursLayer = L.layerGroup();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private pointsQueteBounds: L.LatLngExpression[] = [];
  private overrideInitialized = false;

  private readonly currencyFormatter = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
  private readonly numberFormatter = new Intl.NumberFormat('fr-FR');

  readonly noQueteurs = signal(false);
  readonly refreshing = signal(false);
  readonly activeQueteurs = signal<ActiveQueteur[]>([]);
  readonly pointsQueteStats = signal<PointQueteStats[]>([]);

  // Sort state for quêteurs table
  readonly queteursSortColumn = signal<string>('first_name');
  readonly queteursSortDirection = signal<'asc' | 'desc'>('asc');

  // Sort state for points table
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
      return;
    }
    this.loadPointsQuete();
    this.loadQueteurs();
    this.loadPointsQueteStats();
  });

  async ngAfterViewInit(): Promise<void> {
    this.initMap();
    await this.loadPointsQuete();
    await this.loadQueteurs();
    await this.loadPointsQueteStats();
    this.pollingTimer = setInterval(() => this.loadQueteurs(), 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private initMap(): void {
    if (!this.mapContainer?.nativeElement) return;
    this.map = L.map(this.mapContainer.nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.pointsQueteLayer.addTo(this.map);
    this.queteursLayer.addTo(this.map);
  }

  async onRefreshClick(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.loadQueteurs();
    } finally {
      this.refreshing.set(false);
    }
  }

  private async loadPointsQuete(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.get<PointsQueteResponse>('/api/map/points-quete'),
      );
      const points = response.points_quete.filter(
        (p) => p.latitude != null && p.longitude != null && p.type !== 3 && p.type !== 5,
      );

      this.pointsQueteLayer.clearLayers();
      this.pointsQueteBounds = [];

      for (const p of points) {
        const latLng: L.LatLngExpression = [p.latitude!, p.longitude!];
        this.pointsQueteBounds.push(latLng);
        const marker = L.marker(latLng, { icon: getPointQueteIcon(p.type) });
        if (p.name) {
          marker.bindTooltip(p.name, { direction: 'top', offset: [0, -14] });
        }
        this.pointsQueteLayer.addLayer(marker);
      }

      // Center map on all points de quête bounds
      if (this.map && this.pointsQueteBounds.length > 0) {
        this.map.fitBounds(L.latLngBounds(this.pointsQueteBounds), { padding: [40, 40], maxZoom: 15 });
      } else if (this.map) {
        this.map.setView(DEFAULT_CENTER, DEFAULT_ZOOM);
      }
    } catch (err) {
      console.error('Failed to load points de quête', err);
    }
  }

  private async loadQueteurs(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.get<ActiveQueteursResponse>('/api/map/active-queteurs'),
      );
      const allQueteurs = response.queteurs;
      this.activeQueteurs.set(allQueteurs);

      const queteurs = allQueteurs.filter(
        (q) => q.latitude != null && q.longitude != null,
      );

      this.queteursLayer.clearLayers();
      this.noQueteurs.set(queteurs.length === 0);

      // Group quêteurs by point_quete_id
      const grouped = new Map<number, ActiveQueteur[]>();
      for (const q of queteurs) {
        const group = grouped.get(q.point_quete_id) || [];
        group.push(q);
        grouped.set(q.point_quete_id, group);
      }

      // For each group, spread quêteurs in a circle around the point de quête
      grouped.forEach((group) => {
        group.forEach((q, index) => {
          const pqLat = q.latitude!;
          const pqLng = q.longitude!;
          const [offsetLat, offsetLng] = getOffsetPosition(pqLat, pqLng, index, group.length);
          const color = getDurationColor(q.depart);

          // Solid leader line from point de quête to label position
          const line = L.polyline(
            [[pqLat, pqLng], [offsetLat, offsetLng]],
            { color, weight: 2, opacity: 0.8 },
          );
          this.queteursLayer.addLayer(line);

          // Label marker at offset position (the label IS the marker)
          const marker = L.marker([offsetLat, offsetLng], {
            icon: getQueteurLabelIcon(q),
            zIndexOffset: 1000,
          });
          this.queteursLayer.addLayer(marker);
        });
      });
    } catch (err) {
      console.error('Failed to load active quêteurs', err);
    }
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
