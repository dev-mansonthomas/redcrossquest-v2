import { Component, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom, Subject, debounceTime } from 'rxjs';
import { environment } from '../../../environments/environment';
import { ENV_HEADER_BG } from '../../core/utils/env-header';
import {
  ControleAdminService,
  ControleCounts,
  ControleFilters,
  ControleSettings,
  TroncAnomaly,
  UlItem,
  UlSearchResult,
} from './controle-admin.service';

interface Column {
  key: string;
  label: string;
  format?: 'date' | 'euros' | 'duration' | 'int' | 'bool';
}

interface TroncRule {
  key: string;
  icon: string;
  label: string;
  countKey: keyof ControleCounts;
}

interface UlRule {
  key: string;
  icon: string;
  label: string;
  countKey: keyof ControleCounts;
}

interface DayFilter {
  num: number;
  label: string;
  checked: boolean;
}

const RCQ_TRONC_QUETEUR_URI = '#!/tronc_queteur/edit/';

const DEFAULT_COUNTS: ControleCounts = {
  R1_temps_court: 0, R2_sans_retour: 0, R3_montant_eleve: 0,
  R4_cb_mismatch: 0, R5_saisie_suspecte: 0, R11_depart_apres_retour: 0,
  R12_dates_futures: 0, R6_sans_objectif: 0, R7_peu_queteurs: 0,
  R8_peu_users: 0, R9_peu_points: 0, R10_peu_troncs: 0,
  R10b_non_validee: 0, R13_doublons: 0, R14_dormante: 0,
};

