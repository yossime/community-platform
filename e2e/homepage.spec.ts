import { test, expect } from '@playwright/test';

test.describe('Homepage', () => {
  test('shows landing page for unauthenticated users', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('h1')).toContainText('הקהילה המקצועית');
    await expect(page.getByRole('link', { name: 'כניסה' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'הרשמה' })).toBeVisible();
  });

  test('has correct RTL direction', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'he');
  });

  test('no external resources loaded (Netfree compliance)', async ({ page }) => {
    const externalRequests: string[] = [];
    const appUrl = new URL(page.url() || 'http://localhost:3000');

    page.on('request', (request) => {
      const url = new URL(request.url());
      if (
        url.hostname !== appUrl.hostname &&
        url.hostname !== 'localhost' &&
        !url.hostname.includes('127.0.0.1')
      ) {
        externalRequests.push(request.url());
      }
    });

    await page.goto('/');
    await page.waitForLoadState('networkidle');

    expect(externalRequests).toEqual([]);
  });

  test('feature cards link to correct pages', async ({ page }) => {
    await page.goto('/');

    const forumsLink = page.getByRole('link', { name: /פורומים מקצועיים/ });
    await expect(forumsLink).toHaveAttribute('href', '/forums');

    const marketplaceLink = page.getByRole('link', { name: /שוק פרילנסרים/ });
    await expect(marketplaceLink).toHaveAttribute('href', '/marketplace');
  });

  test('security headers are present', async ({ page }) => {
    const response = await page.goto('/');
    const headers = response?.headers() ?? {};

    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['strict-transport-security']).toBeDefined();
  });
});
