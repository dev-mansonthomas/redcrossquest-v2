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
  ul_name: string | null;
  president_title: string | null;
  president_first_name: string | null;
  president_last_name: string | null;
  year: number;
  available_years: number[];
  stats: MerciStats;
  points_quete: PointQueteMerci[];
}

const DEFAULT_CENTER: L.LatLngExpression = [48.8566, 2.3522];
const DEFAULT_ZOOM = 13;
const MIN_RADIUS = 10;
const MAX_RADIUS = 35;

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
      <div class="min-h-screen flex items-center justify-center bg-red-50/30">
        <div class="text-center">
          <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
          <p class="mt-4 text-gray-600">Chargement de tes résultats...</p>
        </div>
      </div>
    } @else if (error()) {
      <div class="min-h-screen flex items-center justify-center bg-red-50/30">
        <div class="text-center max-w-md px-4">
          <div class="text-6xl mb-4">😕</div>
          <h2 class="text-xl font-bold text-gray-800 mb-2">Oups !</h2>
          <p class="text-gray-600">{{ error() }}</p>
        </div>
      </div>
    } @else {
      <div class="min-h-screen bg-gradient-to-b from-red-50/30 to-white">
        <header class="bg-white py-6 px-4 text-center shadow-sm border-b-4 border-[#E30613]">
          <div class="flex items-center justify-center gap-4 mb-2">
            <!-- SVG avec couleurs OFFICIELLES : croix=#E30613, texte=#000 -->
            <svg class="h-12 w-auto" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 321.832 95.929" aria-label="Croix-Rouge française" role="img"><path fill="#E30613" d="M57.553 38.371V19.186H38.367v19.185H19.183v19.186h19.184v19.185h19.186V57.557h19.186V38.371z"></path><path fill="#000" d="M166.943 42.238h3.817c.131 0 .25-.053.318-.144l5.824-7.484 5.794 7.483a.393.393 0 0 0 .318.145h3.817c.238 0 .438-.115.523-.301.082-.18.04-.392-.112-.568l-7.708-9.568.043-.055 7.514-9.332c.157-.182.198-.388.115-.57-.085-.187-.287-.302-.525-.302h-3.816a.392.392 0 0 0-.317.144l-5.646 7.275-5.674-7.274a.394.394 0 0 0-.32-.145h-3.816c-.237 0-.438.115-.523.302-.083.182-.043.388.112.567l7.56 9.39-.043.054-7.666 9.514c-.154.179-.195.386-.112.568.085.186.285.301.523.301zm-53.13-4.679a.432.432 0 0 0-.41-.014c-2.144.975-4.263 1.47-6.298 1.47-4.431 0-7.183-2.742-7.183-7.155 0-4.442 2.685-7.094 7.183-7.094 1.676 0 4.13.25 6.303 1.442.138.075.288.08.402.012.1-.06.156-.164.156-.293v-3.131c0-.263-.257-.393-.335-.427-2.072-.962-4.73-1.305-6.526-1.305-3.364 0-6.188 1.015-8.168 2.935-1.973 1.912-3.015 4.63-3.015 7.861 0 6.595 4.39 10.856 11.183 10.856 1.612 0 4.072-.221 6.646-1.276a.46.46 0 0 0 .274-.426l-.06-3.159a.337.337 0 0 0-.152-.296zm138.912 5.157c6.3 0 9.364-3.356 9.364-10.26V22.05a.51.51 0 0 0-.509-.508H258.6a.51.51 0 0 0-.51.508v10.406c0 4.614-1.754 6.856-5.364 6.856-3.63 0-5.394-2.242-5.394-6.856V22.05a.51.51 0 0 0-.51-.508h-2.982a.51.51 0 0 0-.51.508v10.406c0 6.904 3.074 10.26 9.396 10.26zm-120.37 28.117c-.832-.034-1.22-.866-1.711-1.918-.42-.9-.896-1.92-1.771-2.726l-.085-.078.098-.06c1.884-1.168 2.88-3.07 2.88-5.502 0-4.168-2.985-6.86-7.605-6.86h-9.094c-.164 0-.36.062-.36.36v19.976c0 .219.141.36.36.36h3.28c.297 0 .36-.195.36-.36v-6.617h4.709c2.173 0 2.893 1.576 3.655 3.245.88 1.923 1.788 3.911 4.992 3.911.472 0 .807-.057.807-.807v-2.385c0-.412-.096-.513-.515-.54zm-8.045-7.126h-5.603V57.39h5.603c2.197 0 3.456 1.152 3.456 3.159 0 2.007-1.26 3.158-3.456 3.158zm-12.374-10.018H96.729a.51.51 0 0 0-.509.508v19.68c0 .28.229.508.51.508h2.98a.51.51 0 0 0 .51-.508V65.44h9.628a.51.51 0 0 0 .51-.508v-2.386a.51.51 0 0 0-.51-.509h-9.628V57.39h11.716a.51.51 0 0 0 .509-.51v-2.683a.51.51 0 0 0-.51-.508zm48.51-11.45h2.982a.51.51 0 0 0 .51-.51V22.05a.51.51 0 0 0-.51-.508h-2.982a.51.51 0 0 0-.509.508v19.68c0 .28.229.508.51.508zm-13.705.083c6.412 0 10.556-4.262 10.556-10.856 0-6.558-4.144-10.796-10.556-10.796-6.432 0-10.588 4.238-10.588 10.796 0 6.594 4.156 10.856 10.588 10.856zm0-17.95c3.983 0 6.557 2.784 6.557 7.094 0 4.346-2.574 7.154-6.557 7.154-4.003 0-6.588-2.808-6.588-7.154 0-4.31 2.585-7.095 6.588-7.095zm41.35 9.704h5.963a.315.315 0 0 0 .314-.314v-2.625a.315.315 0 0 0-.314-.314h-5.964a.314.314 0 0 0-.313.314v2.625c0 .173.14.314.313.314zm42.085 8.64c6.413 0 10.557-4.261 10.557-10.856 0-6.558-4.144-10.796-10.557-10.796-6.432 0-10.588 4.238-10.588 10.796 0 6.595 4.156 10.856 10.588 10.856zm0-17.95c3.984 0 6.557 2.784 6.557 7.094 0 4.346-2.573 7.154-6.557 7.154-4.002 0-6.588-2.808-6.588-7.154 0-4.31 2.586-7.094 6.588-7.094zm71.963.477a.51.51 0 0 0 .51-.51V22.05a.51.51 0 0 0-.51-.508h-15.206a.51.51 0 0 0-.51.508v19.68c0 .28.23.508.51.508h15.206a.51.51 0 0 0 .51-.508v-2.684a.51.51 0 0 0-.51-.509h-11.716v-5.244h9.629a.51.51 0 0 0 .51-.508v-2.386a.51.51 0 0 0-.51-.509h-9.629v-4.647h11.716zM231.448 53.69h-2.982a.51.51 0 0 0-.509.508v19.68c0 .28.229.508.51.508h2.981a.51.51 0 0 0 .51-.508v-19.68a.51.51 0 0 0-.51-.508zm12.929 8.318-.52-.083c-2.545-.403-4.743-.751-4.743-2.419 0-1.599 1.816-2.592 4.739-2.592 2.804 0 5.274.623 7.142 1.802.25.158.423.211.511.16.107-.059.16-.278.16-.652V55.51c0-.486-.112-.629-.429-.787-1.946-.989-4.5-1.512-7.384-1.512-5.554 0-8.74 2.24-8.74 6.145 0 4.8 3.964 5.78 7.679 6.324l.673.088c3.096.401 5.543.718 5.543 2.741 0 1.71-1.99 2.653-5.603 2.653-2.657 0-5.44-.749-7.263-1.953-.247-.155-.42-.21-.51-.159-.107.059-.16.278-.16.652v2.803c0 .485.112.628.428.786 2 .984 4.806 1.572 7.505 1.572 6.103 0 9.603-2.261 9.603-6.204 0-5.041-4.264-6.051-8.631-6.652zm-27.025-8.016a.484.484 0 0 0-.456-.302h-5.814c-.165 0-.378.094-.454.3l-7.693 19.561c-.076.201-.053.411.062.577a.61.61 0 0 0 .512.258h3.16a.49.49 0 0 0 .455-.301l1.781-4.559h10.168l.022.056 1.759 4.502c.078.21.285.302.455.302h3.16c.225 0 .425-.1.538-.267a.586.586 0 0 0 .037-.566l-7.692-19.56zm-6.963 11.833.045-.12 3.57-9.273.081.21 3.565 9.183h-7.261zm72.595-35.01h-8.676a.51.51 0 0 0-.51.51v2.236c0 .28.23.51.51.51h5.186v4.554l-.05.024c-.947.447-2.189.664-3.794.664-4.364 0-7.184-2.925-7.184-7.452 0-4.442 2.685-7.094 7.184-7.094 1.675 0 4.13.25 6.303 1.442.137.075.288.08.401.012.101-.06.156-.164.156-.293v-3.131c0-.165-.103-.293-.344-.431-2.313-1.2-4.577-1.3-6.516-1.3-3.364 0-6.189 1.014-8.169 2.934-1.972 1.912-3.015 4.63-3.015 7.861 0 6.595 4.39 10.856 11.184 10.856 1.426 0 4.307-.2 7.57-1.544a.467.467 0 0 0 .274-.426v-9.422a.51.51 0 0 0-.51-.51zM271.582 53.69h-15.206a.51.51 0 0 0-.51.508v19.68c0 .28.229.508.51.508h15.206a.51.51 0 0 0 .51-.508v-2.684a.51.51 0 0 0-.51-.509h-11.715V65.44h9.628a.51.51 0 0 0 .51-.508v-2.386a.51.51 0 0 0-.51-.509h-9.628V57.39h11.715a.51.51 0 0 0 .51-.51v-2.683a.51.51 0 0 0-.51-.508zm-71.144 16.104a.43.43 0 0 0-.411-.014c-2.147.976-4.267 1.47-6.302 1.47-4.433 0-7.188-2.743-7.188-7.158 0-4.445 2.687-7.099 7.188-7.099 1.678 0 4.133.25 6.308 1.443.138.076.288.08.401.012.1-.06.156-.164.156-.293V55.02c0-.263-.256-.393-.335-.427-2.073-.963-4.731-1.305-6.53-1.305-3.365 0-6.192 1.015-8.173 2.936-1.973 1.913-3.017 4.633-3.017 7.866 0 6.598 4.393 10.862 11.19 10.862 1.612 0 4.074-.221 6.65-1.276a.467.467 0 0 0 .274-.426l-.059-3.164a.336.336 0 0 0-.152-.294zm2.797-27.915v-6.617h4.708c2.174 0 2.893 1.576 3.656 3.244.879 1.924 1.788 3.912 4.991 3.912.473 0 .808-.058.808-.807v-2.385c0-.412-.097-.513-.515-.54-.833-.033-1.22-.865-1.712-1.917-.42-.9-.895-1.92-1.77-2.726l-.086-.078.098-.06c1.885-1.168 2.881-3.07 2.881-5.502 0-4.168-2.986-6.86-7.605-6.86h-9.094c-.165 0-.36.062-.36.36v19.976c0 .219.14.36.36.36h3.28c.297 0 .36-.195.36-.36zm0-16.635h5.603c2.196 0 3.456 1.152 3.456 3.159 0 2.007-1.26 3.158-3.456 3.158h-5.603v-6.317zm-53.63 28.748a.484.484 0 0 0-.457-.302h-5.814a.49.49 0 0 0-.455.301l-7.692 19.56c-.076.2-.053.41.062.577.113.164.3.258.512.258h3.16c.17 0 .378-.093.456-.301l1.78-4.559h10.168l.021.056 1.76 4.502c.078.21.285.302.456.302h3.16c.224 0 .425-.1.538-.267a.585.585 0 0 0 .037-.566l-7.693-19.56zm-6.964 11.833.045-.12 3.57-9.273.081.21 3.566 9.183h-7.262zm36.206-12.135h-2.981a.51.51 0 0 0-.51.508v14.115l-.155-.195-11.36-14.222a.56.56 0 0 0-.469-.206h-3.25a.51.51 0 0 0-.508.508v19.68c0 .28.228.508.509.508h2.982a.51.51 0 0 0 .509-.508V59.854l11.545 14.325a.655.655 0 0 0 .469.206h3.22a.51.51 0 0 0 .51-.508v-19.68a.51.51 0 0 0-.51-.508zm-44.48-15.003c-.833-.034-1.221-.866-1.712-1.918-.42-.9-.895-1.92-1.771-2.726l-.085-.078.098-.06c1.884-1.168 2.88-3.07 2.88-5.502 0-4.168-2.985-6.86-7.605-6.86h-9.093c-.165 0-.361.062-.361.36v19.976c0 .219.141.36.36.36h3.28c.297 0 .36-.195.36-.36v-6.617h4.709c2.173 0 2.893 1.576 3.655 3.244.88 1.924 1.788 3.912 4.992 3.912.472 0 .807-.058.807-.807v-2.385c0-.412-.096-.513-.515-.54zm-8.046-7.126h-5.603v-6.317h5.603c2.197 0 3.456 1.152 3.456 3.159 0 2.007-1.26 3.158-3.456 3.158zm68.851 44.587H191.4c-.235 0-.34.044-.388.081-.084.065-.19.171-.318.318l-2.655 3.34a.37.37 0 0 0-.095.232c0 .042 0 .113.17.113h3.058c.213 0 .306-.037.347-.068.074-.055.167-.14.277-.25l3.516-3.487c.06-.059.089-.115.089-.166 0-.034 0-.113-.228-.113z"></path></svg>
          </div>
          <h1 class="text-2xl font-bold text-gray-900">La Croix-Rouge te remercie {{ firstName() }} !</h1>
          <p class="text-gray-500 mt-1">Tes résultats de la Quête {{ year() }}</p>
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

          @if (thanksMessage()) {
            <div class="max-w-4xl mx-auto px-4 mb-6">
              <div class="bg-red-50 rounded-xl shadow p-6 border border-red-100">
                <h3 class="text-lg font-semibold text-red-800 mb-3">Message du président de l'unité locale de {{ ulName() }} : {{ presidentTitle() }} {{ presidentFirstName() }}, {{ presidentLastName() }}</h3>
                <div [innerHTML]="thanksMessageHtml()" class="prose prose-sm text-gray-700"></div>
              </div>
            </div>
          }

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

        <footer class="bg-gray-100 py-4 text-center text-sm text-gray-500 mt-8">
          Croix-Rouge française — RedCrossQuest
        </footer>
      </div>
    }
  `,
  styles: [`
  :host { display: block; }
  :host ::ng-deep .prose a {
    color: #DC2626;
    text-decoration: underline;
    font-weight: 500;
  }
  :host ::ng-deep .prose a:hover {
    color: #991B1B;
  }
