import { Component, inject } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-multi-account-error',
  standalone: true,
  template: `
    <div class="min-h-screen bg-gray-100 flex items-center justify-center p-4">
      <div class="max-w-lg w-full bg-white rounded-lg shadow-lg p-8">
        <!-- Header -->
        <div class="text-center mb-6">
          <div class="text-5xl mb-4">⚠️</div>
          <h1 class="text-2xl font-bold text-gray-800">Plusieurs comptes détectés</h1>
          <p class="text-gray-600 mt-2">
            @if (count !== null) {
              Votre adresse email est associée à <strong>{{ count }}</strong> comptes actifs.
            } @else {
              Votre adresse email est associée à plusieurs comptes actifs.
            }
          </p>
        </div>

        <!-- Instructions -->
        <div class="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
          <p class="text-red-800 text-sm">
            Pour résoudre ce problème, veuillez contacter le support en envoyant un email à :
          </p>
          <a
            [href]="mailtoLink"
            class="block mt-2 text-red-600 font-semibold hover:underline text-center">
            📧 support.redcrossquest&#64;croix-rouge.fr
          </a>
        </div>

        <!-- Action button -->
        <button
          (click)="goToLogin()"
          class="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
          🔄 Réessayer
        </button>
      </div>
    </div>
  `,
})
export class MultiAccountErrorComponent {
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly count: number | null = this.readCount();
  mailtoLink = this.buildMailtoLink();

  private readCount(): number | null {
    const raw = this.route.snapshot.queryParamMap.get('count');
    if (raw === null) {
      return null;
    }
    const parsed = Number.parseInt(raw, 10);
    if (!Number.isFinite(parsed) || parsed <= 1) {
      return null;
    }
    return parsed;
  }

  private buildMailtoLink(): string {
    const subject = encodeURIComponent('Comptes multiples détectés');
    const body = encodeURIComponent(
      `Bonjour,\n\nJ'ai plusieurs comptes associés à mon email et je ne peux pas me connecter.\n\nMerci de votre aide.`
    );
    return `mailto:support.redcrossquest@croix-rouge.fr?subject=${subject}&body=${body}`;
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}

