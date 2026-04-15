import { Component, OnInit, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
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
  private readonly api = inject(ApiService);
  private readonly authService = inject(AuthService);

  error = '';

  ngOnInit(): void {
    const params = this.route.snapshot.queryParamMap;
    const errorParam = params.get('error');

    if (errorParam) {
      this.error = 'Erreur d\'authentification. Veuillez réessayer.';
      return;
    }

    // Session token is in httpOnly cookie — fetch user info from /api/me
    this.api.get<{ email: string; role: number; ul_id: number; ul_name: string; role_name: string }>('/api/me')
      .subscribe({
        next: (user) => {
          this.authService.setUser({
            email: user.email,
            name: user.email,
            role: user.role,
            ul_id: user.ul_id,
            ul_name: user.ul_name,
            role_name: user.role_name,
          });
          this.router.navigate(['/dashboards']);
        },
        error: () => {
          this.error = 'Erreur lors de la récupération du profil. Veuillez réessayer.';
        },
      });
  }
}

