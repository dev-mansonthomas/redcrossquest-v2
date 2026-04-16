import { Routes } from '@angular/router';

// Dashboard UUIDs are now fetched from the backend via DashboardService

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard-layout').then((m) => m.DashboardLayoutComponent),
    children: [
      {
        path: '',
        redirectTo: 'welcome',
        pathMatch: 'full',
      },
      {
        path: 'tableau-quete',
        loadComponent: () =>
          import('../dashboard-quete/dashboard-quete-page').then(
            (m) => m.DashboardQuetePageComponent,
          ),
      },
      {
        path: 'carte-queteurs',
        loadComponent: () =>
          import('../map/active-queteurs-map').then(
            (m) => m.ActiveQueteursMapComponent,
          ),
      },
      {
        path: 'carte-points-quete',
        loadComponent: () =>
          import('../map/points-quete-stats-map').then(
            (m) => m.PointsQueteStatsMapComponent,
          ),
      },
      {
        path: 'admin',
        loadComponent: () =>
          import('../admin/admin-page').then((m) => m.AdminPageComponent),
      },
      {
        path: 'sacs-banque',
        loadComponent: () =>
          import('../money-bags/money-bags-page').then(
            (m) => m.MoneyBagsPageComponent,
          ),
      },
      {
        path: 'classement-global',
        loadComponent: () =>
          import('../classement-global/classement-global-page').then(
            (m) => m.ClassementGlobalPageComponent,
          ),
      },
      {
        path: 'classement-tronc',
        loadComponent: () =>
          import('../classement-tronc/classement-tronc-page').then(
            (m) => m.ClassementTroncPageComponent,
          ),
      },
      {
        path: 'vue-globale',
        loadComponent: () =>
          import('../ul-overview/ul-overview-page').then(
            (m) => m.UlOverviewPageComponent,
          ),
      },
      {
        path: 'objectifs-annuels',
        loadComponent: () =>
          import('../yearly-goals/yearly-goals-page').then(
            (m) => m.YearlyGoalsPageComponent,
          ),
      },
      {
        path: 'controle-donnees',
        loadComponent: () =>
          import('../controle-donnees/controle-donnees-page').then(
            (m) => m.ControleDonneesPageComponent,
          ),
      },
      {
        path: 'etats-troncs',
        loadComponent: () =>
          import('../etats-troncs/etats-troncs-page').then(
            (m) => m.EtatsTroncsPageComponent,
          ),
      },
      {
        path: 'repartition-jours',
        loadComponent: () =>
          import('../repartition-jours/repartition-jours-page').then(
            (m) => m.RepartitionJoursPageComponent,
          ),
      },
      {
        path: 'stats-journalieres',
        loadComponent: () =>
          import('../stats-journalieres/stats-journalieres-page').then(
            (m) => m.StatsJournalieresPageComponent,
          ),
      },
      {
        path: 'comptage-pieces-billets',
        loadComponent: () =>
          import('../comptage-pieces-billets/comptage-pieces-billets-page').then(
            (m) => m.ComptagePiecesBilletsPageComponent,
          ),
      },
      {
        path: 'suivi-mails',
        loadComponent: () =>
          import('../mailing-stats/mailing-stats-page').then(
            (m) => m.MailingStatsPageComponent,
          ),
      },
      {
        path: 'welcome',
        loadComponent: () =>
          import('./welcome-page').then((m) => m.WelcomePageComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('../settings/settings-page').then(
            (m) => m.SettingsPageComponent,
          ),
      },
      {
        path: ':slug',
        loadComponent: () =>
          import('./dashboard-view').then((m) => m.DashboardViewComponent),
      },
    ],
  },
];

