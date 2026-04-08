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
}

interface PointsQueteResponse {
  points_quete: PointQuete[];
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

const pointQueteIcon = L.divIcon({
  className: 'point-quete-marker',
  html: '<div style="background: #5b8def; width: 24px; height: 24px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;"><span style="color: white; font-size: 12px; font-weight: bold;">📍</span></div>',
  iconSize: [24, 24],
  iconAnchor: [12, 12],
});

function getDurationColor(departIso: string): string {
  const hours = (Date.now() - new Date(departIso).getTime()) / 3_600_000;
  if (hours < 2) return '#4caf50';
  if (hours < 4) return '#ff9800';
  return '#f44336';
}

function getQueteurLabelIcon(q: ActiveQueteur): L.DivIcon {
  const color = getDurationColor(q.depart);
  const icon = q.man ? '🚹' : '🚺';
  const label = `${icon} ${q.first_name} ${q.last_name} – ${formatDuration(q.depart)}`;
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
    <div class="h-full w-full flex flex-col bg-white">
      <div class="px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-800">🗺️ Carte des quêteurs actifs</h2>
      </div>
      <div #mapContainer class="flex-1" style="min-height: 0;"></div>
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
  `],
})
export class ActiveQueteursMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLElement>;

  private readonly api = inject(ApiService);
  private map: L.Map | null = null;
  private pointsQueteLayer = L.layerGroup();
  private queteursLayer = L.layerGroup();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private pointsQueteBounds: L.LatLngExpression[] = [];

  readonly noQueteurs = signal(false);

  async ngAfterViewInit(): Promise<void> {
    this.initMap();
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
        (p) => p.latitude != null && p.longitude != null,
      );

      this.pointsQueteLayer.clearLayers();
      this.pointsQueteBounds = [];

      for (const p of points) {
        const latLng: L.LatLngExpression = [p.latitude!, p.longitude!];
        this.pointsQueteBounds.push(latLng);
        const marker = L.marker(latLng, { icon: pointQueteIcon });
        if (p.name) {
          marker.bindTooltip(p.name, { permanent: true, direction: 'top', offset: [0, -14] });
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
      const queteurs = response.queteurs.filter(
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
}
