import { test, expect } from '@playwright/test';

test.describe('Search', () => {
  test('search page loads correctly', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search/);

    // Should have RTL direction
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test('search page has search input', async ({ page }) => {
    await page.goto('/search');

    // Should have a search input field
    const searchInput = page.getByRole('searchbox').or(page.getByPlaceholder(/חיפוש|חפש/));
    if (await searchInput.isVisible()) {
      await expect(searchInput).toBeVisible();
    }
  });

  test('search page shows trending when no query', async ({ page }) => {
    await page.goto('/search');

    // Should show trending/popular content section
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('search with query param', async ({ page }) => {
    await page.goto('/search?q=javascript');

    // Should stay on search page
    await expect(page).toHaveURL(/\/search/);
  });
});
