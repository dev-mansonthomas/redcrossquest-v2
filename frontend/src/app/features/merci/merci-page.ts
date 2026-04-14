import {
  Component,
  OnDestroy,
  signal,
  ElementRef,
  ViewChild,
  AfterViewInit,
  inject,
} from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import * as L from 'leaflet';
import { environment } from '../../../environments/environment';
import { firstValueFrom } from 'rxjs';

interface PointQueteMerci {
  id: number;
  name: string | null;
  latitude: number | null;
  longitude: number | null;
  address: string | null;
  type: number;
  total_amount: number;
}

interface MerciStats {
  total_amount: number;
  total_hours: number;
  total_weight_grams: number;
  tronc_count: number;
}

interface MerciResponse {
  queteur_first_name: string;
  queteur_man: boolean;
  thanks_message: string | null;
  year: number;
  available_years: number[];
  stats: MerciStats;
  points_quete: PointQueteMerci[];
}

const POINT_TYPE_INFO: Record<number, { emoji: string; label: string }> = {
  1: { emoji: '🚦', label: 'Voie Publique' },
  2: { emoji: '🚶', label: 'Piéton' },
  3: { emoji: '🏪', label: 'Commerçant' },
  4: { emoji: '🏠', label: 'Base UL' },
  5: { emoji: '📌', label: 'Autre' },
};

const DEFAULT_CENTER: L.LatLngExpression = [48.8566, 2.3522];
const DEFAULT_ZOOM = 13;
const MIN_RADIUS = 10;
const MAX_RADIUS = 35;

function getPointTypeLabel(type: number): string {
  const info = POINT_TYPE_INFO[type] || { emoji: '📍', label: 'Inconnu' };
  return `${info.emoji} ${info.label}`;
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
  selector: 'app-merci-page',
  standalone: true,
  template: `
    @if (loading()) {
      <div class="min-h-screen flex items-center justify-center bg-red-50">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p class="mt-4 text-gray-600">Chargement de tes résultats...</p>
        </div>
      </div>
    } @else if (error()) {
      <div class="min-h-screen flex items-center justify-center bg-red-50">
        <div class="text-center max-w-md px-4">
          <div class="text-6xl mb-4">😕</div>
          <h2 class="text-xl font-bold text-gray-800 mb-2">Oups !</h2>
          <p class="text-gray-600">{{ error() }}</p>
        </div>
      </div>
    } @else {
      <div class="min-h-screen bg-gradient-to-b from-red-50 to-white">
        <header class="bg-red-700 text-white py-6 px-4 text-center shadow-lg">
          <h1 class="text-3xl font-bold">Merci {{ firstName() }} ! 🎉</h1>
          <p class="text-red-200 mt-1">Tes résultats de la Quête {{ year() }}</p>
        </header>

        <div class="flex justify-center py-4">
          <select (change)="onYearChange($event)"
            class="px-4 py-2 border border-gray-300 rounded-lg shadow-sm bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-red-500">
            @for (y of availableYears(); track y) {
              <option [value]="y" [selected]="y === year()">{{ y }}</option>
            }
          </select>
        </div>

        @if (noData()) {
          <div class="max-w-4xl mx-auto px-4 mb-6 text-center">
            <div class="bg-yellow-50 rounded-xl shadow p-8 border border-yellow-200">
              <div class="text-4xl mb-3">🤷</div>
              <p class="text-gray-600">Pas de données pour cette année. Essaie une autre !</p>
            </div>
          </div>
        } @else {
          <div class="max-w-4xl mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div class="bg-white rounded-xl shadow p-4 text-center">
              <div class="text-3xl">💰</div>
              <div class="text-2xl font-bold text-red-700">{{ formatAmount(stats().total_amount) }} €</div>
              <div class="text-sm text-gray-500">récoltés — bravo !</div>
            </div>
            <div class="bg-white rounded-xl shadow p-4 text-center">
              <div class="text-3xl">😎</div>
              <div class="text-2xl font-bold text-blue-600">{{ formatHours(stats().total_hours) }}</div>
              <div class="text-sm text-gray-500">à bronzer dehors</div>
            </div>
            <div class="bg-white rounded-xl shadow p-4 text-center">
              <div class="text-3xl">💪</div>
              <div class="text-2xl font-bold text-green-600">{{ formatWeight(stats().total_weight_grams) }}</div>
              <div class="text-sm text-gray-500">de musculation</div>
            </div>
            <div class="bg-white rounded-xl shadow p-4 text-center">
              <div class="text-3xl">📦</div>
              <div class="text-2xl font-bold text-purple-600">{{ stats().tronc_count }}</div>
              <div class="text-sm text-gray-500">troncs remplis</div>
            </div>
          </div>

          <div class="max-w-4xl mx-auto px-4 mb-6">
            <div class="bg-white rounded-xl shadow overflow-hidden">
              <h3 class="px-4 py-3 text-lg font-semibold border-b">📍 Tes points de quête</h3>
              <div #mapContainer style="height: 400px;"></div>
            </div>
          </div>

          <div class="max-w-4xl mx-auto px-4 mb-6 text-center">
            <div class="bg-gray-100 rounded-xl p-8 text-gray-400">
              📸 Photo des troncs à venir
            </div>
          </div>
        }

        @if (thanksMessage()) {
          <div class="max-w-4xl mx-auto px-4 mb-6">
            <div class="bg-red-50 rounded-xl shadow p-6 border border-red-100">
              <h3 class="text-lg font-semibold text-red-800 mb-3">Message de votre Unité Locale</h3>
              <div [innerHTML]="thanksMessageHtml()" class="prose prose-sm text-gray-700"></div>
            </div>
          </div>
        }

        <footer class="bg-gray-100 py-4 text-center text-sm text-gray-500 mt-8">
          Croix-Rouge française — RedCrossQuest
        </footer>
      </div>
    }
  `,
  styles: [`:host { display: block; }`],
})
export class MerciPageComponent implements AfterViewInit, OnDestroy {
  @ViewChild('mapContainer') mapContainer!: ElementRef<HTMLElement>;

