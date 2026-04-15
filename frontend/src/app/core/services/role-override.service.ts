import { Injectable, signal, computed } from '@angular/core';

export interface RoleOverride {
  role: number;
  role_name: string;
}

export const ROLE_OPTIONS: RoleOverride[] = [
  { role: 1, role_name: 'Lecture seul' },
  { role: 2, role_name: 'Opérateur' },
  { role: 3, role_name: 'Compteur' },
  { role: 4, role_name: 'Admin' },
  { role: 9, role_name: 'Super Admin' },
];

@Injectable({ providedIn: 'root' })
export class RoleOverrideService {
  private readonly _override = signal<RoleOverride | null>(null);
  readonly override = this._override.asReadonly();
  readonly isOverridden = computed(() => this._override() !== null);

  constructor() {
    const stored = sessionStorage.getItem('rcq_role_override');
    if (stored) {
      try {
        this._override.set(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem('rcq_role_override');
      }
    }
  }

  setOverride(role: RoleOverride): void {
    this._override.set(role);
    sessionStorage.setItem('rcq_role_override', JSON.stringify(role));
  }

  clearOverride(): void {
    this._override.set(null);
    sessionStorage.removeItem('rcq_role_override');
  }
}
