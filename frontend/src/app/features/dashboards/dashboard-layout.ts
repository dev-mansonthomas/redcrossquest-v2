import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-dashboard-layout',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  template: `
    <div class="h-screen flex">
      <aside class="w-64 bg-gray-800 text-white flex flex-col">
        <div class="p-4 border-b border-gray-700">
          <h1 class="text-lg font-bold text-red-400">RedCrossQuest</h1>
          <p class="text-xs text-gray-400 mt-1">{{ authService.user()?.name }}</p>
        </div>
        <nav class="flex-1 p-4 space-y-1">
          <a routerLink="/dashboards/cumul"
             routerLinkActive="bg-gray-700 text-white"
             class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
            📊 Cumul Journalier
          </a>
          <a routerLink="/dashboards/kpi"
             routerLinkActive="bg-gray-700 text-white"
             class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
            📈 KPI Annuels
          </a>
          <a routerLink="/dashboards/comptage"
             routerLinkActive="bg-gray-700 text-white"
             class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
            🧮 Comptage Trésorier
          </a>
          <a routerLink="/dashboards/leaderboard"
             routerLinkActive="bg-gray-700 text-white"
             class="block px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
            🏆 Leaderboard
          </a>
        </nav>
        <div class="p-4 border-t border-gray-700">
          <button
            (click)="authService.logout()"
            class="w-full text-left px-3 py-2 rounded-md text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors">
            🚪 Déconnexion
          </button>
        </div>
      </aside>
      <main class="flex-1 overflow-hidden">
        <router-outlet />
      </main>
    </div>
  `,
})
export class DashboardLayoutComponent {
  protected readonly authService = inject(AuthService);
}

