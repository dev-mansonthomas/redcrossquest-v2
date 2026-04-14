import { Component } from '@angular/core';
import { ENV_HEADER_BG } from '../../core/utils/env-header';

@Component({
  selector: 'app-welcome-page',
  standalone: true,
  template: `
    <div class="h-full w-full flex flex-col bg-white">
      <!-- Header -->
      <div
        [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center shrink-0 ' + headerBg"
      >

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

        </div>
      </div>
    </div>
  `,
})
export class WelcomePageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
}
