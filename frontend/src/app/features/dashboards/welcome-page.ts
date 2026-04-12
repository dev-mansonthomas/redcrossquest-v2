import { Component } from '@angular/core';

@Component({
  selector: 'app-welcome-page',
  standalone: true,
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div
        class="h-14 px-4 bg-white border-b border-gray-200 shadow-sm flex items-center shrink-0"
      >
        <h2 class="text-lg font-semibold text-gray-800">✚ RedCrossQuest</h2>
      </div>

      <!-- Content -->
      <div class="flex-1 flex items-center justify-center p-8">
        <div class="text-center max-w-lg">
          <div class="text-6xl mb-6 text-red-600">✚</div>
          <h1 class="text-2xl font-bold text-gray-800 mb-3">
            Bienvenue sur RedCrossQuest
          </h1>
          <p class="text-gray-500 mb-6">
            Sélectionnez un dashboard dans le menu de gauche pour commencer.
          </p>
          <div
            class="flex flex-wrap justify-center gap-3 text-sm text-gray-400"
          >
            <span>📊 Objectifs Annuels</span>
            <span>🗺️ Cartes</span>
            <span>💰 Sacs de Banque</span>
            <span>🏆 Classements</span>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class WelcomePageComponent {}
