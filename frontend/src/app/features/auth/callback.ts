import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-callback',
  standalone: true,
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="text-center">
        <div class="animate-spin rounded-full h-12 w-12 border-b-2 border-red-600 mx-auto"></div>
        <p class="mt-4 text-gray-600">Connexion en cours...</p>
        @if (error) {
          <p class="mt-2 text-red-600">{{ error }}</p>
          <a routerLink="/login" class="mt-4 inline-block text-red-600 hover:underline">
            Retour à la connexion
          </a>
        }
      </div>
    </div>
  `,
})
export class CallbackComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly authService = inject(AuthService);

  error = '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const token = params.get('token');
    const name = params.get('name');
    const email = params.get('email');
    const role = params.get('role');
    const ulId = params.get('ul_id');
    const ulName = params.get('ul_name');
    const errorParam = params.get('error');

    if (errorParam) {
      this.error = 'Erreur d\'authentification. Veuillez réessayer.';
      return;
    }

    if (token && email && name) {
      this.authService.setToken(token);
      this.authService.setUser({
        email,
        name,
        role: role ? parseInt(role, 10) : undefined,
        ul_id: ulId ? parseInt(ulId, 10) : undefined,
        ul_name: ulName || undefined,
      });
      this.router.navigate(['/dashboards']);
    } else {
      this.error = 'Paramètres d\'authentification manquants.';
    }
  }
}

