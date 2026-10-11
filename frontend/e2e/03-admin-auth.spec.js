import { test, expect } from '@playwright/test';
import { mockAdminUser, mockCitizenUser, mockDashboardSummary, mockComplaints } from './fixtures/mockData.js';

test.describe('Journey 3 — Admin Authentication & Access Control', () => {

  test('3.1 Redirects unauthenticated visitor requesting /admin to /admin/login', async ({ page }) => {
    await page.goto('/admin');
    await expect(page).toHaveURL(/\/admin\/login$/);
    await expect(page.getByRole('heading', { name: /Admin Portal/i })).toBeVisible();
  });

  test('3.2 Redirects non-admin citizen attempting to access /admin to /complaints', async ({ page }) => {
    // Inject citizen credentials into localStorage
    await page.addInitScript((user) => {
      window.localStorage.setItem('giq_token', 'mock-citizen-token');
      window.localStorage.setItem('giq_user', JSON.stringify(user));
    }, mockCitizenUser);

    // Mock complaints endpoint for redirected destination
    await page.route('**/api/complaints?**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ complaints: [], total: 0, page: 1, pages: 1 })
      });
    });

    await page.goto('/admin');
    await expect(page).toHaveURL(/\/complaints$/);
  });

  test('3.3 Denies administrative login for non-admin accounts', async ({ page }) => {
    // Mock login returning citizen role
    await page.route('**/api/auth/login', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-citizen-token',
          user: mockCitizenUser
        })
      });
    });

    await page.goto('/admin/login');

    await page.locator('#admin-email').fill('citizen@example.com');
    await page.locator('#admin-password').fill('citizen-password-123');
    await page.getByRole('button', { name: /Secure Login/i }).click();

    // Verify access denied toast is displayed
    await expect(page.getByText('Access Denied. You are not an administrator.')).toBeVisible();
    await expect(page).toHaveURL(/\/admin\/login$/);
  });

  test('3.4 Authenticates valid administrator and renders operations command center', async ({ page }) => {
    // Mock successful admin login
    await page.route('**/api/auth/login', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          token: 'mock-admin-token-xyz',
          user: mockAdminUser
        })
      });
    });

    // Mock dashboard metrics
    await page.route('**/api/dashboard/summary', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockDashboardSummary)
      });
    });

    await page.route('**/api/dashboard/similar-groups', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ groups: [] })
      });
    });

    await page.route('**/api/civic-issues', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([])
      });
    });

    await page.route('**/api/complaints?**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          complaints: mockComplaints,
          total: mockComplaints.length,
          page: 1,
          pages: 1
        })
      });
    });

    await page.goto('/admin/login');

    await page.locator('#admin-email').fill('admin@grievanceiq.com');
    await page.locator('#admin-password').fill('ValidAdminPassword123!');
    await page.getByRole('button', { name: /Secure Login/i }).click();

    // Verify navigation to /admin
    await expect(page).toHaveURL(/\/admin$/);

    // Verify operations dashboard renders
    await expect(page.getByRole('heading', { name: /Municipal Operations Center/i })).toBeVisible();

    // Verify token stored in localStorage
    const storedToken = await page.evaluate(() => localStorage.getItem('giq_token'));
    expect(storedToken).toBe('mock-admin-token-xyz');
  });

});
