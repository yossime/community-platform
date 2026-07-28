import { test, expect } from '@playwright/test';

test.describe('Courses', () => {
  test('courses page loads', async ({ page }) => {
    await page.goto('/courses');
    await expect(page).toHaveURL(/\/courses/);
  });

  test('courses page has RTL layout', async ({ page }) => {
    await page.goto('/courses');

    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'he');
  });

  test('create course page requires authentication', async ({ page }) => {
    await page.goto('/courses/new');

    // Should redirect to login
    await expect(page).toHaveURL(/\/login/);
  });

  test('course detail page loads', async ({ page }) => {
    await page.goto('/courses/test-course');

    const body = page.locator('body');
    await expect(body).toBeVisible();
  });
});
