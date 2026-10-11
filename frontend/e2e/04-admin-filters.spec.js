import { test, expect } from '@playwright/test';
import { mockAdminUser, mockDashboardSummary, mockComplaints } from './fixtures/mockData.js';

test.describe('Journey 4 — Admin Filters & Atomic Clear All Filters Regression', () => {

  test.beforeEach(async ({ page }) => {
    // Inject admin authentication
    await page.addInitScript((user) => {
      window.localStorage.setItem('giq_token', 'mock-admin-token');
      window.localStorage.setItem('giq_user', JSON.stringify(user));
      window.localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    }, mockAdminUser);

    // Mock summary and supporting endpoints
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
  });

  test('4.1 Applies individual filters, alters query params, and atomically clears all filters simultaneously', async ({ page }) => {
    const queryHistory = [];

    // Capture every request to /api/complaints
    await page.route('**/api/complaints?**', async (route) => {
      const url = new URL(route.request().url());
      const params = Object.fromEntries(url.searchParams.entries());
      queryHistory.push(params);

      // Return mock complaints
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          complaints: mockComplaints,
          total: mockComplaints.length,
          page: parseInt(params.page || '1', 10),
          pages: 1
        })
      });
    });

    await page.goto('/admin');

    // Switch to Complaint Intelligence tab to render ComplaintsTable
    const complaintsTab = page.getByRole('tab', { name: /Complaint Intelligence/i });
    await expect(complaintsTab).toBeVisible();
    await complaintsTab.click();

    await expect(page.getByText('Complaint Intelligence Registry')).toBeVisible();

    // 1. Verify "Clear All Filters" button is NOT visible initially (no active filters)
    const clearFiltersBtn = page.getByRole('button', { name: /Clear All Filters/i });
    await expect(clearFiltersBtn).toBeHidden();

    // 2. Select Category "Roads"
    const categorySelect = page.getByRole('combobox', { name: 'Filter by category' });
    await categorySelect.selectOption('Roads');

    // 3. Select Priority "High"
    const prioritySelect = page.getByRole('combobox', { name: 'Filter by priority' });
    await prioritySelect.selectOption('High');

    // 4. Select Status "Pending"
    const statusSelect = page.getByRole('combobox', { name: 'Filter by status' });
    await statusSelect.selectOption('Pending');

    // 5. Select Department "Road Maintenance"
    const departmentSelect = page.getByRole('combobox', { name: 'Filter by department' });
    await departmentSelect.selectOption('Road Maintenance');

    // 6. Enter Search query
    const searchInput = page.locator('.admin-search-input');
    await searchInput.fill('pothole');
    await page.waitForTimeout(600); // Allow 350ms search debounce to execute

    // Wait for active filter rendering
    await expect(clearFiltersBtn).toBeVisible({ timeout: 5000 });

    // Verify inputs hold the filtered values
    expect(await categorySelect.inputValue()).toBe('Roads');
    expect(await prioritySelect.inputValue()).toBe('High');
    expect(await statusSelect.inputValue()).toBe('Pending');
    expect(await departmentSelect.inputValue()).toBe('Road Maintenance');
    expect(await searchInput.inputValue()).toBe('pothole');

    // Verify last query contained active filters
    const lastFilteredQuery = queryHistory[queryHistory.length - 1];
    expect(lastFilteredQuery.category).toBe('Roads');
    expect(lastFilteredQuery.priority).toBe('High');
    expect(lastFilteredQuery.status).toBe('Pending');
    expect(lastFilteredQuery.department).toBe('Road Maintenance');
    expect(lastFilteredQuery.search).toBe('pothole');

    // 7. Click "Clear All Filters"
    await clearFiltersBtn.click();

    // 8. Assert all inputs are reset to empty defaults simultaneously
    await expect(clearFiltersBtn).toBeHidden();
    expect(await searchInput.inputValue()).toBe('');
    expect(await categorySelect.inputValue()).toBe('');
    expect(await prioritySelect.inputValue()).toBe('');
    expect(await statusSelect.inputValue()).toBe('');
    expect(await departmentSelect.inputValue()).toBe('');

    // Wait for the reset API query to be triggered
    await page.waitForTimeout(500);

    // Verify the latest query in history reflects the completely cleared state
    const lastClearedQuery = queryHistory[queryHistory.length - 1];
    expect(lastClearedQuery.search).toBeUndefined();
    expect(lastClearedQuery.category).toBeUndefined();
    expect(lastClearedQuery.priority).toBeUndefined();
    expect(lastClearedQuery.status).toBeUndefined();
    expect(lastClearedQuery.department).toBeUndefined();
    expect(lastClearedQuery.page).toBe('1');
  });

});
