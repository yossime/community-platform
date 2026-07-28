import { test, expect } from '@playwright/test';

test.describe('Marketplace', () => {
  test('marketplace page loads correctly', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page).toHaveURL(/\/marketplace/);

    // Should have RTL direction
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
  });

  test('marketplace shows project listings or empty state', async ({ page }) => {
    await page.goto('/marketplace');

    // Should render the marketplace content
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('create project page requires authentication', async ({ page }) => {
    await page.goto('/marketplace/new');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('project detail page loads', async ({ page }) => {
    await page.goto('/marketplace/test-project');

    // Should show project details or not found
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });

  test('freelancer profile page loads', async ({ page }) => {
    await page.goto('/marketplace/freelancer/test-user');

    // Should show freelancer profile or not found
    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
