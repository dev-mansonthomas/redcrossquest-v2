import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Subject, debounceTime, distinctUntilChanged, switchMap, of } from 'rxjs';
import { UlOverrideService, UlOverride } from '../../core/services/ul-override.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface UlSearchResult {
  id: number;
  name: string;
}

@Component({
  selector: 'app-admin-page',
  standalone: true,
  template: `
    <div class="p-8 max-w-2xl mx-auto">
      <h1 class="text-2xl font-bold text-gray-800 text-center mb-8">⚙️ Administration Super Admin</h1>

      <!-- Current UL -->
      <div class="bg-white rounded-lg shadow p-6 mb-6">
        <h2 class="text-lg font-semibold text-gray-700 mb-2">UL actuelle</h2>
        @if (ulOverrideService.isOverridden()) {
          <div class="flex items-center justify-between">
            <div>
              <p class="text-base font-medium text-red-600">{{ ulOverrideService.override()?.name }}</p>
              <p class="text-sm text-gray-500">ID: {{ ulOverrideService.override()?.id }}</p>
              <p class="text-xs text-orange-500 mt-1">⚠️ Override actif</p>
            </div>
            <button
              (click)="clearOverride()"
              class="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-md text-sm transition-colors">
              ✕ Revenir à mon UL
            </button>
          </div>
        } @else {
          <p class="text-base text-gray-600">
            🏛️ {{ authService.user()?.ul_name || 'UL inconnue' }}
            <span class="text-sm text-gray-400 ml-2">(ID: {{ authService.user()?.ul_id || '?' }})</span>
          </p>
        }
      </div>

      <!-- Search -->
      <div class="bg-white rounded-lg shadow p-6">
        <h2 class="text-lg font-semibold text-gray-700 mb-4">Changer d'UL</h2>
        <input
          type="text"
          placeholder="Rechercher une UL par nom..."
          [value]="searchTerm()"
          (input)="onSearchInput($event)"
          class="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
        />

        <!-- Results -->
        @if (loading()) {
          <p class="mt-3 text-sm text-gray-500">Recherche en cours...</p>
        }

        @if (results().length > 0) {
          <ul class="mt-3 border border-gray-200 rounded-md divide-y divide-gray-100 max-h-64 overflow-y-auto">
            @for (ul of results(); track ul.id) {
              <li>
                <button
                  (click)="selectUl(ul)"
                  class="w-full text-left px-4 py-3 hover:bg-red-50 transition-colors">
                  <span class="font-medium text-gray-800">{{ ul.name }}</span>
                  <span class="text-sm text-gray-400 ml-2">ID: {{ ul.id }}</span>
                </button>
              </li>
            }
          </ul>
        }

        @if (noResults()) {
          <p class="mt-3 text-sm text-gray-500">Aucune UL trouvée.</p>
        }
      </div>
    </div>
  `,
})
export class AdminPageComponent {
  protected readonly ulOverrideService = inject(UlOverrideService);
  protected readonly authService = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly searchTerm = signal('');
  readonly results = signal<UlSearchResult[]>([]);
  readonly loading = signal(false);
  readonly noResults = signal(false);

  private readonly searchSubject = new Subject<string>();

  constructor() {
    this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (query.length < 2) {
            return of([]);
          }
          this.loading.set(true);
          this.noResults.set(false);
          return this.http.get<UlSearchResult[]>(
            `${environment.apiUrl}/api/ul/search`,
            { params: { q: query } }
          );
        })
      )
      .subscribe({
        next: (results) => {
          this.results.set(results);
          this.loading.set(false);
          this.noResults.set(results.length === 0 && this.searchTerm().length >= 2);
        },
        error: () => {
          this.loading.set(false);
          this.results.set([]);
        },
      });
  }

  onSearchInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.searchTerm.set(value);
    this.searchSubject.next(value);
  }

  selectUl(ul: UlSearchResult): void {
    this.ulOverrideService.setOverride({ id: ul.id, name: ul.name });
    this.results.set([]);
    this.searchTerm.set('');
    this.noResults.set(false);
  }

  clearOverride(): void {
    this.ulOverrideService.clearOverride();
  }
}