@Component({
  selector: 'app-controle-admin-page',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="h-full w-full bg-white overflow-y-auto flex flex-col">
      <!-- Header -->
      <div [class]="'h-14 px-4 border-b border-gray-200 shadow-sm flex items-center justify-between shrink-0 ' + headerBg">
        <h2 class="text-lg font-semibold text-gray-800">🔍 Contrôle de Données Admin</h2>
        <button (click)="toggleSqlDrawer()"
          [disabled]="!debugSql()"
          [title]="debugSql() ? 'Afficher la requête SQL exécutée' : 'Aucune requête SQL disponible'"
          [class]="sqlDrawerOpen()
            ? 'px-3 py-1 text-xs rounded bg-red-600 text-white disabled:opacity-50'
            : 'px-3 py-1 text-xs rounded bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50'">
          🔍 SQL
        </button>
      </div>

      <!-- Top tabs : Troncs / ULs -->
      <div class="px-4 pt-3 flex gap-2 border-b border-gray-200 shrink-0">
        <button (click)="setTab('troncs')"
          [class]="activeTab() === 'troncs'
            ? 'px-4 py-2 text-sm font-medium border-b-2 border-red-600 text-red-700'
            : 'px-4 py-2 text-sm text-gray-500 hover:text-gray-700'">
          📦 Troncs
        </button>
        <button (click)="setTab('uls')"
          [class]="activeTab() === 'uls'
            ? 'px-4 py-2 text-sm font-medium border-b-2 border-red-600 text-red-700'
            : 'px-4 py-2 text-sm text-gray-500 hover:text-gray-700'">
          🏛️ ULs
        </button>
      </div>

      <!-- Sub-header filters -->
      <div class="px-4 py-3 bg-gray-50 border-b border-gray-200 flex flex-wrap gap-4 items-center shrink-0">
        <div class="flex items-center gap-2">
          <label class="text-sm text-gray-600">📅 Année</label>
          <select [(ngModel)]="selectedYear" (change)="onFiltersChange()"
            class="text-sm border border-gray-300 rounded px-2 py-1 bg-white">
            <option [ngValue]="0">Toutes</option>
            @for (y of yearOptions; track y) {
              <option [ngValue]="y">{{ y }}</option>
            }
          </select>
        </div>

        <div class="flex items-center gap-1 flex-wrap">
          <label class="text-sm text-gray-600 mr-1">📆</label>
          @for (day of dayLabels; track day.num) {
            <label class="flex items-center gap-0.5 text-xs text-gray-700 cursor-pointer">
              <input type="checkbox" [(ngModel)]="day.checked" (change)="onFiltersChange()"
                class="h-3 w-3 rounded border-gray-300 text-red-600" />
              {{ day.label }}
            </label>
          }
        </div>

        <div class="flex items-center gap-2 relative">
          <label class="text-sm text-gray-600">🏛️</label>
          <input type="text" [(ngModel)]="ulSearchText" (input)="onUlSearchInput()"
            (focus)="onUlSearchInput()"
            placeholder="Toutes les UL"
            class="text-sm border border-gray-300 rounded px-2 py-1 w-56" />
          @if (selectedUl()) {
            <button (click)="clearUl()" title="Retirer le filtre UL"
              class="text-xs text-gray-500 hover:text-red-600">✕</button>
          }
          @if (ulSuggestions().length > 0) {
            <div class="absolute top-full left-8 mt-1 bg-white border border-gray-300 rounded shadow-lg z-50 max-h-64 overflow-y-auto w-64">
              @for (ul of ulSuggestions(); track ul.id) {
                <button (click)="selectUl(ul)"
                  class="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100 border-b border-gray-100">
                  {{ ul.name }} <span class="text-gray-400">({{ ul.id }})</span>
                </button>
              }
            </div>
          }
        </div>

        @if (activeTab() === 'troncs' && settings()) {
          <div class="flex items-center gap-3 ml-auto">
            <label class="text-xs text-gray-500">⚙️ Seuils :</label>
            <label class="text-xs text-gray-600 flex items-center gap-1">Temps
              <input type="number" [(ngModel)]="seuilTemps" (blur)="saveSettings()"
                class="w-14 text-xs border border-gray-300 rounded px-1 py-0.5" /> min
            </label>
            <label class="text-xs text-gray-600 flex items-center gap-1">Montant
              <input type="number" [(ngModel)]="seuilMontant" (blur)="saveSettings()"
                class="w-16 text-xs border border-gray-300 rounded px-1 py-0.5" /> €
            </label>
            <label class="text-xs text-gray-600 flex items-center gap-1">Saisie
              <input type="number" [(ngModel)]="seuilSaisie" (blur)="saveSettings()"
                class="w-14 text-xs border border-gray-300 rounded px-1 py-0.5" /> €
            </label>
          </div>
        }
      </div>

      <!-- Rule tabs -->
      @if (activeTab() === 'troncs') {
        <div class="px-4 py-2 flex flex-wrap gap-1 border-b border-gray-200 shrink-0">
          @for (rule of troncRules; track rule.key) {
            <button (click)="selectRule(rule.key)"
              [class]="activeRule() === rule.key
                ? 'px-3 py-1.5 text-sm rounded bg-red-600 text-white flex items-center gap-1'
                : 'px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1'">
              <span>{{ rule.icon }} {{ rule.label }}</span>
              <span [class]="activeRule() === rule.key
                ? 'ml-1 text-xs bg-white text-red-700 px-1.5 py-0.5 rounded-full font-semibold'
                : 'ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold'">
                {{ counts()[rule.countKey] }}
              </span>
            </button>
          }
        </div>
      } @else if (activeTab() === 'uls') {
        <div class="px-4 py-2 flex flex-wrap gap-1 border-b border-gray-200 shrink-0">
          @for (rule of ulRules; track rule.key) {
            <button (click)="selectUlRule(rule.key)"
              [class]="activeUlRule() === rule.key
                ? 'px-3 py-1.5 text-sm rounded bg-red-600 text-white flex items-center gap-1'
                : 'px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200 flex items-center gap-1'">
              <span>{{ rule.icon }} {{ rule.label }}</span>
              <span [class]="activeUlRule() === rule.key
                ? 'ml-1 text-xs bg-white text-red-700 px-1.5 py-0.5 rounded-full font-semibold'
                : 'ml-1 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold'">
                {{ counts()[rule.countKey] }}
              </span>
            </button>
          }
        </div>
      }

      <!-- Content -->
      <div class="flex-1 overflow-auto p-4">
        @if (loading()) {
          <div class="text-center py-8 text-gray-400">⏳ Chargement…</div>
        } @else if (activeTab() === 'troncs') {
          @if (items().length === 0) {
            <div class="text-center py-8 text-gray-400 italic">Aucune anomalie détectée</div>
          } @else {
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-left border-b border-gray-200">
                <tr>
                  @for (col of activeColumns(); track col.key) {
                    <th (click)="onSort(col.key)"
                      class="px-3 py-2 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">
                      {{ col.label }} {{ sortIndicator(col.key) }}
                    </th>
                  }
                  <th class="px-3 py-2 font-semibold text-gray-600">Lien</th>
                </tr>
              </thead>
              <tbody>
                @for (item of items(); track item.id) {
                  <tr class="border-b border-gray-100 hover:bg-gray-50">
                    @for (col of activeColumns(); track col.key) {
                      <td class="px-3 py-1.5 text-gray-700">{{ formatCell(item, col) }}</td>
                    }
                    <td class="px-3 py-1.5">
                      <a [href]="getTroncLink(item.id)" target="_blank" rel="noopener"
                        class="text-blue-600 hover:underline text-xs">🔗 Ouvrir</a>
                    </td>
                  </tr>
                }
              </tbody>
            </table>

            <div class="flex items-center justify-between mt-4 gap-4 flex-wrap">
              <span class="text-sm text-gray-500">
                {{ total() }} résultats — page {{ currentPage() }}/{{ totalPages() }}
              </span>
              <div class="flex gap-1">
                <button (click)="goToPage(currentPage() - 1)" [disabled]="currentPage() <= 1"
                  class="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100">← Préc</button>
                @for (p of visiblePages(); track p) {
                  <button (click)="goToPage(p)"
                    [class]="p === currentPage()
                      ? 'px-2 py-1 text-sm border border-red-600 rounded bg-red-600 text-white'
                      : 'px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100'">{{ p }}</button>
                }
                <button (click)="goToPage(currentPage() + 1)" [disabled]="currentPage() >= totalPages()"
                  class="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100">Suiv →</button>
              </div>
              <button (click)="exportCsv()"
                class="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200">📥 Export CSV</button>
            </div>
          }
        } @else if (activeTab() === 'uls') {
          @if (ulItems().length === 0) {
            <div class="text-center py-8 text-gray-400 italic">Aucune anomalie détectée</div>
          } @else {
            <table class="w-full text-sm">
              <thead class="bg-gray-50 text-left border-b border-gray-200">
                <tr>
                  @for (col of activeUlColumns(); track col.key) {
                    <th (click)="onSort(col.key)"
                      class="px-3 py-2 font-semibold text-gray-600 cursor-pointer hover:bg-gray-100 select-none">
                      {{ col.label }} {{ sortIndicator(col.key) }}
                    </th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (item of ulItems(); track $index) {
                  <tr (click)="navigateToUl(item)"
                    class="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    @for (col of activeUlColumns(); track col.key) {
                      <td class="px-3 py-1.5 text-gray-700">{{ formatUlCell(item, col) }}</td>
                    }
                  </tr>
                }
              </tbody>
            </table>

            <div class="flex items-center justify-between mt-4 gap-4 flex-wrap">
              <span class="text-sm text-gray-500">
                {{ total() }} résultats — page {{ currentPage() }}/{{ totalPages() }}
              </span>
              <div class="flex gap-1">
                <button (click)="goToPage(currentPage() - 1)" [disabled]="currentPage() <= 1"
                  class="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100">← Préc</button>
                @for (p of visiblePages(); track p) {
                  <button (click)="goToPage(p)"
                    [class]="p === currentPage()
                      ? 'px-2 py-1 text-sm border border-red-600 rounded bg-red-600 text-white'
                      : 'px-2 py-1 text-sm border border-gray-300 rounded hover:bg-gray-100'">{{ p }}</button>
                }
                <button (click)="goToPage(currentPage() + 1)" [disabled]="currentPage() >= totalPages()"
                  class="px-2 py-1 text-sm border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-100">Suiv →</button>
              </div>
              <button (click)="exportCsv()"
                class="px-3 py-1.5 text-sm rounded bg-gray-100 text-gray-700 hover:bg-gray-200">📥 Export CSV</button>
            </div>
          }
        }
      </div>

      @if (sqlDrawerOpen() && debugSql()) {
        <div class="border-t border-gray-200 bg-gray-900 text-gray-100 shrink-0 flex flex-col max-h-64">
          <div class="flex items-center justify-between px-3 py-1.5 border-b border-gray-700 bg-gray-800">
            <span class="text-xs font-semibold text-gray-300">🔍 Requête SQL exécutée</span>
            <div class="flex gap-2">
              <button (click)="copySqlToClipboard()"
                class="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-100 hover:bg-gray-600">📋 Copier</button>
              <button (click)="toggleSqlDrawer()"
                class="text-xs px-2 py-0.5 rounded bg-gray-700 text-gray-100 hover:bg-gray-600">✕</button>
            </div>
          </div>
          <pre class="flex-1 overflow-auto px-3 py-2 text-xs font-mono whitespace-pre-wrap break-all">{{ debugSql() }}</pre>
        </div>
      }
    </div>
  `,
})
export class ControleAdminPageComponent {
  protected readonly headerBg = ENV_HEADER_BG;
  private readonly service = inject(ControleAdminService);
  private readonly router = inject(Router);
  private readonly rcqBaseUrl = environment.rcqV1Url;

  // ── Tabs & rules ──────────────────────────────────────────────────
  readonly activeTab = signal<'troncs' | 'uls'>('troncs');
  readonly activeRule = signal<string>('temps-court');
  readonly activeUlRule = signal<string>('sans-objectif');

  readonly troncRules: TroncRule[] = [
    { key: 'temps-court',          icon: '⏱️', label: 'Temps ~0',      countKey: 'R1_temps_court' },
    { key: 'sans-retour',          icon: '🔓', label: 'Sans retour',   countKey: 'R2_sans_retour' },
    { key: 'montant-eleve',        icon: '💰', label: '>1000€',        countKey: 'R3_montant_eleve' },
    { key: 'cb-mismatch',          icon: '💳', label: 'CB≠détail',     countKey: 'R4_cb_mismatch' },
    { key: 'saisie-suspecte',      icon: '📋', label: 'Saisie susp.',  countKey: 'R5_saisie_suspecte' },
    { key: 'depart-apres-retour',  icon: '⏰', label: 'Départ>Retour', countKey: 'R11_depart_apres_retour' },
    { key: 'dates-futures',        icon: '📅', label: 'Futures',       countKey: 'R12_dates_futures' },
  ];

  readonly ruleColumns: Record<string, Column[]> = {
    'temps-court': [
      { key: 'ul_name', label: 'UL' },
      { key: 'last_name', label: 'Nom' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'depart', label: 'Départ', format: 'date' },
      { key: 'montant', label: 'Montant', format: 'euros' },
      { key: 'duration_minutes', label: 'Durée', format: 'duration' },
      { key: 'taux_horaire', label: 'Taux horaire', format: 'euros' },
    ],
    'sans-retour': [
      { key: 'ul_name', label: 'UL' },
      { key: 'last_name', label: 'Nom' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'depart', label: 'Départ', format: 'date' },
      { key: 'retour', label: 'Retour', format: 'date' },
      { key: 'comptage', label: 'Comptage', format: 'date' },
      { key: 'montant', label: 'Montant', format: 'euros' },
    ],
    'montant-eleve': [
      { key: 'ul_name', label: 'UL' },
      { key: 'last_name', label: 'Nom' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'depart', label: 'Départ', format: 'date' },
      { key: 'montant', label: 'Montant', format: 'euros' },
      { key: 'duration_minutes', label: 'Durée', format: 'duration' },
    ],
    'cb-mismatch': [
      { key: 'ul_name', label: 'UL' },
      { key: 'last_name', label: 'Nom' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'depart', label: 'Départ', format: 'date' },
      { key: 'don_creditcard', label: 'Don CB', format: 'euros' },
      { key: 'cb_detail', label: 'Détail CB', format: 'euros' },
      { key: 'ecart', label: 'Écart', format: 'euros' },
    ],
    'saisie-suspecte': [
      { key: 'ul_name', label: 'UL' },
      { key: 'last_name', label: 'Nom' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'depart', label: 'Départ', format: 'date' },
      { key: 'montant', label: 'Montant', format: 'euros' },
      { key: 'nb_types_remplis', label: 'Nb types', format: 'int' },
      { key: 'nb_lignes_cb', label: 'Nb lignes CB', format: 'int' },
    ],
    'depart-apres-retour': [
      { key: 'ul_name', label: 'UL' },
      { key: 'last_name', label: 'Nom' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'depart', label: 'Départ', format: 'date' },
      { key: 'retour', label: 'Retour', format: 'date' },
      { key: 'montant', label: 'Montant', format: 'euros' },
    ],
    'dates-futures': [
      { key: 'ul_name', label: 'UL' },
      { key: 'last_name', label: 'Nom' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'depart', label: 'Départ', format: 'date' },
      { key: 'montant', label: 'Montant', format: 'euros' },
    ],
  };

  readonly activeColumns = computed(() => this.ruleColumns[this.activeRule()] ?? []);

  // ── UL rules & columns ────────────────────────────────────────────
  readonly ulRules: UlRule[] = [
    { key: 'sans-objectif', icon: '🎯', label: 'Sans objectif',  countKey: 'R6_sans_objectif' },
    { key: 'peu-queteurs',  icon: '👥', label: '<10 quêteurs',   countKey: 'R7_peu_queteurs' },
    { key: 'peu-users',     icon: '👤', label: '<3 users',       countKey: 'R8_peu_users' },
    { key: 'peu-points',    icon: '📍', label: '<5 points',      countKey: 'R9_peu_points' },
    { key: 'peu-troncs',    icon: '📦', label: '<20 troncs',     countKey: 'R10_peu_troncs' },
    { key: 'non-validee',   icon: '❌', label: 'Non validée',    countKey: 'R10b_non_validee' },
    { key: 'doublons',      icon: '👥', label: 'Doublons',       countKey: 'R13_doublons' },
    { key: 'dormante',      icon: '😴', label: 'Dormante',       countKey: 'R14_dormante' },
  ];

  readonly ulRuleColumns: Record<string, Column[]> = {
    'sans-objectif': [
      { key: 'id', label: 'ID', format: 'int' },
      { key: 'name', label: 'Nom' },
      { key: 'city', label: 'Ville' },
      { key: 'postal_code', label: 'CP' },
    ],
    'peu-queteurs': [
      { key: 'id', label: 'ID', format: 'int' },
      { key: 'name', label: 'Nom' },
      { key: 'city', label: 'Ville' },
      { key: 'nb_queteurs', label: 'Nb quêteurs', format: 'int' },
    ],
    'peu-users': [
      { key: 'id', label: 'ID', format: 'int' },
      { key: 'name', label: 'Nom' },
      { key: 'city', label: 'Ville' },
      { key: 'nb_users', label: 'Nb users', format: 'int' },
    ],
    'peu-points': [
      { key: 'id', label: 'ID', format: 'int' },
      { key: 'name', label: 'Nom' },
      { key: 'city', label: 'Ville' },
      { key: 'nb_points', label: 'Nb points', format: 'int' },
    ],
    'peu-troncs': [
      { key: 'id', label: 'ID', format: 'int' },
      { key: 'name', label: 'Nom' },
      { key: 'city', label: 'Ville' },
      { key: 'nb_troncs', label: 'Nb troncs', format: 'int' },
    ],
    'non-validee': [
      { key: 'id', label: 'ID', format: 'int' },
      { key: 'name', label: 'Nom' },
      { key: 'city', label: 'Ville' },
      { key: 'registration_date', label: 'Inscription', format: 'date' },
      { key: 'registration_approved', label: 'Approuvée', format: 'bool' },
    ],
    'doublons': [
      { key: 'ul_name', label: 'UL' },
      { key: 'first_name', label: 'Prénom' },
      { key: 'last_name', label: 'Nom' },
      { key: 'nb_doublons', label: 'Nb doublons', format: 'int' },
    ],
    'dormante': [
      { key: 'id', label: 'ID', format: 'int' },
      { key: 'name', label: 'Nom' },
      { key: 'city', label: 'Ville' },
      { key: 'derniere_activite', label: 'Dernière activité', format: 'date' },
      { key: 'jours_inactivite', label: 'Jours inactivité', format: 'int' },
    ],
  };

  readonly activeUlColumns = computed(() => this.ulRuleColumns[this.activeUlRule()] ?? []);

  // ── Filters ───────────────────────────────────────────────────────
  selectedYear = 0;
  readonly yearOptions: number[] = this.buildYearOptions();

  dayLabels: DayFilter[] = [
    { num: 1, label: 'S1', checked: true },
    { num: 2, label: 'D2', checked: true },
    { num: 3, label: 'L3', checked: true },
    { num: 4, label: 'M4', checked: true },
    { num: 5, label: 'M5', checked: true },
    { num: 6, label: 'J6', checked: true },
    { num: 7, label: 'V7', checked: true },
    { num: 8, label: 'S8', checked: true },
    { num: 9, label: 'D9', checked: true },
  ];

  ulSearchText = '';
  readonly selectedUl = signal<UlSearchResult | null>(null);
  readonly ulSuggestions = signal<UlSearchResult[]>([]);
  private readonly ulSearch$ = new Subject<string>();

  // ── Settings ──────────────────────────────────────────────────────
  readonly settings = signal<ControleSettings | null>(null);
  seuilTemps = 20;
  seuilMontant = 1000;
  seuilSaisie = 50;

  // ── Data & paging ─────────────────────────────────────────────────
  readonly counts = signal<ControleCounts>(DEFAULT_COUNTS);
  readonly items = signal<TroncAnomaly[]>([]);
  readonly ulItems = signal<UlItem[]>([]);
  readonly total = signal(0);
  readonly currentPage = signal(1);
  readonly totalPages = signal(0);
  readonly pageSize = signal(50);
  readonly loading = signal(false);
  readonly sortField = signal<string | null>(null);
  readonly sortDir = signal<'asc' | 'desc'>('desc');

  // ── SQL debug drawer ──────────────────────────────────────────────
  readonly debugSql = signal<string | null>(null);
  readonly sqlDrawerOpen = signal(false);

  readonly visiblePages = computed(() => {
    const cur = this.currentPage();
    const total = this.totalPages();
    if (total <= 0) return [] as number[];
    const start = Math.max(1, cur - 2);
    const end = Math.min(total, start + 4);
    const pages: number[] = [];
    for (let p = Math.max(1, end - 4); p <= end; p++) pages.push(p);
    return pages;
  });

  constructor() {
    this.ulSearch$.pipe(debounceTime(300)).subscribe((q) => this.doUlSearch(q));
    this.loadSettings();
    this.loadCounts();
    this.loadItems();
  }

  // ── Filters plumbing ──────────────────────────────────────────────
  private buildYearOptions(): number[] {
    const cur = new Date().getFullYear();
    const out: number[] = [];
    for (let y = cur; y >= cur - 10; y--) out.push(y);
    return out;
  }

  private getFilters(): ControleFilters {
    const checkedDays = this.dayLabels.filter((d) => d.checked).map((d) => d.num);
    const days = checkedDays.length === 9 ? undefined : checkedDays.join(',');
    const f: ControleFilters = {
      year: Number(this.selectedYear) || 0,
      days: days || undefined,
      page: this.currentPage(),
      page_size: this.pageSize(),
    };
    const ul = this.selectedUl();
    if (ul) f.ul_id = ul.id;
    const sf = this.sortField();
    if (sf) {
      f.sort = sf;
      f.sort_dir = this.sortDir();
    }
    return f;
  }

  setTab(tab: 'troncs' | 'uls'): void {
    this.activeTab.set(tab);
    this.currentPage.set(1);
    this.sortField.set(null);
    this.loadItems();
  }

  selectRule(key: string): void {
    this.activeRule.set(key);
    this.currentPage.set(1);
    this.sortField.set(null);
    this.loadItems();
  }

  selectUlRule(key: string): void {
    this.activeUlRule.set(key);
    this.currentPage.set(1);
    this.sortField.set(null);
    this.loadItems();
  }

  onFiltersChange(): void {
    this.currentPage.set(1);
    this.loadCounts();
    this.loadItems();
  }

  goToPage(p: number): void {
    if (p < 1 || p > this.totalPages()) return;
    this.currentPage.set(p);
    this.loadItems();
  }

  onSort(field: string): void {
    if (this.sortField() === field) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortField.set(field);
      this.sortDir.set('asc');
    }
    this.currentPage.set(1);
    this.loadItems();
  }

  sortIndicator(field: string): string {
    if (this.sortField() !== field) return '';
    return this.sortDir() === 'asc' ? '▲' : '▼';
  }

  // ── UL autocomplete ───────────────────────────────────────────────
  onUlSearchInput(): void {
    this.ulSearch$.next(this.ulSearchText);
  }

  private async doUlSearch(q: string): Promise<void> {
    if (!q || q.trim().length < 2) {
      this.ulSuggestions.set([]);
      return;
    }
    try {
      const resp = await firstValueFrom(this.service.searchUl(q.trim()));
      this.ulSuggestions.set(resp.results || []);
    } catch {
      this.ulSuggestions.set([]);
    }
  }

  selectUl(ul: UlSearchResult): void {
    this.selectedUl.set(ul);
    this.ulSearchText = ul.name;
    this.ulSuggestions.set([]);
    this.onFiltersChange();
  }

  clearUl(): void {
    this.selectedUl.set(null);
    this.ulSearchText = '';
    this.ulSuggestions.set([]);
    this.onFiltersChange();
  }

  // ── Data loaders ──────────────────────────────────────────────────
  private async loadCounts(): Promise<void> {
    try {
      const resp = await firstValueFrom(this.service.getCounts(this.getFilters()));
      this.counts.set(resp);
    } catch (err) {
      console.error('[controle-admin] loadCounts failed', err);
      this.counts.set(DEFAULT_COUNTS);
    }
  }

  private async loadItems(): Promise<void> {
    if (this.activeTab() === 'troncs') {
      return this.loadTroncItems();
    }
    return this.loadUlItems();
  }

  private async loadTroncItems(): Promise<void> {
    this.loading.set(true);
    try {
      const resp = await firstValueFrom(this.service.getTroncs(this.activeRule(), this.getFilters()));
      this.items.set(resp.items || []);
      this.total.set(resp.total || 0);
      this.currentPage.set(resp.page || 1);
      this.totalPages.set(resp.total_pages || 0);
      this.debugSql.set(resp.debug_sql ?? null);
    } catch (err) {
      console.error('[controle-admin] loadTroncItems failed', err);
      this.items.set([]);
      this.total.set(0);
      this.totalPages.set(0);
      this.debugSql.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadUlItems(): Promise<void> {
    this.loading.set(true);
    try {
      const resp = await firstValueFrom(this.service.getUls(this.activeUlRule(), this.getFilters()));
      this.ulItems.set(resp.items || []);
      this.total.set(resp.total || 0);
      this.currentPage.set(resp.page || 1);
      this.totalPages.set(resp.total_pages || 0);
      this.debugSql.set(resp.debug_sql ?? null);
    } catch (err) {
      console.error('[controle-admin] loadUlItems failed', err);
      this.ulItems.set([]);
      this.total.set(0);
      this.totalPages.set(0);
      this.debugSql.set(null);
    } finally {
      this.loading.set(false);
    }
  }

  toggleSqlDrawer(): void {
    this.sqlDrawerOpen.update((v) => !v);
  }

  copySqlToClipboard(): void {
    const sql = this.debugSql();
    if (!sql) return;
    void navigator.clipboard?.writeText(sql).catch((err) => {
      console.error('[controle-admin] clipboard write failed', err);
    });
  }

  private async loadSettings(): Promise<void> {
    try {
      const s = await firstValueFrom(this.service.getSettings());
      this.settings.set(s);
      this.seuilTemps = s.seuil_temps_minutes;
      this.seuilMontant = s.seuil_montant_max;
      this.seuilSaisie = s.seuil_saisie_suspecte;
    } catch {
      /* ignored */
    }
  }

  async saveSettings(): Promise<void> {
    const payload: ControleSettings = {
      seuil_temps_minutes: Number(this.seuilTemps),
      seuil_montant_max: Number(this.seuilMontant),
      seuil_saisie_suspecte: Number(this.seuilSaisie),
    };
    const cur = this.settings();
    if (cur
      && cur.seuil_temps_minutes === payload.seuil_temps_minutes
      && cur.seuil_montant_max === payload.seuil_montant_max
      && cur.seuil_saisie_suspecte === payload.seuil_saisie_suspecte) {
      return;
    }
    try {
      const saved = await firstValueFrom(this.service.updateSettings(payload));
      this.settings.set(saved);
      this.loadCounts();
      this.loadItems();
    } catch {
      /* ignored */
    }
  }

  // ── Formatting ────────────────────────────────────────────────────
  formatCell(item: TroncAnomaly, col: Column): string {
    const raw = (item as unknown as Record<string, unknown>)[col.key];
    if (raw == null) return '—';
    switch (col.format) {
      case 'date':     return this.formatDate(String(raw));
      case 'euros':    return this.formatEuros(Number(raw));
      case 'duration': return this.formatDuration(Number(raw));
      case 'int':      return String(Math.trunc(Number(raw)));
      case 'bool':     return raw ? '✅' : '❌';
      default:         return String(raw);
    }
  }

  formatUlCell(item: UlItem, col: Column): string {
    const raw = (item as unknown as Record<string, unknown>)[col.key];
    if (raw == null) return '—';
    switch (col.format) {
      case 'date':     return this.formatDate(String(raw));
      case 'euros':    return this.formatEuros(Number(raw));
      case 'duration': return this.formatDuration(Number(raw));
      case 'int':      return String(Math.trunc(Number(raw)));
      case 'bool':     return raw ? '✅' : '❌';
      default:         return String(raw);
    }
  }

  private formatDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const pad = (n: number) => n.toString().padStart(2, '0');
    return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  private formatEuros(n: number): string {
    if (!isFinite(n)) return '—';
    const formatted = new Intl.NumberFormat('fr-FR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(n).replace(/\u202f|\u00a0/g, "'");
    return `${formatted} €`;
  }

  private formatDuration(minutes: number): string {
    if (!isFinite(minutes)) return '—';
    const m = Math.max(0, Math.trunc(minutes));
    const h = Math.trunc(m / 60);
    const rem = m % 60;
    if (h === 0) return `${rem} min`;
    return `${h}h ${rem.toString().padStart(2, '0')}min`;
  }

  getTroncLink(id: number): string {
    return `${this.rcqBaseUrl}/${RCQ_TRONC_QUETEUR_URI}${id}`;
  }

  navigateToUl(item: UlItem): void {
    const id = item.id ?? item.ul_id;
    if (id == null) return;
    this.router.navigate(['/dashboards/controle-admin/ul', id]);
  }

  // ── CSV export ────────────────────────────────────────────────────
  async exportCsv(): Promise<void> {
    const isUl = this.activeTab() === 'uls';
    const rule = isUl ? this.activeUlRule() : this.activeRule();
    const obs = isUl
      ? this.service.exportUlCsv(rule, this.getFilters())
      : this.service.exportCsv(rule, this.getFilters());
    try {
      const blob = await firstValueFrom(obs);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `controle_${isUl ? 'ul_' : ''}${rule}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      /* ignored */
    }
  }
}
