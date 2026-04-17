import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { ControleAdminService, UlDetailResponse } from './controle-admin.service';

@Component({
  selector: 'app-ul-detail-page',
  standalone: true,
  imports: [RouterModule],
  template: `
    <div class="h-full w-full bg-white overflow-y-auto">
      <div class="h-14 px-4 border-b shadow-sm flex items-center gap-4">
        <a routerLink="/dashboards/controle-admin"
          class="text-sm text-gray-500 hover:text-gray-700">← Retour</a>
        <h2 class="text-lg font-semibold">
          🏛️ Détail UL #{{ ulId }} — {{ ulDetail()?.ul?.name }}
        </h2>
      </div>

      @if (loading()) {
        <div class="p-8 text-center text-gray-400">Chargement...</div>
      } @else if (ulDetail(); as d) {
        <div class="p-6 space-y-6">
          <div class="bg-gray-50 rounded-lg p-4">
            <h3 class="font-semibold mb-2">📋 Informations</h3>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div><span class="text-gray-500">ID:</span> {{ d.ul.id }}</div>
              <div><span class="text-gray-500">Nom:</span> {{ d.ul.name }}</div>
              <div><span class="text-gray-500">Ville:</span> {{ d.ul.city || '—' }}</div>
              <div><span class="text-gray-500">CP:</span> {{ d.ul.postal_code || '—' }}</div>
            </div>
          </div>

          @if (d.admin) {
            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-semibold mb-2">👤 Administrateur</h3>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <span class="text-gray-500">Nom:</span>
                  {{ d.admin.man ? 'M.' : 'Mme' }}
                  {{ d.admin.first_name }} {{ d.admin.last_name }}
                </div>
                <div><span class="text-gray-500">📧</span> {{ d.admin.email || '—' }}</div>
                <div><span class="text-gray-500">📱</span> {{ d.admin.mobile || 'Non renseigné' }}</div>
              </div>
            </div>
          }

          @if (d.registration) {
            <div class="bg-gray-50 rounded-lg p-4">
              <h3 class="font-semibold mb-2">📝 Dernière inscription</h3>
              <div class="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div><span class="text-gray-500">ID:</span> {{ d.registration.id ?? '—' }}</div>
                <div>
                  <span class="text-gray-500">Date:</span>
                  {{ formatDate(d.registration.created) }}
                </div>
                <div>
                  <span class="text-gray-500">Approuvée:</span>
                  {{ d.registration.registration_approved ? '✅' : '❌' }}
                </div>
              </div>
            </div>
          }
        </div>
      } @else {
        <div class="p-8 text-center text-gray-400 italic">UL introuvable.</div>
      }
    </div>
  `,
})
export class UlDetailPageComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly service = inject(ControleAdminService);

  ulId = 0;
  readonly loading = signal(true);
  readonly ulDetail = signal<UlDetailResponse | null>(null);

  ngOnInit(): void {
    this.ulId = Number(this.route.snapshot.params['id']);
    this.service.getUlDetail(this.ulId).subscribe({
      next: (detail) => {
        this.ulDetail.set(detail);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
  }

  formatDate(iso: string | null): string {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
