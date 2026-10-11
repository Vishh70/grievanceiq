import { test, expect } from '@playwright/test';
import { mockCitizenUser, mockComplaints } from './fixtures/mockData.js';

test.describe('Journey 2 — Complaint Tracking & Detail Verification', () => {

  test.beforeEach(async ({ page }) => {
    await page.addInitScript((user) => {
      window.localStorage.setItem('giq_token', 'mock-citizen-jwt-token');
      window.localStorage.setItem('giq_user', JSON.stringify(user));
    }, mockCitizenUser);
  });

  test('2.1 Loads valid complaint details and renders accurate category, status, and metadata', async ({ page }) => {
    const targetComplaint = mockComplaints[0];

    // Mock GET /api/complaints/:id
    await page.route(`**/api/complaints/${targetComplaint._id}`, async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ complaint: targetComplaint })
      });
    });

    await page.goto(`/complaints/${targetComplaint._id}`);

    // Verify complaint heading with short ID
    const shortId = targetComplaint._id.slice(-6).toUpperCase();
    await expect(page.getByRole('heading', { name: new RegExp(`Complaint #${shortId}`, 'i') })).toBeVisible();

    // Verify priority badge rendered
    await expect(page.getByText(`${targetComplaint.priority} Priority`)).toBeVisible();

    // Verify status badge rendered
    await expect(page.getByText(targetComplaint.status).first()).toBeVisible();

    // Verify description text rendered
    await expect(page.getByText(targetComplaint.text)).toBeVisible();
  });

  test('2.2 Handles not-found complaint identifier cleanly', async ({ page }) => {
    // Mock 404 for unknown complaint ID
    await page.route('**/api/complaints/nonexistent-uuid-999', async (route) => {
      return route.fulfill({
        status: 404,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Complaint not found' })
      });
    });

    await page.goto('/complaints/nonexistent-uuid-999');

    // Verify "Complaint Not Found" heading renders
    await expect(page.getByRole('heading', { name: /Complaint Not Found/i })).toBeVisible();
    await expect(page.getByText(/The requested complaint ID does not exist/i)).toBeVisible();
  });

});
