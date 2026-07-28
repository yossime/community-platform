import { test, expect } from '@playwright/test';

test.describe('Classifieds', () => {
  test('classifieds page loads', async ({ page }) => {
    await page.goto('/classifieds');
    await expect(page).toHaveURL(/\/classifieds/);
  });

  test('classifieds has RTL layout', async ({ page }) => {
    await page.goto('/classifieds');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test('create classified requires authentication', async ({ page }) => {
    await page.goto('/classifieds/new');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('classified detail page loads', async ({ page }) => {
    await page.goto('/classifieds/test-listing');

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
