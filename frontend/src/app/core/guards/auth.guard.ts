import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthService, User } from '../services/auth.service';
import { ApiService } from '../services/api.service';

export const authGuard: CanActivateFn = async () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const api = inject(ApiService);

  const stored = localStorage.getItem('rcq_user');
  if (!stored && !authService.user()) {
    return router.createUrlTree(['/login']);
  }

  try {
    const fresh = await firstValueFrom(api.get<Partial<User>>('/api/me'));
    const current = authService.user();
    authService.setUser({
      email: fresh.email ?? current?.email ?? '',
      name: fresh.name ?? current?.name ?? '',
      role: fresh.role ?? current?.role,
      ul_id: fresh.ul_id ?? current?.ul_id,
      ul_name: fresh.ul_name ?? current?.ul_name,
      role_name: fresh.role_name ?? current?.role_name,
    });
    return true;
  } catch {
    authService.clearSession();
    return router.createUrlTree(['/login']);
  }
};
