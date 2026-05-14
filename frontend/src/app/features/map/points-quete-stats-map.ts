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

interface PointQueteStats {
  id: number;
  name: string | null;
  code: string | null;
  latitude: number;
  longitude: number;
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

interface AvailableYearsResponse {
  years: number[];
}

type ViewMode = 'total_amount' | 'hourly_rate' | 'tronc_count' | 'total_hours';

const VIEW_LABELS: Record<ViewMode, string> = {
  total_amount: '💰 Total €',
  hourly_rate: '⏱️ €/h',
  tronc_count: '🔢 Troncs',
  total_hours: '🕐 Heures',
};

const POINT_TYPE_INFO: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '🚦', label: 'Voie Publique' },
  2: { emoji: '🚶', label: 'Piéton' },
  3: { emoji: '🏪', label: 'Commerçant' },
  4: { emoji: '🏠', label: 'Base UL' },
  5: { emoji: '📌', label: 'Autre' },
};

const DEFAULT_CENTER: L.LatLngExpression = [48.8566, 2.3522];
const DEFAULT_ZOOM = 13;
const MIN_RADIUS = 14;
const MAX_RADIUS = 40;

function getPointTypeInfo(type: number): { emoji: string; label: string } {
  return POINT_TYPE_INFO[type] || { emoji: '📍', label: `Type ${type}` };
}

function getPointTypeLabel(type: number): string {
  const info = getPointTypeInfo(type);
  return `${info.emoji} ${info.label}`;
}

function getColorForRank(rank: number, total: number): string {
  if (total <= 1) return 'hsl(120, 70%, 45%)';
  const ratio = rank / (total - 1); // 0 = best (green), 1 = worst (red)
  const hue = 120 - ratio * 120; // 120° green → 0° red
  return `hsl(${hue}, 70%, 45%)`;
}

function getRadius(value: number, minVal: number, maxVal: number): number {
  if (maxVal <= minVal) return MIN_RADIUS;
  const ratio = (value - minVal) / (maxVal - minVal);
  return MIN_RADIUS + ratio * (MAX_RADIUS - MIN_RADIUS);
}

function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR', { maximumFractionDigits: 2 });
}

