import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-dashboard-list',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="p-6">
      <h2 class="text-xl font-bold mb-4 text-gray-800">Tableaux de bord</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <a
          routerLink="/dashboards/1"
          class="block p-6 bg-white rounded-lg shadow hover:shadow-md transition-shadow"
        >
          <h3 class="font-semibold text-gray-800">Dashboard Principal</h3>
          <p class="text-gray-500 text-sm mt-2">Vue d'ensemble des quêtes</p>
        </a>
      </div>
    </div>
  `,
})
export class DashboardListComponent {}

