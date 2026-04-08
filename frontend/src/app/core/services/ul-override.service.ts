import { Injectable, signal, computed } from '@angular/core';

export interface UlOverride {
  id: number;
  name: string;
}

@Injectable({ providedIn: 'root' })
export class UlOverrideService {
  private readonly _override = signal<UlOverride | null>(null);
  readonly override = this._override.asReadonly();
  readonly isOverridden = computed(() => this._override() !== null);

  constructor() {
    const stored = sessionStorage.getItem('rcq_ul_override');
    if (stored) {
      try {
        this._override.set(JSON.parse(stored));
      } catch {
        sessionStorage.removeItem('rcq_ul_override');
      }
    }
  }

  setOverride(ul: UlOverride): void {
    this._override.set(ul);
    sessionStorage.setItem('rcq_ul_override', JSON.stringify(ul));
  }

  clearOverride(): void {
    this._override.set(null);
    sessionStorage.removeItem('rcq_ul_override');
  }
}