@Component({
  selector: 'app-points-quete-stats-map',
  standalone: true,
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <div [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">📊 Carte analytique des points de quête</h2>
        <div class="flex items-center gap-3">
          <!-- View mode buttons -->
          <span class="text-xs text-gray-600 font-medium">Vue :</span>
          <div class="flex rounded-lg overflow-hidden border border-gray-300 shadow-sm">
            @for (mode of viewModes; track mode) {
              <button
                [class.active]="currentView() === mode"
                (click)="setView(mode)"
                class="view-btn">
                {{ viewLabels[mode] }}
              </button>
            }
          </div>
          <div class="hidden md:block h-6 w-px bg-gray-300 mx-1"></div>
          <!-- Year selector -->
          <span class="text-xs text-gray-600 font-medium">Années :</span>
          <div class="flex gap-1">
            @for (year of availableYears(); track year) {
              <button
                [class.active]="selectedYears().has(year)"
                (click)="toggleYear(year)"
                class="year-chip">
                {{ year }}
              </button>
            }
          </div>
          <div class="hidden md:block h-6 w-px bg-gray-300 mx-1"></div>
          <!-- Type selector -->
          <span class="text-xs text-gray-600 font-medium">Types :</span>
          <div class="flex gap-1 flex-wrap">
            <button
              [class.active]="allTypesSelected()"
              (click)="toggleAllTypes()"
              class="year-chip"
              title="Afficher tous les types">
              📍 Tous
            </button>
            @for (type of availableTypes(); track type) {
              <button
                [class.active]="selectedTypes().has(type)"
                (click)="toggleType(type)"
                class="year-chip"
                [title]="getTypeLabel(type)">
                {{ getTypeEmoji(type) }} {{ getTypeShortLabel(type) }}
              </button>
            }
          </div>
          <div class="hidden md:block h-6 w-px bg-gray-300 mx-1"></div>
          <button
            (click)="onRefreshClick()"
            [disabled]="refreshing()"
            class="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
            [class.animate-spin-slow]="refreshing()">
            🔄
          </button>
        </div>
      </div>
      <div #mapContainer class="flex-1" style="min-height: 0;"></div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; width: 100%; }
    .view-btn {
      padding: 6px 14px;
      font-size: 13px;
      font-weight: 500;
      border: none;
      background: white;
      color: #333;
      cursor: pointer;
      transition: all 0.2s;
      white-space: nowrap;
    }
    .view-btn:hover { background: #f0f0f0; }
    .view-btn.active { background: #3b82f6; color: white; }
    .year-chip {
      padding: 4px 10px;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid #d1d5db;
      border-radius: 12px;
      background: white;
      color: #555;
      cursor: pointer;
      transition: all 0.2s;
    }
    .year-chip:hover { border-color: #3b82f6; }
    .year-chip.active { background: #3b82f6; color: white; border-color: #3b82f6; }
    :host ::ng-deep .pq-badge {
      background: none !important;
      border: none !important;
      box-shadow: none !important;
      overflow: visible !important;
    }
    :host ::ng-deep .pq-stats-tooltip {
      max-width: 300px;
    }
    .animate-spin-slow { animation: spin 1s linear infinite; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
  `],
})
export class PointsQueteStatsMapComponent implements AfterViewInit, OnDestroy {
  protected readonly headerBg = ENV_HEADER_BG;
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLElement>;

  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);
  private map: L.Map | null = null;
  private circlesLayer = L.layerGroup();
  private badgesLayer = L.layerGroup();
  private overrideInitialized = false;

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.loadStats();
  });

  readonly viewModes: ViewMode[] = ['total_amount', 'hourly_rate', 'tronc_count', 'total_hours'];
  readonly viewLabels = VIEW_LABELS;
  readonly currentView = signal<ViewMode>('total_amount');
  readonly availableYears = signal<number[]>([]);
  readonly selectedYears = signal<Set<number>>(new Set());
  readonly availableTypes = signal<number[]>([]);
  readonly selectedTypes = signal<Set<number>>(new Set());
  readonly allTypesSelected = computed(() => {
    const all = this.availableTypes();
    const sel = this.selectedTypes();
    return all.length > 0 && all.every(t => sel.has(t));
  });
  readonly refreshing = signal(false);

  private points: PointQueteStats[] = [];

  async ngAfterViewInit(): Promise<void> {
    this.initMap();
    await this.loadAvailableYears();
    await this.loadStats();
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  setView(mode: ViewMode): void {
    this.currentView.set(mode);
    this.renderCircles();
  }

  toggleYear(year: number): void {
    const current = new Set(this.selectedYears());
    if (current.has(year)) {
      current.delete(year);
    } else {
      current.add(year);
    }
    this.selectedYears.set(current);
    this.loadStats();
  }

  toggleType(type: number): void {
    const current = new Set(this.selectedTypes());
    if (current.has(type)) {
      current.delete(type);
    } else {
      current.add(type);
    }
    this.selectedTypes.set(current);
    this.renderCircles();
  }

  toggleAllTypes(): void {
    if (this.allTypesSelected()) {
      this.selectedTypes.set(new Set());
    } else {
      this.selectedTypes.set(new Set(this.availableTypes()));
    }
    this.renderCircles();
  }

  getTypeEmoji(type: number): string {
    return getPointTypeInfo(type).emoji;
  }

  getTypeLabel(type: number): string {
    return getPointTypeInfo(type).label;
  }

  getTypeShortLabel(type: number): string {
    return getPointTypeInfo(type).label;
  }

  private initMap(): void {
    if (!this.mapContainer?.nativeElement) return;
    this.map = L.map(this.mapContainer.nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.circlesLayer.addTo(this.map);
    this.badgesLayer.addTo(this.map);
  }

  async onRefreshClick(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.loadStats();
    } finally {
      this.refreshing.set(false);
    }
  }

  private async loadAvailableYears(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.get<AvailableYearsResponse>('/api/map/available-years'),
      );
      const years = response.years.sort((a, b) => b - a); // descending
      this.availableYears.set(years);
      // Select the 5 most recent years by default
      this.selectedYears.set(new Set(years.slice(0, 5)));
    } catch (err) {
      console.error('Failed to load available years', err);
    }
  }

  private async loadStats(): Promise<void> {
    try {
      const years = Array.from(this.selectedYears()).join(',');
      if (!years) {
        this.points = [];
        this.renderCircles();
        return;
      }
      const response = await firstValueFrom(
        this.api.get<PointQueteStatsResponse>(`/api/map/points-quete-stats?years=${years}`),
      );
      this.points = response.points_quete.filter(p => p.latitude != null && p.longitude != null);
      this.refreshAvailableTypes();
      this.renderCircles();

      // Fit bounds
      if (this.map && this.points.length > 0) {
        const bounds = this.points.map(p => [p.latitude, p.longitude] as L.LatLngExpression);
        this.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
      }
    } catch (err) {
      console.error('Failed to load points quête stats', err);
    }
  }

  private refreshAvailableTypes(): void {
    const types = Array.from(new Set(this.points.map(p => p.type))).sort((a, b) => a - b);
    const previous = this.availableTypes();
    this.availableTypes.set(types);
    // First load (or new types appeared): select everything by default.
    const current = this.selectedTypes();
    if (current.size === 0 && previous.length === 0) {
      this.selectedTypes.set(new Set(types));
    } else {
      // Drop any selected type that is no longer present in the data.
      const filtered = new Set<number>();
      for (const t of current) {
        if (types.includes(t)) filtered.add(t);
      }
      // Add any newly appeared type so existing UX (was "all" before) stays consistent.
      for (const t of types) {
        if (!previous.includes(t)) filtered.add(t);
      }
      this.selectedTypes.set(filtered);
    }
  }

  private renderCircles(): void {
    this.circlesLayer.clearLayers();
    this.badgesLayer.clearLayers();
    if (this.points.length === 0) return;

    const selected = this.selectedTypes();
    const visible = this.points.filter(p => selected.has(p.type));
    if (visible.length === 0) return;

    const mode = this.currentView();
    const values = visible.map(p => p[mode]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    // Sort for ranking (descending = best first)
    const sorted = [...visible].sort((a, b) => b[mode] - a[mode]);
    const rankMap = new Map<number, number>();
    sorted.forEach((p, i) => rankMap.set(p.id, i));

    for (const p of visible) {
      const latLng: L.LatLngExpression = [p.latitude, p.longitude];
      const value = p[mode];
      const rank = rankMap.get(p.id)!;
      const radius = getRadius(value, minVal, maxVal);
      const color = getColorForRank(rank, this.points.length);

      const circle = L.circleMarker(latLng, {
        radius,
        fillColor: color,
        fillOpacity: 0.7,
        color: '#fff',
        weight: 2,
        opacity: 1.0,
      });

      // Rich tooltip
      const name = p.name || 'Sans nom';
      const codeStr = p.code ? ` (${p.code})` : '';
      const typeLabel = getPointTypeLabel(p.type);
      const tooltip = `
        <div style="font-size:13px;line-height:1.6;">
          <strong>${name}${codeStr}</strong><br/>
          ${typeLabel}<br/>
          💰 Total : ${formatNumber(p.total_amount)} €<br/>
          ⏱️ Taux horaire : ${formatNumber(p.hourly_rate)} €/h<br/>
          🔢 Troncs : ${p.tronc_count}<br/>
          🕐 Heures : ${formatNumber(p.total_hours)}h<br/>
          👥 Quêteurs actifs : ${p.active_queteurs}
        </div>
      `;
      circle.bindTooltip(tooltip, { direction: 'top', offset: [0, -radius], className: 'pq-stats-tooltip' });
      this.circlesLayer.addLayer(circle);

      // Type emoji overlay (always shown, centered on the circle)
      const emoji = getPointTypeInfo(p.type).emoji;
      const fontSize = Math.round(radius * 0.9);
      const emojiIcon = L.divIcon({
        className: 'pq-badge',
        html: `<div style="
          font-size: ${fontSize}px;
          line-height: 1;
          text-align: center;
          pointer-events: none;
          text-shadow: 0 0 2px rgba(255,255,255,0.8);
        ">${emoji}</div>`,
        iconSize: [fontSize, fontSize],
        iconAnchor: [fontSize / 2, fontSize / 2],
      });
      const emojiMarker = L.marker(latLng, { icon: emojiIcon, interactive: false });
      this.badgesLayer.addLayer(emojiMarker);

      // Badge for active quêteurs
      if (p.active_queteurs > 0) {
        const badgeIcon = L.divIcon({
          className: 'pq-badge',
          html: `<div style="
            background: #ef4444;
            color: white;
            font-size: 10px;
            font-weight: 700;
            min-width: 18px;
            height: 18px;
            border-radius: 9px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 4px;
            border: 1.5px solid white;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
          ">${p.active_queteurs}</div>`,
          iconSize: [18, 18],
          iconAnchor: [-radius * 0.4, radius * 0.4 + 9],
        });
        const badge = L.marker(latLng, { icon: badgeIcon, interactive: false });
        this.badgesLayer.addLayer(badge);
      }
    }
  }
}
