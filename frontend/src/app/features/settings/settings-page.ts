import {
  Component, inject, signal, ViewChild, ElementRef, AfterViewInit, effect,
} from '@angular/core';
import { firstValueFrom } from 'rxjs';
import Quill from 'quill';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { UlOverrideService } from '../../core/services/ul-override.service';

interface UlSettings {
  ul_id: number;
  ul_name: string;
  thanks_mail_benevole: string;
  thanks_mail_benevole1j: string;
}

const MAX_CHARS = 8000;
const WARN_CHARS = 7500;

@Component({
  selector: 'app-settings-page',
  standalone: true,
  template: `
    <div class="p-6 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <h1 class="text-2xl font-bold text-gray-800">⚙️ Paramètres de l'Unité Locale</h1>
      @if (loading()) {
        <p class="text-gray-500">Chargement…</p>
      }
      @if (error()) {
        <div class="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">{{ error() }}</div>
      }
      @if (success()) {
        <div class="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded">{{ success() }}</div>
      }
      @if (!loading() && !error()) {
        <div class="bg-gray-50 border border-gray-200 rounded-lg p-4 space-y-1">
          <p class="text-sm text-gray-600"><span class="font-semibold">ID de l'UL :</span> {{ ulId() }}</p>
          <p class="text-sm text-gray-600"><span class="font-semibold">Nom de l'UL :</span> {{ ulName() }}</p>
        </div>
        <div class="space-y-2">
          <label class="block text-sm font-semibold text-gray-700">Message de remerciement — Bénévoles</label>
          <div #editorBenevole class="bg-white" style="min-height:200px"></div>
          <p class="text-xs text-right" [class]="charsBenevole() > WARN ? 'text-red-600 font-bold' : 'text-gray-500'">
            {{ charsBenevole() }} / {{ MAX }}
          </p>
        </div>
        <div class="space-y-2">
          <label class="block text-sm font-semibold text-gray-700">Message de remerciement — Bénévoles 1 jour</label>
          <div #editorBenevole1j class="bg-white" style="min-height:200px"></div>
          <p class="text-xs text-right" [class]="charsBenevole1j() > WARN ? 'text-red-600 font-bold' : 'text-gray-500'">
            {{ charsBenevole1j() }} / {{ MAX }}
          </p>
        </div>
        <button
          (click)="save()"
          [disabled]="!dirty() || saving() || charsBenevole() > MAX || charsBenevole1j() > MAX"
          class="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
          @if (saving()) { Enregistrement… } @else { 💾 Enregistrer }
        </button>
      }
    </div>
  `,
})
export class SettingsPageComponent implements AfterViewInit {
  protected readonly api = inject(ApiService);
  protected readonly authService = inject(AuthService);
  protected readonly ulOverrideService = inject(UlOverrideService);
  @ViewChild('editorBenevole') editorBenevoleRef!: ElementRef<HTMLDivElement>;
  @ViewChild('editorBenevole1j') editorBenevole1jRef!: ElementRef<HTMLDivElement>;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly success = signal('');
  readonly saving = signal(false);
  readonly dirty = signal(false);
  readonly ulId = signal(0);
  readonly ulName = signal('');
  readonly thanksBenevole = signal('');
  readonly thanksBenevole1j = signal('');
  readonly charsBenevole = signal(0);
  readonly charsBenevole1j = signal(0);
  readonly MAX = MAX_CHARS;
  readonly WARN = WARN_CHARS;
  private quillBenevole!: Quill;
  private quillBenevole1j!: Quill;
  private editorsReady = false;
  private overrideInitialized = false;
  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) { this.overrideInitialized = true; return; }
    this.loadData();
  });
  constructor() { this.loadData(); }
  ngAfterViewInit(): void { /* editors init after data load */ }
  private initEditors(): void {
    if (this.editorsReady) {
      this.quillBenevole.root.innerHTML = this.thanksBenevole();
      this.quillBenevole1j.root.innerHTML = this.thanksBenevole1j();
      this.dirty.set(false);
      return;
    }
    const tb = [['bold', 'italic', 'underline'], [{ list: 'ordered' }, { list: 'bullet' }], [{ color: [] }], ['link'], ['clean']];
    this.quillBenevole = new Quill(this.editorBenevoleRef.nativeElement, {
      theme: 'snow', modules: { toolbar: tb }, placeholder: 'Saisissez le message de remerciement…',
    });
    this.quillBenevole.root.innerHTML = this.thanksBenevole();
    this.charsBenevole.set(this.quillBenevole.root.innerHTML.length);
    this.quillBenevole.on('text-change', () => {
      const h = this.quillBenevole.root.innerHTML;
      this.thanksBenevole.set(h); this.charsBenevole.set(h.length); this.dirty.set(true); this.success.set('');
    });
    this.quillBenevole1j = new Quill(this.editorBenevole1jRef.nativeElement, {
      theme: 'snow', modules: { toolbar: tb }, placeholder: 'Saisissez le message de remerciement…',
    });
    this.quillBenevole1j.root.innerHTML = this.thanksBenevole1j();
    this.charsBenevole1j.set(this.quillBenevole1j.root.innerHTML.length);
    this.quillBenevole1j.on('text-change', () => {
      const h = this.quillBenevole1j.root.innerHTML;
      this.thanksBenevole1j.set(h); this.charsBenevole1j.set(h.length); this.dirty.set(true); this.success.set('');
    });
    this.editorsReady = true;
    this.dirty.set(false);
  }
  private async loadData(): Promise<void> {
    this.loading.set(true); this.error.set(''); this.success.set('');
    try {
      const data = await firstValueFrom(this.api.get<UlSettings>('/api/ul/settings'));
      this.ulId.set(data.ul_id); this.ulName.set(data.ul_name);
      this.thanksBenevole.set(data.thanks_mail_benevole || '');
      this.thanksBenevole1j.set(data.thanks_mail_benevole1j || '');
      setTimeout(() => this.initEditors(), 0);
    } catch { this.error.set('Erreur lors du chargement des paramètres.'); }
    finally { this.loading.set(false); }
  }
  async save(): Promise<void> {
    if (this.charsBenevole() > MAX_CHARS || this.charsBenevole1j() > MAX_CHARS) return;
    this.saving.set(true); this.error.set(''); this.success.set('');
    try {
      await firstValueFrom(this.api.put('/api/ul/settings', {
        thanks_mail_benevole: this.thanksBenevole(),
        thanks_mail_benevole1j: this.thanksBenevole1j(),
      }));
      this.dirty.set(false);
      this.success.set('Paramètres enregistrés avec succès.');
    } catch { this.error.set('Erreur lors de la sauvegarde.'); }
    finally { this.saving.set(false); }
  }
}
