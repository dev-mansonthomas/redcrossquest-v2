import { test, expect } from '@playwright/test';

test.describe('Dashboards', () => {
  test.beforeEach(async ({ page }) => {
    // Mock authentication by setting localStorage
    await page.addInitScript(() => {
      localStorage.setItem(
        'rcq_user',
        JSON.stringify({
          email: 'test@croix-rouge.fr',
          name: 'Test User',
          role: 2,
          ul_id: 42,
        })
      );
      localStorage.setItem('rcq_token', 'mock-token');
    });
  });

  test('should display dashboard sidebar navigation', async ({ page }) => {
    await page.goto('/dashboards');
    await expect(page.getByText('Cumul Journalier')).toBeVisible();
    await expect(page.getByText('KPI Annuels')).toBeVisible();
    await expect(page.getByText('Comptage Trésorier')).toBeVisible();
    await expect(page.getByText('Leaderboard')).toBeVisible();
  });

  test('should display user name in sidebar', async ({ page }) => {
    await page.goto('/dashboards');
    await expect(page.getByText('Test User')).toBeVisible();
  });

  test('should display logout button', async ({ page }) => {
    await page.goto('/dashboards');
    await expect(page.getByText('Déconnexion')).toBeVisible();
  });

  test('should redirect to cumul by default', async ({ page }) => {
    await page.goto('/dashboards');
    await expect(page).toHaveURL(/\/dashboards\/cumul/);
  });

  test('should navigate to KPI dashboard', async ({ page }) => {
    await page.goto('/dashboards');
    await page.getByText('KPI Annuels').click();
    await expect(page).toHaveURL(/\/dashboards\/kpi/);
    await expect(page.getByText('KPI Annuels').first()).toBeVisible();
  });

  test('should navigate to comptage dashboard', async ({ page }) => {
    await page.goto('/dashboards');
    await page.getByText('Comptage Trésorier').click();
    await expect(page).toHaveURL(/\/dashboards\/comptage/);
  });

  test('should navigate to leaderboard dashboard', async ({ page }) => {
    await page.goto('/dashboards');
    await page.getByText('Leaderboard').click();
    await expect(page).toHaveURL(/\/dashboards\/leaderboard/);
  });

  test('should logout and redirect to login', async ({ page }) => {
    await page.goto('/dashboards');
    await page.getByText('Déconnexion').click();
    await expect(page).toHaveURL(/\/login/);
  });
});

