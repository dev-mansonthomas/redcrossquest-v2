import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { embedDashboard } from '@superset-ui/embedded-sdk';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class SupersetService {
  private readonly http = inject(HttpClient);

  async embedDashboard(dashboardId: string, container: HTMLElement): Promise<void> {
    const fetchGuestToken = async (): Promise<string> => {
      const response = await firstValueFrom(
        this.http.get<{ guest_token: string }>(
          `${environment.apiUrl}/api/superset/guest_token`
        )
      );
      return response.guest_token;
    };

    await embedDashboard({
      id: dashboardId,
      supersetDomain: environment.supersetUrl,
      mountPoint: container,
      fetchGuestToken,
      dashboardUiConfig: {
        hideTitle: true,
        filters: { expanded: false },
      },
    });
  }
}