`],
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
  readonly ulName = signal('');
  readonly presidentTitle = signal('');
  readonly presidentFirstName = signal('');
  readonly presidentLastName = signal('');
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
      this.ulName.set(response.ul_name || '');
      this.presidentTitle.set(response.president_title || '');
      this.presidentFirstName.set(response.president_first_name || '');
      this.presidentLastName.set(response.president_last_name || '');

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

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const latLng: L.LatLngExpression = [p.latitude!, p.longitude!];
      const radius = getRadius(p.total_amount, minVal, maxVal);
      const name = p.name || 'Sans nom';

      // 1. Marker cercle plein coloré vif
      const circle = L.circleMarker(latLng, {
        radius: Math.max(radius, 12),
        fillColor: '#DC2626',
        fillOpacity: 0.9,
        color: '#fff',
        weight: 3,
        opacity: 1.0,
      });
      this.circlesLayer.addLayer(circle);

      // 2. Position décalée pour le label (offset variable pour éviter les superpositions)
      const angle = (2 * Math.PI * i) / points.length;
      const OFFSET = 0.003; // ~300m
      const offsetLat = p.latitude! + OFFSET * Math.cos(angle);
      const offsetLng = p.longitude! + OFFSET * Math.sin(angle);
      const labelLatLng: L.LatLngExpression = [offsetLat, offsetLng];

      // 3. Trait reliant le marker au label
      const line = L.polyline([latLng, labelLatLng], {
        color: '#6B7280',
        weight: 1.5,
        dashArray: '4,4',
        opacity: 0.7,
      });
      this.circlesLayer.addLayer(line);

      // 4. Label permanent au bout du trait
      const labelIcon = L.divIcon({
        className: '',
        html: `<div style="
          background: white;
          border: 2px solid #DC2626;
          border-radius: 8px;
          padding: 4px 8px;
          font-size: 12px;
          font-weight: 600;
          white-space: normal;
          max-width: 200px;
          width: max-content;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
          line-height: 1.4;
        ">
          <div style="color: #1F2937;">${name}</div>
          <div style="color: #DC2626;">💰 ${formatNumber(p.total_amount)} €</div>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0],
      });
      const labelMarker = L.marker(labelLatLng, { icon: labelIcon, interactive: false });
      this.circlesLayer.addLayer(labelMarker);
    }

    // Fit bounds avec padding pour les labels
    if (this.map) {
      const allLatLngs = points.flatMap((p, idx) => {
        const angle = (2 * Math.PI * idx) / points.length;
        return [
          [p.latitude!, p.longitude!] as L.LatLngExpression,
          [p.latitude! + 0.003 * Math.cos(angle), p.longitude! + 0.003 * Math.sin(angle)] as L.LatLngExpression,
        ];
      });
      this.map.fitBounds(L.latLngBounds(allLatLngs), { padding: [60, 60], maxZoom: 15 });
    }
  }
}
