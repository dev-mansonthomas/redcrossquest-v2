import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { AuthService } from '../services/auth.service';
import { UlOverrideService } from '../services/ul-override.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const ulOverrideService = inject(UlOverrideService);
  const token = authService.getToken();

  if (token) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    const override = ulOverrideService.override();
    if (override) {
      headers['X-Override-UL-Id'] = String(override.id);
    }

    const authReq = req.clone({ setHeaders: headers });
    return next(authReq);
  }

  return next(req);
};

