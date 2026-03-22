import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login').then((m) => m.LoginComponent),
  },
  {
    path: 'auth/callback',
    loadComponent: () =>
      import('./features/auth/callback').then((m) => m.CallbackComponent),
  },
  {
    path: 'auth/multi-account-error',
    loadComponent: () =>
      import('./features/auth/multi-account-error').then(
        (m) => m.MultiAccountErrorComponent
      ),
  },
  {
    path: 'dashboards',
    canActivate: [authGuard],
    loadChildren: () =>
      import('./features/dashboards/dashboard.routes').then(
        (m) => m.DASHBOARD_ROUTES
      ),
  },
  {
    path: '',
    redirectTo: 'dashboards',
    pathMatch: 'full',
  },
  {
    path: '**',
    redirectTo: 'dashboards',
  },
];
