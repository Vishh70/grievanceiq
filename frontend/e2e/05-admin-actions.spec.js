import { test, expect } from '@playwright/test';
import { mockAdminUser, mockDashboardSummary, mockComplaints } from './fixtures/mockData.js';

test.describe('Journey 5 — Complaint Drawer & Status Update Workflow', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      window.localStorage.setItem('giq_token', 'mock-admin-token');
      window.localStorage.setItem('giq_user', JSON.stringify(user));
      window.localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
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

    // Mock individual complaint detail route
    await page.route('**/api/complaints/cmp-uuid-101', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ complaint: mockComplaints[0] })
      });
    });
  });

  test('5.1 Opens complaint detail drawer, renders AI predictions, and closes cleanly via Escape key', async ({ page }) => {
    await page.goto('/admin');

    // Switch to Complaint Intelligence tab
    const complaintsTab = page.getByRole('tab', { name: /(Complaint Intelligence|All Complaints)/i });
    await expect(complaintsTab).toBeVisible();
    await complaintsTab.click();

    await expect(page.getByText(/Complaint Intelligence Registry/i)).toBeVisible();

    // Click "Details" on first complaint row
    const viewDetailsBtn = page.getByRole('button', { name: 'Details' }).first();
    await viewDetailsBtn.click();

    // Verify accessible drawer dialog opens
    const drawer = page.getByRole('dialog', { name: /details/i });
    await expect(drawer).toBeVisible();

    // Verify drawer contents
    await expect(drawer.getByRole('heading', { name: /Roads Grievance/i })).toBeVisible();
    await expect(drawer.getByText('Road Maintenance').first()).toBeVisible();

    // Switch to ML models tab and verify multi-label predictions
    await drawer.getByRole('button', { name: /ML Multi-Label Models/i }).click();
    await expect(drawer.getByText('Road Damage')).toBeVisible();

    // Press Escape key and verify drawer closes
    await page.keyboard.press('Escape');
    await expect(drawer).toBeHidden();
  });

  test('5.2 Opens status update modal, submits valid canonical status transition to Resolved, and dismisses on Escape', async ({ page }) => {
    let patchPayload = null;

    // Mock PATCH /api/complaints/:id/status
    await page.route('**/api/complaints/cmp-uuid-101/status', async (route) => {
      if (route.request().method() === 'PATCH') {
        patchPayload = JSON.parse(route.request().postData());
        const updated = {
          ...mockComplaints[0],
          status: patchPayload.status,
          statusHistory: [
            ...mockComplaints[0].statusHistory,
            { status: patchPayload.status, note: patchPayload.note, date: new Date().toISOString() }
          ]
        };
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ message: 'Status updated', complaint: updated })
        });
      }
      return route.continue();
    });

    await page.goto('/admin');

    // Switch to Complaint Intelligence tab
    const complaintsTab = page.getByRole('tab', { name: /(Complaint Intelligence|All Complaints)/i });
    await expect(complaintsTab).toBeVisible();
    await complaintsTab.click();

    await expect(page.getByText(/Complaint Intelligence Registry/i)).toBeVisible();

    // Click "Status" on first complaint row
    const updateStatusBtn = page.getByRole('button', { name: 'Status' }).first();
    await updateStatusBtn.click();

    // Verify status modal dialog opens
    const modal = page.getByRole('dialog', { name: 'Update Complaint Status' });
    await expect(modal).toBeVisible();

    // Test dismissing modal with Escape key
    await page.keyboard.press('Escape');
    await expect(modal).toBeHidden();

    // Re-open modal to perform status update
    await updateStatusBtn.click();
    await expect(modal).toBeVisible();

    // Select canonical status 'Resolved'
    const statusSelect = modal.locator('select.form-select');
    await statusSelect.selectOption('Resolved');

    // Add operational note
    const noteTextarea = modal.locator('textarea.form-textarea');
    await noteTextarea.fill('Pothole patched with asphalt and verified by municipal supervisor.');

    // Submit change
    const submitChangeBtn = modal.getByRole('button', { name: /Apply Status Change/i });
    await submitChangeBtn.click();

    // Verify success toast appears and modal dismisses
    await expect(page.getByText(/updated to Resolved/i)).toBeVisible();
    await expect(modal).toBeHidden();

    // Verify PATCH payload sent to backend
    expect(patchPayload).not.toBeNull();
    expect(patchPayload.status).toBe('Resolved');
    expect(patchPayload.note).toBe('Pothole patched with asphalt and verified by municipal supervisor.');
  });

});
