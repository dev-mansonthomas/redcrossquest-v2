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
            Votre adresse email est associée à plusieurs comptes actifs.
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

        <!-- Account details -->
        <div class="mb-6">
          <h2 class="text-sm font-semibold text-gray-700 mb-2">Comptes trouvés :</h2>
          <div class="bg-gray-50 border border-gray-200 rounded-lg p-3 text-xs font-mono text-gray-600 overflow-x-auto">
            <pre class="whitespace-pre-wrap">{{ accountDetails }}</pre>
          </div>
        </div>

        <!-- Action buttons -->
        <div class="flex gap-3">
          <button
            (click)="copyToClipboard()"
            class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-800 font-medium py-2 px-4 rounded-lg transition-colors">
            {{ copied ? '✅ Copié !' : '📋 Copier les informations' }}
          </button>
          <button
            (click)="goToLogin()"
            class="flex-1 bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-lg transition-colors">
            🔄 Réessayer
          </button>
        </div>
      </div>
    </div>
  `,
})
export class MultiAccountErrorComponent {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  accountDetails = '';
  copied = false;
  mailtoLink = '';

  constructor() {
    const details = this.route.snapshot.queryParamMap.get('details') || '';
    this.accountDetails = decodeURIComponent(details);
    this.mailtoLink = this.buildMailtoLink();
  }

  private buildMailtoLink(): string {
    const subject = encodeURIComponent('Comptes multiples détectés');
    const body = encodeURIComponent(
      `Bonjour,\n\nJ'ai plusieurs comptes associés à mon email et je ne peux pas me connecter.\n\nDétails des comptes :\n${this.accountDetails}\n\nMerci de votre aide.`
    );
    return `mailto:support.redcrossquest@croix-rouge.fr?subject=${subject}&body=${body}`;
  }

  async copyToClipboard(): Promise<void> {
    try {
      await navigator.clipboard.writeText(this.accountDetails);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = this.accountDetails;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      this.copied = true;
      setTimeout(() => (this.copied = false), 2000);
    }
  }

  goToLogin(): void {
    this.router.navigate(['/login']);
  }
}

