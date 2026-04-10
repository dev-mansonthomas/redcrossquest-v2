import { Component, inject, signal, effect } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { BaseChartDirective } from 'ng2-charts';
import { ChartData, ChartOptions } from 'chart.js';
import { ApiService } from '../../core/services/api.service';
import { UlOverrideService } from '../../core/services/ul-override.service';

// ── Interfaces ──────────────────────────────────────────────────────
interface FinancialItem {
  label: string;
  amount: number;
}

interface HoursBySector {
  sector: string;
  hours: number;
}

interface QueteursBySector {
  sector: string;
  count: number;
}

interface ActivityMetric {
  label: string;
  value: number;
}

interface FinancialsResponse {
  financials: FinancialItem[];
  hours_by_sector: HoursBySector[];
}

interface ActivityResponse {
  queteurs_by_sector: QueteursBySector[];
  activity_metrics: ActivityMetric[];
}

// ── Sector colors ───────────────────────────────────────────────────
const SECTOR_COLORS: Record<string, string> = {
  'Bénévole': '#E30613',
  'Bénévole d\'un jour': '#9C27B0',
  'Ancien bénévole': '#795548',
  'Commerçant': '#FF9800',
  'Spécial': '#616161',
};

const DEFAULT_SECTOR_ORDER = ['Bénévole', 'Bénévole d\'un jour', 'Ancien bénévole', 'Commerçant', 'Spécial'];

function getSectorColor(sector: string): string {
  return SECTOR_COLORS[sector] || '#9E9E9E';
}

// ── Mock data (fallback while backend is being implemented) ─────────
const MOCK_FINANCIALS: FinancialsResponse = {
  financials: [
    { label: 'Espèces', amount: 12450.80 },
    { label: 'Chèques', amount: 3200.00 },
    { label: 'CB', amount: 8750.50 },
    { label: 'Autres', amount: 1100.00 },
  ],
  hours_by_sector: DEFAULT_SECTOR_ORDER.map((s, i) => ({ sector: s, hours: [120, 45, 30, 60, 10][i] })),
};

const MOCK_ACTIVITY: ActivityResponse = {
  queteurs_by_sector: DEFAULT_SECTOR_ORDER.map((s, i) => ({ sector: s, count: [42, 15, 8, 22, 3][i] })),
  activity_metrics: [
    { label: 'Troncs comptés', value: 187 },
    { label: 'Sorties', value: 312 },
    { label: 'Points de quête actifs', value: 45 },
    { label: 'Jours de quête', value: 9 },
  ],
};

@Component({
  selector: 'app-ul-overview-page',
  standalone: true,
  imports: [DecimalPipe, BaseChartDirective],
  templateUrl: './ul-overview-page.html',
})
export class UlOverviewPageComponent {
  private readonly api = inject(ApiService);
  private readonly ulOverrideService = inject(UlOverrideService);

  readonly selectedYear = signal(new Date().getFullYear());
  readonly yearOptions = signal<number[]>(this.buildYearOptions());
  readonly loading = signal(false);
  readonly error = signal('');
  readonly useMock = signal(false);

  // ── Chart data signals ──────────────────────────────────────────
  readonly financialsChartData = signal<ChartData<'bar'>>({ labels: [], datasets: [] });
  readonly financialsChartOptions = signal<ChartOptions<'bar'>>(this.buildBarOptions('Montants (€)'));

  readonly hoursChartData = signal<ChartData<'doughnut'>>({ labels: [], datasets: [] });
  readonly hoursChartOptions = signal<ChartOptions<'doughnut'>>(this.buildDoughnutOptions());

  readonly queteursChartData = signal<ChartData<'doughnut'>>({ labels: [], datasets: [] });
  readonly queteursChartOptions = signal<ChartOptions<'doughnut'>>(this.buildDoughnutOptions());

  readonly activityMetrics = signal<ActivityMetric[]>([]);

  private overrideInitialized = false;

  private readonly overrideEffect = effect(() => {
    this.ulOverrideService.override();
    if (!this.overrideInitialized) {
      this.overrideInitialized = true;
      return;
    }
    this.loadData();
  });

  constructor() {
    this.loadData();
  }

  onYearChange(event: Event): void {
    const year = parseInt((event.target as HTMLSelectElement).value, 10);
    this.selectedYear.set(year);
    this.loadData();
  }

  refresh(): void {
    this.loadData();
  }

  // continued in template and private methods below
  private async loadData(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.useMock.set(false);

    try {
      const [financials, activity] = await Promise.all([
        this.loadFinancials(),
        this.loadActivity(),
      ]);
      this.applyFinancials(financials);
      this.applyActivity(activity);
    } catch {
      // Fallback to mock data
      this.useMock.set(true);
      this.applyFinancials(MOCK_FINANCIALS);
      this.applyActivity(MOCK_ACTIVITY);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadFinancials(): Promise<FinancialsResponse> {
    return firstValueFrom(
      this.api.get<FinancialsResponse>(`/api/ul-overview/financials?year=${this.selectedYear()}`)
    );
  }

  private async loadActivity(): Promise<ActivityResponse> {
    return firstValueFrom(
      this.api.get<ActivityResponse>(`/api/ul-overview/activity?year=${this.selectedYear()}`)
    );
  }

  private applyFinancials(data: FinancialsResponse): void {
    this.financialsChartData.set({
      labels: data.financials.map(f => f.label),
      datasets: [{
        data: data.financials.map(f => f.amount),
        backgroundColor: '#E30613',
        borderRadius: 4,
        label: 'Montant (€)',
      }],
    });

    const sectors = data.hours_by_sector.map(h => h.sector);
    const colors = sectors.map(s => getSectorColor(s));
    this.hoursChartData.set({
      labels: sectors,
      datasets: [{
        data: data.hours_by_sector.map(h => h.hours),
        backgroundColor: colors,
      }],
    });
  }

  private applyActivity(data: ActivityResponse): void {
    const sectors = data.queteurs_by_sector.map(q => q.sector);
    const colors = sectors.map(s => getSectorColor(s));
    this.queteursChartData.set({
      labels: sectors,
      datasets: [{
        data: data.queteurs_by_sector.map(q => q.count),
        backgroundColor: colors,
      }],
    });
    this.activityMetrics.set(data.activity_metrics);
  }

  private buildBarOptions(yLabel: string): ChartOptions<'bar'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
      },
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: yLabel },
        },
      },
    };
  }

  private buildDoughnutOptions(): ChartOptions<'doughnut'> {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: { padding: 12, usePointStyle: true },
        },
      },
    };
  }

  private buildYearOptions(): number[] {
    const current = new Date().getFullYear();
    const years: number[] = [];
    for (let y = current; y >= current - 10; y--) {
      years.push(y);
    }
    return years;
  }
}
