import { test, expect } from '@playwright/test';

test.describe('Public Navigation', () => {
  test('forums page loads', async ({ page }) => {
    await page.goto('/forums');
    await expect(page).toHaveURL(/\/forums/);
  });

  test('marketplace page loads', async ({ page }) => {
    await page.goto('/marketplace');
    await expect(page).toHaveURL(/\/marketplace/);
  });

  test('courses page loads', async ({ page }) => {
    await page.goto('/courses');
    await expect(page).toHaveURL(/\/courses/);
  });

  test('articles page loads', async ({ page }) => {
    await page.goto('/articles');
    await expect(page).toHaveURL(/\/articles/);
  });

  test('classifieds page loads', async ({ page }) => {
    await page.goto('/classifieds');
    await expect(page).toHaveURL(/\/classifieds/);
  });

  test('portfolios page loads', async ({ page }) => {
    await page.goto('/portfolios');
    await expect(page).toHaveURL(/\/portfolios/);
  });

  test('search page loads', async ({ page }) => {
    await page.goto('/search');
    await expect(page).toHaveURL(/\/search/);
  });

  test('404 page shows for unknown routes', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await expect(page.locator('text=404')).toBeVisible();
    await expect(page.locator('text=הדף לא נמצא')).toBeVisible();
  });

  test('robots.txt is accessible', async ({ page }) => {
    const response = await page.goto('/robots.txt');
    expect(response?.status()).toBe(200);
    const text = await response?.text();
    expect(text).toContain('User-Agent');
  });
});
