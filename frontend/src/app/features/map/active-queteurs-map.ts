import {
  Component,
  OnInit,
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
  latitude: number | null;
  longitude: number | null;
  point_name: string | null;
  address: string | null;
  depart: string;
}

interface ActiveQueteursResponse {
  queteurs: ActiveQueteur[];
}

// Fix Leaflet default icon paths (broken by bundlers)
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

function formatDuration(departIso: string): string {
  const diff = Date.now() - new Date(departIso).getTime();
  if (diff < 0) return '0h 00min';
  const totalMinutes = Math.floor(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${String(minutes).padStart(2, '0')}min`;
}

@Component({
  selector: 'app-active-queteurs-map',
  standalone: true,
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <div class="px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <h2 class="text-lg font-semibold text-gray-800">🗺️ Carte des quêteurs actifs</h2>
      </div>
      @if (noQueteurs()) {
        <div class="flex-1 flex items-center justify-center">
          <p class="text-gray-500 text-lg">Aucun quêteur en cours de quête</p>
        </div>
      } @else {
        <div #mapContainer class="flex-1" style="min-height: 0;"></div>
      }
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; width: 100%; }
  `],
})
export class ActiveQueteursMapComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLElement>;

  private readonly api = inject(ApiService);
  private map: L.Map | null = null;
  private markersLayer = L.layerGroup();
  private pollingTimer: ReturnType<typeof setInterval> | null = null;

  readonly noQueteurs = signal(false);

  async ngAfterViewInit(): Promise<void> {
    await this.loadAndRender();
    // Poll every 5 minutes
    this.pollingTimer = setInterval(() => this.loadAndRender(), 5 * 60 * 1000);
  }

  ngOnDestroy(): void {
    if (this.pollingTimer) clearInterval(this.pollingTimer);
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  private async loadAndRender(): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.api.get<ActiveQueteursResponse>('/api/map/active-queteurs'),
      );
      const queteurs = response.queteurs.filter(
        (q) => q.latitude != null && q.longitude != null,
      );

      if (queteurs.length === 0) {
        this.noQueteurs.set(true);
        return;
      }

      this.noQueteurs.set(false);

      // Wait a tick so the container is visible (ngIf just toggled)
      await new Promise((r) => setTimeout(r, 0));

      if (!this.map) {
        this.initMap();
      }

      this.renderMarkers(queteurs);
    } catch (err) {
      console.error('Failed to load active quêteurs', err);
    }
  }

  private initMap(): void {
    if (!this.mapContainer?.nativeElement) return;
    this.map = L.map(this.mapContainer.nativeElement);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.markersLayer.addTo(this.map);
  }

  private renderMarkers(queteurs: ActiveQueteur[]): void {
    this.markersLayer.clearLayers();

    const bounds: L.LatLngExpression[] = [];

    for (const q of queteurs) {
      const latLng: L.LatLngExpression = [q.latitude!, q.longitude!];
      bounds.push(latLng);

      const label = `${q.first_name} ${q.last_name} - ${formatDuration(q.depart)}`;
      const marker = L.marker(latLng);
      marker.bindTooltip(label, { permanent: true, direction: 'top', offset: [0, -10] });
      this.markersLayer.addLayer(marker);
    }

    if (this.map && bounds.length > 0) {
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
    }
  }
}
