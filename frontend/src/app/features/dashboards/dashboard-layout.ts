import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';
import { UlOverrideService } from '../../core/services/ul-override.service';
import { environment } from '../../../environments/environment';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="h-screen flex bg-white">
      <!-- Sidebar - Thème clair -->
      <aside class="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <!-- Header avec logo -->
        <div class="h-14 px-4 border-b border-gray-200 flex items-center justify-between">
          <a routerLink="/dashboards" class="text-lg font-bold text-red-600 hover:text-red-700 transition-colors cursor-pointer">✚ RedCrossQuest</a>
          @if (envLabel) {
            <span [class]="'px-2 py-0.5 text-xs font-bold rounded-md ' + envBadgeClass">{{ envLabel }}</span>
          }
        </div>

        <!-- Navigation -->
        <nav class="flex-1 p-4 space-y-1">
          <!-- 1. Carte des quêteurs -->
          @if ([2, 3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/carte-queteurs"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              🗺️ Carte des quêteurs
            </a>
          }
          <!-- 2. Carte points de quête -->
          @if ([2, 3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/carte-points-quete"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              📊 Carte points de quête
            </a>
          }
          <!-- 3. Vue globale -->
          @if ([4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/vue-globale"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              📊 Vue globale
            </a>
          }
          <!-- 4. Objectifs Annuels -->
          @if ([3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/objectifs-annuels"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              📊 Objectifs Annuels
            </a>
          }
          <!-- 4.5. Objectifs Annuels Superset (conditionnel) -->
          @if (enableSuperset && [4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/kpi"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              📊 Objectifs Annuels (SS)
            </a>
          }
          <!-- 5. Répartition journalière -->
          @if ([3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/repartition-jours"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              📊 Répartition journalière
            </a>
          }
          <!-- 6. Classement Global -->
          @if ([4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/classement-global"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              🏆 Classement Global
            </a>
          }
          <!-- 7. Classement Tronc -->
          @if ([4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/classement-tronc"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              🏆 Classement Tronc
            </a>
          }
          <!-- 8. Contrôle de données -->
          @if ([3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/controle-donnees"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              🔍 Contrôle de données
            </a>
          }
          <!-- 9. États des troncs -->
          @if ([3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/etats-troncs"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              📦 États des troncs
            </a>
          }
          <!-- 10. Sacs de Banque -->
          @if ([3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/sacs-banque"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              💰 Sacs de Banque
            </a>
          }
          <!-- 11. Pièces & billets -->
          @if ([3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/comptage-pieces-billets"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              🪙 Pièces & billets
            </a>
          }
          <!-- 12. Stats journalières -->
          @if ([3, 4, 9].includes(authService.user()?.role ?? 0)) {
            <a routerLink="/dashboards/stats-journalieres"
               routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
               class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
              📋 Stats journalières
            </a>
          }
        </nav>

        <!-- Footer avec user info et déconnexion -->
        <div class="p-4 border-t border-gray-200">
          <div class="space-y-1 mb-3">
            <p class="px-3 text-sm text-gray-700">👤 {{ authService.user()?.name }}</p>
            <p class="px-3 text-sm text-gray-600">🏛️ {{ authService.user()?.ul_name || 'UL inconnue' }} (id:{{ authService.user()?.ul_id }})</p>
            @if (authService.user()?.role === 9) {
              <a routerLink="/dashboards/admin"
                 class="block px-3 text-sm text-gray-500 hover:text-red-600 cursor-pointer transition-colors">
                {{ getRoleEmoji(authService.user()?.role_name) }} {{ authService.user()?.role_name || 'Rôle inconnu' }}
              </a>
            } @else {
              <p class="px-3 text-sm text-gray-500">{{ getRoleEmoji(authService.user()?.role_name) }} {{ authService.user()?.role_name || 'Rôle inconnu' }}</p>
            }
          </div>
          @if (ulOverrideService.isOverridden()) {
            <div style="border: 2px solid #dc2626; background: #fef2f2; border-radius: 6px; padding: 8px; margin-top: 4px; margin-bottom: 8px;">
              <p style="color: #dc2626; font-weight: bold; font-size: 12px; margin: 0;">⚠️ UL Override</p>
              <p style="font-size: 13px; font-weight: 600; margin: 4px 0 2px;">{{ ulOverrideService.override()?.name }}</p>
              <p style="font-size: 11px; color: #666; margin: 0 0 6px;">ID: {{ ulOverrideService.override()?.id }}</p>
              <button
                (click)="clearOverride()"
                style="width: 100%; padding: 4px 8px; font-size: 12px; background: #dc2626; color: white; border: none; border-radius: 4px; cursor: pointer;">
                ✕ Revenir à mon UL
              </button>
            </div>
          }
          <button
            (click)="authService.logout()"
            class="w-full text-left px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors">
            🚪 Déconnexion
          </button>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 overflow-hidden bg-white flex flex-col">
        <router-outlet />
      </main>
    </div>
  `,
})
export class DashboardLayoutComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  protected readonly dashboardService = inject(DashboardService);
  protected readonly ulOverrideService = inject(UlOverrideService);
  protected readonly enableSuperset = environment.enableSuperset;
  protected readonly envLabel = environment.environmentLabel;
  protected readonly envBadgeClass = ['DEV', 'LOCAL'].includes(environment.environmentLabel)
    ? 'bg-blue-500 text-white'
    : environment.environmentLabel === 'TEST'
      ? 'bg-green-500 text-white'
      : '';

  private readonly ROLE_EMOJIS: Record<string, string> = {
    'Lecture seul': '👁️',
    'Opérateur': '👷',
    'Compteur': '📊',
    'Admin': '🔑',
    'Super Admin': '👑',
  };

  ngOnInit(): void {
    if (this.enableSuperset) {
      this.dashboardService.loadDashboards();
    }
  }

  getRoleEmoji(roleName: string | undefined): string {
    return this.ROLE_EMOJIS[roleName || ''] || '🎭';
  }

  clearOverride(): void {
    this.ulOverrideService.clearOverride();
  }
}

