import { Component, input, output } from '@angular/core';
import { DAY_LABELS } from '../../constants/day-labels';

@Component({
  selector: 'app-day-filter',
  standalone: true,
  host: { class: 'flex flex-wrap items-center gap-2' },
  template: `
    @for (label of dayLabels; track label; let i = $index) {
      <label class="flex items-center gap-1 text-sm text-gray-700 cursor-pointer select-none">
        <input type="checkbox"
          [checked]="selected()[i]"
          (change)="toggleDay(i)"
          class="rounded border-gray-300 text-red-600 focus:ring-red-500">
        {{ label }}
      </label>
    }
    <button (click)="selectAll()"
      class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Tous</button>
    <button (click)="selectNone()"
      class="px-2 py-0.5 text-xs border border-gray-300 rounded text-gray-600 hover:bg-gray-100 transition-colors">Aucun</button>
  `,
})
export class DayFilterComponent {
  readonly selected = input.required<boolean[]>();
  readonly selectedChange = output<boolean[]>();

  protected readonly dayLabels = DAY_LABELS;

  toggleDay(index: number): void {
    const next = [...this.selected()];
    next[index] = !next[index];
    this.selectedChange.emit(next);
  }

  selectAll(): void {
    this.selectedChange.emit(Array(DAY_LABELS.length).fill(true));
  }

  selectNone(): void {
    this.selectedChange.emit(Array(DAY_LABELS.length).fill(false));
  }
}
