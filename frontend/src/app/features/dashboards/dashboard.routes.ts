import { Routes } from '@angular/router';

export const DASHBOARD_UUIDS: Record<string, string> = {
  cumul: 'ba5dd265-346e-4368-b300-b2613c39b6fa',
  kpi: '47a5b11d-8963-4d9e-9d59-86611780678a',
  comptage: '656567f0-16cf-4490-9c77-888446193bd0',
  leaderboard: '47ec9155-b1df-4bb4-a802-e79394dfbce4',
};

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
        path: ':slug',
        loadComponent: () =>
          import('./dashboard-view').then((m) => m.DashboardViewComponent),
      },
    ],
  },
];

