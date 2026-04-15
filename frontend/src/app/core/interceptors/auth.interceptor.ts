import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { UlOverrideService } from '../services/ul-override.service';
import { RoleOverrideService } from '../services/role-override.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const ulOverrideService = inject(UlOverrideService);
  const roleOverrideService = inject(RoleOverrideService);
  const token = authService.getToken();

  let request = req;
  if (token) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
    };

    const ulOverride = ulOverrideService.override();
    if (ulOverride) {
      headers['X-Override-UL-Id'] = String(ulOverride.id);
    }

    const roleOverride = roleOverrideService.override();
    if (roleOverride) {
      headers['X-Override-Role'] = String(roleOverride.role);
    }

    request = req.clone({ setHeaders: headers });
  }

  return next(request).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401) {
        authService.logout();
      }
      return throwError(() => error);
    })
  );
};

