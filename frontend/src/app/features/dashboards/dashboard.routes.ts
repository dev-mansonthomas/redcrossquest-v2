import { Routes } from '@angular/router';

export const DASHBOARD_ROUTES: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./dashboard-list').then((m) => m.DashboardListComponent),
  },
  {
    path: ':id',
    loadComponent: () =>
      import('./dashboard-view').then((m) => m.DashboardViewComponent),
  },
];

