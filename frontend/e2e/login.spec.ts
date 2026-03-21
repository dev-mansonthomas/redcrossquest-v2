import { test, expect } from '@playwright/test';

test.describe('Authentication', () => {
  test('should show login page', async ({ page }) => {
    await page.goto('/login');
    await expect(page.getByText('RedCrossQuest')).toBeVisible();
    await expect(
      page.getByRole('button', { name: /connexion avec google/i })
    ).toBeVisible();
  });

  test('should redirect unauthenticated user to login', async ({ page }) => {
    await page.goto('/dashboards');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should redirect root to login when not authenticated', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/login/);
  });

  test('should handle auth callback with error', async ({ page }) => {
    await page.goto('/auth/callback?error=access_denied');
    await expect(page.getByText(/erreur/i)).toBeVisible();
    await expect(page.getByText(/retour/i)).toBeVisible();
  });

  test('should handle auth callback with missing params', async ({ page }) => {
    await page.goto('/auth/callback?token=abc');
    await expect(page.getByText(/manquants/i)).toBeVisible();
  });
});