  private readonly route = inject(ActivatedRoute);
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);
  private map: L.Map | null = null;
  private circlesLayer = L.layerGroup();

  readonly loading = signal(true);
  readonly error = signal('');
  readonly firstName = signal('');
  readonly year = signal(new Date().getFullYear());
  readonly availableYears = signal<number[]>([]);
  readonly stats = signal<MerciStats>({ total_amount: 0, total_hours: 0, total_weight_grams: 0, tronc_count: 0 });
  readonly pointsQuete = signal<PointQueteMerci[]>([]);
  readonly thanksMessage = signal('');
  readonly thanksMessageHtml = signal<SafeHtml>('');
  readonly noData = signal(false);

  private uuid = '';

  async ngAfterViewInit(): Promise<void> {
    this.uuid = this.route.snapshot.queryParamMap.get('uuid') || '';
    if (!this.uuid) {
      this.error.set('Lien invalide — UUID manquant. Vérifiez le lien reçu par email.');
      this.loading.set(false);
      return;
    }
    await this.loadData(this.year());
  }

  ngOnDestroy(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
  }

  async onYearChange(event: Event): Promise<void> {
    const select = event.target as HTMLSelectElement;
    const newYear = parseInt(select.value, 10);
    this.year.set(newYear);
    await this.loadData(newYear);
  }

  formatAmount(n: number): string {
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  formatHours(h: number): string {
    const hrs = Math.floor(h);
    const mins = Math.round((h - hrs) * 60);
    return mins > 0 ? `${hrs}h${mins.toString().padStart(2, '0')}` : `${hrs}h`;
  }

  formatWeight(g: number): string {
    return g >= 1000
      ? `${(g / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} kg`
      : `${Math.round(g)} g`;
  }

  private async loadData(year: number): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.noData.set(false);
    try {
      const response = await firstValueFrom(
        this.http.get<MerciResponse>(`${environment.apiUrl}/api/merci/${this.uuid}?year=${year}`),
      );
      this.firstName.set(response.queteur_first_name);
      this.year.set(response.year);
      this.availableYears.set(response.available_years);
      this.stats.set(response.stats);
      this.pointsQuete.set(response.points_quete);
      this.thanksMessage.set(response.thanks_message || '');
      this.thanksMessageHtml.set(this.sanitizer.bypassSecurityTrustHtml(response.thanks_message || ''));

      if (response.stats.tronc_count === 0) {
        this.noData.set(true);
      }
    } catch (err: any) {
      if (err?.status === 404) {
        this.error.set('Quêteur non trouvé — vérifiez le lien reçu par email.');
      } else if (err?.status === 400) {
        this.error.set('Lien invalide — UUID incorrect.');
      } else {
        this.error.set('Impossible de charger les données. Réessayez plus tard.');
      }
    } finally {
      this.loading.set(false);
      // Defer map init until DOM has rendered after loading signal change
      setTimeout(() => {
        this.initMap();
        this.renderCircles();
      }, 50);
    }
  }

  private initMap(): void {
    if (this.map) {
      this.map.remove();
      this.map = null;
    }
    if (!this.mapContainer?.nativeElement) return;
    this.map = L.map(this.mapContainer.nativeElement).setView(DEFAULT_CENTER, DEFAULT_ZOOM);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(this.map);
    this.circlesLayer.addTo(this.map);
    // Force recalcul de la taille du container
    setTimeout(() => this.map?.invalidateSize(), 100);
  }

  private renderCircles(): void {
    this.circlesLayer.clearLayers();
    const points = this.pointsQuete().filter(p => p.latitude != null && p.longitude != null);
    if (points.length === 0) return;

    const values = points.map(p => p.total_amount);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);

    for (const p of points) {
      const latLng: L.LatLngExpression = [p.latitude!, p.longitude!];
      const radius = getRadius(p.total_amount, minVal, maxVal);
      const typeLabel = getPointTypeLabel(p.type);
      const name = p.name || 'Sans nom';

      const circle = L.circleMarker(latLng, {
        radius,
        fillColor: '#dc2626',
        fillOpacity: 0.6,
        color: '#fff',
        weight: 2,
        opacity: 1.0,
      });

      const tooltip = `
        <div style="font-size:13px;line-height:1.6;">
          <strong>${name}</strong><br/>
          ${typeLabel}<br/>
          💰 ${formatNumber(p.total_amount)} €
        </div>
      `;
      circle.bindTooltip(tooltip, { direction: 'top', offset: [0, -radius] });
      this.circlesLayer.addLayer(circle);
    }

    // Fit bounds
    if (this.map) {
      const bounds = points.map(p => [p.latitude!, p.longitude!] as L.LatLngExpression);
      this.map.fitBounds(L.latLngBounds(bounds), { padding: [40, 40], maxZoom: 15 });
    }
  }
}
