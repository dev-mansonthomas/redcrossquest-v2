import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 p-8 bg-white rounded-lg shadow">
        <div class="text-center">
          <h2 class="text-3xl font-bold text-gray-900">RedCrossQuest</h2>
          <p class="mt-2 text-sm text-gray-600">Connectez-vous pour accéder aux tableaux de bord</p>
        </div>
        <button
          (click)="login()"
          class="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 font-medium transition-colors"
        >
          Connexion avec Google
        </button>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);

  login(): void {
    this.authService.loginWithGoogle();
  }
}

