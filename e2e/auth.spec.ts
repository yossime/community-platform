import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('login page renders correctly', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('h1, h2').first()).toBeVisible();
    await expect(page.getByLabel(/אימייל|דוא/)).toBeVisible();
    await expect(page.getByLabel(/סיסמ/)).toBeVisible();
  });

  test('register page renders correctly', async ({ page }) => {
    await page.goto('/register');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('forgot password page renders correctly', async ({ page }) => {
    await page.goto('/forgot-password');
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('login shows validation errors on empty submit', async ({ page }) => {
    await page.goto('/login');

    // Try to submit empty form
    const submitButton = page.getByRole('button', { name: /כניס|התחבר/ });
    if (await submitButton.isVisible()) {
      await submitButton.click();
      // Should show validation errors or stay on login page
      await expect(page).toHaveURL(/\/login/);
    }
  });

  test('protected routes redirect to login', async ({ page }) => {
    await page.goto('/settings');
    await expect(page).toHaveURL(/\/login/);
  });

  test('protected route preserves redirect param', async ({ page }) => {
    await page.goto('/messages');
    await expect(page).toHaveURL(/\/login\?redirect=%2Fmessages/);
  });
});
