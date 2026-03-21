import { Component, inject } from '@angular/core';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-100">
      <div class="bg-white p-8 rounded-lg shadow-md w-full max-w-md text-center">
        <h1 class="text-2xl font-bold mb-6 text-gray-800">RedCrossQuest</h1>
        <p class="text-gray-600 mb-8">Connectez-vous pour accéder aux tableaux de bord</p>
        <button
          (click)="login()"
          class="w-full bg-blue-600 text-white py-3 px-4 rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          Se connecter avec Google
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

