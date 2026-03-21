import { Component, inject } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';
import { AuthService } from './core/services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink],
  template: `
    <div class="min-h-screen bg-gray-50">
      @if (authService.isAuthenticated()) {
        <nav class="bg-white shadow-sm border-b border-gray-200">
          <div class="max-w-7xl mx-auto px-4 flex items-center justify-between h-16">
            <a routerLink="/dashboards" class="text-lg font-bold text-red-600">
              RedCrossQuest
            </a>
            <div class="flex items-center gap-4">
              <span class="text-sm text-gray-600">{{ authService.user()?.name }}</span>
              <button
                (click)="authService.logout()"
                class="text-sm text-gray-500 hover:text-gray-700"
              >
                Déconnexion
              </button>
            </div>
          </div>
        </nav>
      }
      <router-outlet />
    </div>
  `,
})
export class App {
  protected readonly authService = inject(AuthService);
}
