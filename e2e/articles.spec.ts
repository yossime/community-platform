import { test, expect } from '@playwright/test';

test.describe('Articles', () => {
  test('articles page loads', async ({ page }) => {
    await page.goto('/articles');
    await expect(page).toHaveURL(/\/articles/);
  });

  test('create article page requires authentication', async ({ page }) => {
    await page.goto('/articles/new');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('article detail page loads', async ({ page }) => {
    await page.goto('/articles/test-article');

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
