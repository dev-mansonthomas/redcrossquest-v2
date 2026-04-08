import {
  Component,
  OnDestroy,
  inject,
  signal,
  ElementRef,
  ViewChild,
  AfterViewInit,
} from '@angular/core';
import * as L from 'leaflet';
import { ApiService } from '../../core/services/api.service';
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
const MIN_RADIUS = 8;
const MAX_RADIUS = 40;

function getPointTypeLabel(type: number): string {
  const info = POINT_TYPE_INFO[type] || { emoji: '📍', label: 'Inconnu' };
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
      <div class="px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-800">📊 Carte analytique des points de quête</h2>
      </div>
      <div class="relative flex-1" style="min-height: 0;">
        <div #mapContainer class="h-full w-full"></div>
        <!-- View mode buttons -->
        <div class="view-buttons-container">
          @for (mode of viewModes; track mode) {
            <button
              [class.active]="currentView() === mode"
              (click)="setView(mode)"
              class="view-btn">
              {{ viewLabels[mode] }}
            </button>
          }
        </div>
        <!-- Year selector -->
        <div class="year-chips-container">
          @for (year of availableYears(); track year) {
            <button
              [class.active]="selectedYears().has(year)"
              (click)="toggleYear(year)"
              class="year-chip">
              {{ year }}
            </button>
          }
        </div>
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; width: 100%; }
    .view-buttons-container {
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      gap: 0;
      background: white;
      border-radius: 20px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.2);
      overflow: hidden;
    }
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
    .year-chips-container {
      position: absolute;
      top: 50px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 1000;
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
      justify-content: center;
    }
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
      box-shadow: 0 1px 3px rgba(0,0,0,0.1);
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
    :host ::ng-deep .refresh-control a {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 34px;
      height: 34px;
      font-size: 18px;
      text-decoration: none;
      cursor: pointer;
      transition: background 0.2s;
    }
    :host ::ng-deep .refresh-control a:hover { background: #f4f4f4; }
    :host ::ng-deep .refresh-control.refreshing a {
      opacity: 0.5;
      pointer-events: none;
    }
    :host ::ng-deep .refresh-control.refreshing a span {
      animation: refresh-spin 0.8s linear infinite;
    }
    @keyframes refresh-spin {
      from { transform: rotate(0deg); }
      to { transform: rotate(360deg); }
    }
  `],
})
export class PointsQueteStatsMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLElement>;

  private readonly api = inject(ApiService);
  private map: L.Map | null = null;
  private circlesLayer = L.layerGroup();
  private badgesLayer = L.layerGroup();
  private refreshControlEl: HTMLElement | null = null;

  readonly viewModes: ViewMode[] = ['total_amount', 'hourly_rate', 'tronc_count', 'total_hours'];
  readonly viewLabels = VIEW_LABELS;
  readonly currentView = signal<ViewMode>('total_amount');
  readonly availableYears = signal<number[]>([]);
  readonly selectedYears = signal<Set<number>>(new Set());

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

  private initMap(): void {
    if (!this.mapContainer?.nativeElement) return;
    this.map = L.map(this.mapContainer.nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.circlesLayer.addTo(this.map);
    this.badgesLayer.addTo(this.map);

    // Refresh button
    const self = this;
    const RefreshControl = L.Control.extend({
      options: { position: 'topright' as L.ControlPosition },
      onAdd() {
        const container = L.DomUtil.create('div', 'leaflet-bar leaflet-control refresh-control');
        container.innerHTML = '<a href="#" title="Rafraîchir"><span style="display:inline-block">🔄</span></a>';
        L.DomEvent.disableClickPropagation(container);
        container.querySelector('a')!.addEventListener('click', (e: Event) => {
          e.preventDefault();
          self.onRefreshClick();
        });
        self.refreshControlEl = container;
        return container;
      },
    });
    new RefreshControl().addTo(this.map);
  }

  private async onRefreshClick(): Promise<void> {
    if (this.refreshControlEl) this.refreshControlEl.classList.add('refreshing');
    try {
      await this.loadStats();
    } finally {
      if (this.refreshControlEl) this.refreshControlEl.classList.remove('refreshing');
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

  private renderCircles(): void {
    this.circlesLayer.clearLayers();
    this.badgesLayer.clearLayers();
    if (this.points.length === 0) return;

    const mode = this.currentView();
    const values = this.points.map(p => p[mode]);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    // Sort for ranking (descending = best first)
    const sorted = [...this.points].sort((a, b) => b[mode] - a[mode]);
    const rankMap = new Map<number, number>();
    sorted.forEach((p, i) => rankMap.set(p.id, i));

    for (const p of this.points) {
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
