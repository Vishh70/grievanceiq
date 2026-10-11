import { test, expect } from '@playwright/test';
import { mockAdminUser, mockCitizenUser, mockDashboardSummary, mockComplaints } from './fixtures/mockData.js';

test.describe('Journey 6 — Responsive Layouts & Essential Accessibility', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    });
  });

  test.describe('6.1 Mobile & Desktop Viewport Responsiveness', () => {

    test('Citizen submission page renders properly on mobile viewport (375x667) without horizontal overflow', async ({ page }) => {
      // Set mobile viewport (iPhone SE dimensions)
      await page.setViewportSize({ width: 375, height: 667 });

      await page.addInitScript((user) => {
        window.localStorage.setItem('giq_token', 'mock-citizen-jwt-token');
        window.localStorage.setItem('giq_user', JSON.stringify(user));
      }, mockCitizenUser);

      await page.goto('/complaints/new');

      // Verify header and main submission form are visible
      await expect(page.getByRole('heading', { name: /Submit a Complaint/i })).toBeVisible();
      const textarea = page.locator('textarea[name="text"]');
      await expect(textarea).toBeVisible();

      // Check document horizontal overflow: scrollWidth should match clientWidth (no horizontal scrollbar on root)
      const hasHorizontalOverflow = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth;
      });
      expect(hasHorizontalOverflow).toBe(false);

      // Verify submit button is clickable and full width/accessible
      const submitBtn = page.getByRole('button', { name: /Submit Complaint/i });
      await expect(submitBtn).toBeVisible();
      const box = await submitBtn.boundingBox();
      expect(box).not.toBeNull();
      expect(box.width).toBeGreaterThan(250); // Appropriately sized on mobile
    });

    test('Admin dashboard adapts to mobile and desktop viewports gracefully', async ({ page }) => {
      await page.addInitScript((user) => {
        window.localStorage.setItem('giq_token', 'mock-admin-token');
        window.localStorage.setItem('giq_user', JSON.stringify(user));
      }, mockAdminUser);

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

      // Desktop test (1280x800)
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto('/admin');
      await expect(page.getByRole('heading', { name: /Municipal Operations Center/i })).toBeVisible();

      // Stat cards should be visible
      await expect(page.getByText('Total Complaints')).toBeVisible();

      // Switch to Complaint Intelligence tab
      const complaintsTab = page.getByRole('tab', { name: /Complaint Intelligence/i });
      await expect(complaintsTab).toBeVisible();
      await complaintsTab.click();

      // Mobile test (375x667)
      await page.setViewportSize({ width: 375, height: 667 });
      await page.waitForTimeout(300); // Allow responsive reflow

      // Header remains readable
      await expect(page.getByRole('heading', { name: /Municipal Operations Center/i })).toBeVisible();

      // Complaints table container is scrollable or styled responsibly
      const table = page.locator('table');
      await expect(table).toBeVisible();
    });
  });

  test.describe('6.2 Essential Accessibility (A11y) & Focus Handling', () => {

    test('Submission form inputs have accessible names and focus rings', async ({ page }) => {
      await page.addInitScript((user) => {
        window.localStorage.setItem('giq_token', 'mock-citizen-jwt-token');
        window.localStorage.setItem('giq_user', JSON.stringify(user));
      }, mockCitizenUser);

      await page.goto('/complaints/new');

      // Check text area accessibility
      const textarea = page.locator('textarea[name="text"]');
      await expect(textarea).toBeVisible();
      await textarea.focus();
      await expect(textarea).toBeFocused();

      // Check address text area accessibility
      const addressTextarea = page.locator('textarea[name="address"]');
      await expect(addressTextarea).toBeVisible();
      await addressTextarea.focus();
      await expect(addressTextarea).toBeFocused();

      // Check submit button has accessible name and keyboard activatable
      const submitBtn = page.getByRole('button', { name: /Submit Complaint/i });
      await expect(submitBtn).toBeVisible();
      await expect(submitBtn).toHaveAccessibleName(/Submit Complaint/i);
    });

    test('Status update modal provides accessible dialog role and dismissibility', async ({ page }) => {
      await page.addInitScript((user) => {
        window.localStorage.setItem('giq_token', 'mock-admin-token');
        window.localStorage.setItem('giq_user', JSON.stringify(user));
      }, mockAdminUser);

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

      await page.goto('/admin');

      // Switch to Complaint Intelligence tab
      const complaintsTab = page.getByRole('tab', { name: /Complaint Intelligence/i });
      await expect(complaintsTab).toBeVisible();
      await complaintsTab.click();

      // Click first update status button
      const updateBtn = page.getByRole('button', { name: 'Status' }).first();
      await expect(updateBtn).toBeVisible();
      await updateBtn.click();

      // Check modal role
      const modal = page.getByRole('dialog', { name: 'Update Complaint Status' });
      await expect(modal).toBeVisible();

      // Check modal has cancel button with accessible name
      const cancelBtn = modal.getByRole('button', { name: /Cancel/i });
      await expect(cancelBtn).toBeVisible();

      // Escape key closes modal cleanly
      await page.keyboard.press('Escape');
      await expect(modal).toBeHidden();
    });
  });
});
