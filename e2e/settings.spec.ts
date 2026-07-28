import { test, expect } from '@playwright/test';

test.describe('Settings', () => {
  test('settings page requires authentication', async ({ page }) => {
    await page.goto('/settings');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('settings redirect preserves redirect param', async ({ page }) => {
    await page.goto('/settings');

    await expect(page).toHaveURL(/\/login\?redirect=%2Fsettings/);
  });
});
