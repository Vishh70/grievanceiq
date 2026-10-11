import { test, expect } from '@playwright/test';
import { mockCitizenUser } from './fixtures/mockData.js';

test.describe('Journey 1 — Citizen Complaint Submission', () => {

  test.beforeEach(async ({ page }) => {
    // Authenticate citizen in localStorage
    await page.addInitScript((user) => {
      window.localStorage.setItem('giq_token', 'mock-citizen-jwt-token');
      window.localStorage.setItem('giq_user', JSON.stringify(user));
      window.localStorage.setItem('pwa_prompt_dismissed_at', Date.now().toString());
    }, mockCitizenUser);
  });

  test('1.1 Enforces description validation on empty or whitespace submission', async ({ page }) => {
    await page.goto('/complaints/new');
    await expect(page.getByRole('heading', { name: /Submit a Complaint/i })).toBeVisible();

    const textarea = page.locator('textarea[name="text"]');
    await expect(textarea).toBeVisible();

    // Fill only whitespace to trigger the application's trim() validation check
    await textarea.fill('   ');

    const submitBtn = page.getByRole('button', { name: /Submit Complaint/i });
    await expect(submitBtn).toBeVisible();
    await submitBtn.click();

    // Verify error toast appears and submission does not proceed
    await expect(page.getByText('Please describe your complaint.')).toBeVisible();
  });

  test('1.2 Submits valid complaint, displays AI progress feedback, and handles successful completion', async ({ page }) => {
    let capturedPayload = null;

    // Mock POST /api/complaints
    await page.route('**/api/complaints', async (route) => {
      if (route.request().method() === 'POST') {
        capturedPayload = route.request().postData();
        return route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            message: 'Complaint submitted successfully',
            complaint: {
              id: 'cmp-test-submitted-101',
              _id: 'cmp-test-submitted-101',
              title: 'Damaged storm drain on Main Road...',
              status: 'Pending',
              processing_status: 'PENDING'
            }
          })
        });
      }
      return route.continue();
    });

    // Mock GET /api/complaints/:id/status polling
    await page.route('**/api/complaints/cmp-test-submitted-101/status', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          complaintId: 'cmp-test-submitted-101',
          status: 'PROCESSED'
        })
      });
    });

    // Mock GET /api/complaints for redirected list
    await page.route('**/api/complaints?**', async (route) => {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          complaints: [
            {
              _id: 'cmp-test-submitted-101',
              title: 'Damaged storm drain on Main Road...',
              text: 'Damaged storm drain on Main Road causing major water overflow during rainfall.',
              status: 'Pending',
              priority: 'High',
              category: 'Drainage',
              createdAt: new Date().toISOString()
            }
          ],
          total: 1,
          page: 1,
          pages: 1
        })
      });
    });

    await page.goto('/complaints/new');

    // Fill valid complaint text
    const textarea = page.locator('textarea[name="text"]');
    await textarea.fill('Damaged storm drain on Main Road causing major water overflow during rainfall.');

    // Fill address
    const addressInput = page.locator('textarea[name="address"]');
    await addressInput.fill('450 Main Road, Downtown Ward 4');

    // Submit complaint
    const submitBtn = page.getByRole('button', { name: /Submit Complaint/i });
    await submitBtn.click();

    // Verify submission payload occurred
    await page.waitForTimeout(500);
    expect(capturedPayload).not.toBeNull();

    // Verify success toast appears
    await expect(page.getByText(/Complaint submitted!/i)).toBeVisible();

    // Verify eventual redirection to /complaints after AI status poll completes
    await expect(page).toHaveURL(/\/complaints$/, { timeout: 15000 });
  });

  test('1.3 Handles server failure gracefully without false success message', async ({ page }) => {
    // Mock POST /api/complaints returning 500 error
    await page.route('**/api/complaints', async (route) => {
      if (route.request().method() === 'POST') {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Database service unavailable. Please try again later.' })
        });
      }
      return route.continue();
    });

    await page.goto('/complaints/new');

    const textarea = page.locator('textarea[name="text"]');
    await textarea.fill('Streetlight not functioning causing hazard at night.');

    const submitBtn = page.getByRole('button', { name: /Submit Complaint/i });
    await submitBtn.click();

    // Verify error toast is displayed and no redirect happens
    await expect(page.getByText('Database service unavailable. Please try again later.')).toBeVisible();
    await expect(page).toHaveURL(/\/complaints\/new$/);
  });

  test('1.4 Acquires camera stream, renders viewfinder, and stops media tracks cleanly upon cancellation', async ({ page }) => {
    // Inject mock MediaStream and MediaStreamTrack to verify stop() lifecycle deterministically
    await page.addInitScript(() => {
      window.__mockCameraStopped = false;
      const canvas = document.createElement('canvas');
      const mockStream = canvas.captureStream ? canvas.captureStream(25) : new MediaStream();
      const tracks = mockStream.getVideoTracks();
      if (tracks.length > 0) {
        const origStop = tracks[0].stop.bind(tracks[0]);
        tracks[0].stop = () => {
          window.__mockCameraStopped = true;
          origStop();
        };
      } else {
        const customTrack = {
          kind: 'video',
          stop: () => { window.__mockCameraStopped = true; }
        };
        mockStream.getTracks = () => [customTrack];
      }
      if (!navigator.mediaDevices) {
        navigator.mediaDevices = {};
      }
      navigator.mediaDevices.getUserMedia = async () => mockStream;
    });

    await page.goto('/complaints/new');

    // Click "Take Photo" button to start camera
    const takePhotoBtn = page.getByRole('button', { name: /Take Photo/i });
    await expect(takePhotoBtn).toBeVisible();
    await takePhotoBtn.click();

    // Verify video element and cancel camera button are rendered
    const cancelCameraBtn = page.getByTitle('Cancel Camera');
    await expect(cancelCameraBtn).toBeVisible();

    // Click "Cancel Camera" to trigger stopCamera() and stream track release
    await cancelCameraBtn.click();

    // Verify mock media track was stopped cleanly
    const stopped = await page.evaluate(() => window.__mockCameraStopped);
    expect(stopped).toBe(true);
    await expect(cancelCameraBtn).toBeHidden();
  });

});
