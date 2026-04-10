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
        redirectTo: 'cumul',
        pathMatch: 'full',
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
        path: 'leaderboard',
        loadComponent: () =>
          import('../leaderboard/leaderboard-page').then(
            (m) => m.LeaderboardPageComponent,
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

