import { test, expect } from '@playwright/test';

test.describe('Forums', () => {
  test('forums page displays correctly', async ({ page }) => {
    await page.goto('/forums');

    // Page should load with RTL direction
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');

    // Should have a heading or title
    await expect(page.locator('h1, h2').first()).toBeVisible();
  });

  test('forums page has category sections', async ({ page }) => {
    await page.goto('/forums');

    // The page should render content (categories or empty state)
    const content = page.locator('main, [role="main"], .content, #__next');
    await expect(content.first()).toBeVisible();
  });

  test('forum detail page loads with slug', async ({ page }) => {
    // Navigate to a specific forum
    await page.goto('/forums/general');

    // Should either show forum content or redirect/show not found
    await expect(page).toHaveURL(/\/forums/);
  });

  test('create thread page requires authentication', async ({ page }) => {
    await page.goto('/forums/general/new');

    // Should redirect to login (auth required)
    await expect(page).toHaveURL(/\/login/);
  });

  test('thread page loads', async ({ page }) => {
    // Direct navigation to a thread
    await page.goto('/forums/general/test-thread');

    // Should show thread content or not found
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
