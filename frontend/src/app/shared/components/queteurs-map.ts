import {
  Component,
  OnDestroy,
  inject,
  signal,
  ElementRef,
  ViewChild,
  AfterViewInit,
  Input,
  Output,
  EventEmitter,
  effect,
} from '@angular/core';
import * as L from 'leaflet';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { ENV_HEADER_BG } from '../../core/utils/env-header';

export interface ActiveQueteur {
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

// Default center: Paris
const DEFAULT_CENTER: L.LatLngExpression = [48.8566, 2.3522];
const DEFAULT_ZOOM = 13;

export function formatDuration(departIso: string): string {
  const diff = Date.now() - new Date(departIso).getTime();
  if (diff < 0) return '0h 00min';
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

export function getDurationColor(departIso: string): string {
  const hours = (Date.now() - new Date(departIso).getTime()) / 3_600_000;
  if (hours < 2) return '#4caf50';
  if (hours < 4) return '#ff9800';
  return '#f44336';
}

export function formatPhone(mobile: string | null): string {
  if (!mobile) return '';
  let cleaned = mobile.replace(/[\s\-.]/g, '');
  if (cleaned.startsWith('+')) {
    // already has +
  } else if (cleaned.startsWith('33')) {
    cleaned = '+' + cleaned;
  } else if (cleaned.startsWith('0')) {
    cleaned = '+33' + cleaned.substring(1);
  } else {
    return mobile;
  }
  const match = cleaned.match(/^\+33([0-9])([0-9]{2})([0-9]{2})([0-9]{2})([0-9]{2})$/);
  if (match) {
    return `+33 ${match[1]} ${match[2]} ${match[3]} ${match[4]} ${match[5]}`;
  }
  return mobile;
}

function getPointQueteIcon(type: number): L.DivIcon {
  let emoji: string;
  let bg: string;
  switch (type) {
    case 1: emoji = '🚦'; bg = '#5b8def'; break;
    case 2: emoji = '🚶'; bg = '#4caf50'; break;
    case 3: emoji = '🏪'; bg = '#ff9800'; break;
    case 4: emoji = '🏠'; bg = '#9c27b0'; break;
    case 5: emoji = '📌'; bg = '#9e9e9e'; break;
    default: emoji = '📍'; bg = '#5b8def'; break;
  }
  return L.divIcon({
    className: 'point-quete-marker',
    html: `<div style="background: ${bg}; width: 28px; height: 28px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><span style="font-size: 14px;">${emoji}</span></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
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
    iconSize: [0, 0],
    iconAnchor: [0, 14],
  });
}

function getOffsetPosition(lat: number, lng: number, index: number, total: number): [number, number] {
  const OFFSET = 0.002;
  if (total === 1) {
    return [lat + OFFSET * 0.7, lng + OFFSET * 0.7];
  }
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  return [
    lat + OFFSET * Math.sin(angle),
    lng + OFFSET * Math.cos(angle),
  ];
}

@Component({
  selector: 'app-queteurs-map',
  standalone: true,
  template: `
    <div class="w-full">
      @if (showHeader) {
        <div [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 ' + headerBg">
          <h2 class="text-lg font-semibold text-gray-800">🗺️ Carte des quêteurs actifs</h2>
          @if (showRefreshButton) {
            <button
              (click)="onRefreshClick()"
              [disabled]="refreshing()"
              class="px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm hover:bg-gray-50 shadow-sm transition-colors disabled:opacity-50"
              [class.animate-spin-slow]="refreshing()">
              🔄
            </button>
          }
        </div>
      }
      <div #mapContainer [class]="heightClass + ' rounded-lg'"></div>
    </div>
  `,
  styles: [`
    :host { display: block; width: 100%; }
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
export class QueteursMapComponent implements AfterViewInit, OnDestroy {
  @Input() heightClass = 'h-[75vh]';
  @Input() showRefreshButton = true;
  @Input() showHeader = true;
  @Output() queteursLoaded = new EventEmitter<ActiveQueteur[]>();

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

  readonly refreshing = signal(false);

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.loadPointsQuete();
    this.loadQueteurs();
  });

  async ngAfterViewInit(): Promise<void> {
    this.initMap();
    setTimeout(() => this.map?.invalidateSize(), 100);
    await this.loadPointsQuete();
    await this.loadQueteurs();
    this.pollingTimer = setInterval(() => this.loadQueteurs(), 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  async onRefreshClick(): Promise<void> {
    this.refreshing.set(true);
    try {
      await this.loadQueteurs();
    } finally {
      this.refreshing.set(false);
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
      this.queteursLoaded.emit(allQueteurs);

      const queteurs = allQueteurs.filter(
        (q) => q.latitude != null && q.longitude != null,
      );

      this.queteursLayer.clearLayers();

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

          const line = L.polyline(
            [[pqLat, pqLng], [offsetLat, offsetLng]],
            { color, weight: 2, opacity: 0.8 },
          );
          this.queteursLayer.addLayer(line);

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
}
