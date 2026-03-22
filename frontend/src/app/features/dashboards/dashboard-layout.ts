import { Component, OnInit, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { DashboardService } from '../../core/services/dashboard.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="h-screen flex bg-gray-100">
      <!-- Sidebar - Thème clair -->
      <aside class="w-64 bg-white border-r border-gray-200 flex flex-col shadow-sm">
        <!-- Header avec logo -->
        <div class="p-4 border-b border-gray-200">
          <h1 class="text-lg font-bold text-red-600">✚ RedCrossQuest</h1>
        </div>

        <!-- Navigation -->
        <nav class="flex-1 p-4 space-y-1">
          <a routerLink="/dashboards/cumul"
             routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
             [routerLinkActiveOptions]="{exact: false}"
             class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            📊 Cumul Journalier
          </a>
          <a routerLink="/dashboards/kpi"
             routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
             [routerLinkActiveOptions]="{exact: false}"
             class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            📈 KPI Annuels
          </a>
          <a routerLink="/dashboards/comptage"
             routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
             [routerLinkActiveOptions]="{exact: false}"
             class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            🧮 Comptage Trésorier
          </a>
          <a routerLink="/dashboards/leaderboard"
             routerLinkActive="bg-red-50 text-red-700 border-l-4 border-red-600"
             [routerLinkActiveOptions]="{exact: false}"
             class="block px-3 py-2 rounded-r-md text-sm text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-colors">
            🏆 Leaderboard
          </a>
        </nav>

        <!-- Footer avec user info et déconnexion -->
        <div class="p-4 border-t border-gray-200">
          <div class="space-y-1 mb-3">
            <p class="px-3 text-sm text-gray-700">👤 {{ authService.user()?.name }}</p>
            <p class="px-3 text-sm text-gray-600">🏛️ {{ authService.user()?.ul_name || 'UL inconnue' }}</p>
            <p class="px-3 text-sm text-gray-500">{{ getRoleEmoji(authService.user()?.role_name) }} {{ authService.user()?.role_name || 'Rôle inconnu' }}</p>
          </div>
          <button
            (click)="authService.logout()"
            class="w-full text-left px-3 py-2 rounded-md text-sm text-gray-600 hover:bg-red-50 hover:text-red-700 transition-colors">
            🚪 Déconnexion
          </button>
        </div>
      </aside>

      <!-- Main content -->
      <main class="flex-1 overflow-hidden bg-gray-50">
        <router-outlet />
      </main>
    </div>
  `,
})
export class DashboardLayoutComponent implements OnInit {
  protected readonly authService = inject(AuthService);
  private readonly dashboardService = inject(DashboardService);

  private readonly ROLE_EMOJIS: Record<string, string> = {
    'Lecture seul': '👁️',
    'Opérateur': '👷',
    'Compteur': '📊',
    'Admin': '🔑',
    'Super Admin': '👑',
  };

  ngOnInit(): void {
    this.dashboardService.loadDashboards();
  }

  getRoleEmoji(roleName: string | undefined): string {
    return this.ROLE_EMOJIS[roleName || ''] || '🎭';
  }
}

