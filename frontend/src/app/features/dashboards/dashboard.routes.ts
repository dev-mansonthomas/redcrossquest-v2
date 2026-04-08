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
        path: ':slug',
        loadComponent: () =>
          import('./dashboard-view').then((m) => m.DashboardViewComponent),
      },
    ],
  },
];

