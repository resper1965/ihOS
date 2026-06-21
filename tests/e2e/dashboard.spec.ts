import { test, expect } from '@playwright/test';

test.describe('Dashboard UI Elements', () => {
  test('should load the dashboard and render all stats cards and widgets in en-US', async ({ page }) => {
    // 1. Mock Supabase Auth getUser request
    await page.route('**/auth/v1/user**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'test-user-uuid',
          email: 'test-user@ionic.health',
          role: 'authenticated',
        }),
      });
    });

    // 2. Mock profiles table GET request to return onboarding_completed: true (bypass wizard)
    await page.route('**/rest/v1/profiles?select=onboarding_completed**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ onboarding_completed: true }]),
      });
    });

    // 3. Mock dashboard statistics queries
    await page.route('**/rest/v1/compliance_assessments?select=framework_code**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ framework_code: 'iso27001' }]),
      });
    });

    await page.route('**/rest/v1/compliance_documents?select=id**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-range': '0-0/15' }, // Mock exact count of 15 documents
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/compliance_assessments?select=id**', async (route) => {
      await route.fulfill({
        status: 200,
        headers: { 'content-range': '0-0/8' }, // Mock exact count of 8 assessments
        contentType: 'application/json',
        body: JSON.stringify([]),
      });
    });

    await page.route('**/rest/v1/intelligence_snapshots?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            snapshot_type: 'scorecard',
            framework_code: 'all',
            snapshot_data: {
              score: 76,
              coverage: 88,
              missing: 5,
            },
          },
        ]),
      });
    });

    // 4. Mock agent notifications query
    await page.route('**/rest/v1/agent_notifications?**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 1,
            title: 'Critical Task Overdue',
            content: 'ISO 27001 Control A.8.12 implementation has exceeded the target date.',
            type: 'task_deadline',
            created_at: new Date(Date.now() - 600000).toISOString(), // 10 minutes ago
          },
        ]),
      });
    });

    // 5. Navigate to dashboard page
    await page.context().addCookies([
      {
        name: 'sb-mock-user',
        value: JSON.stringify({
          id: 'test-user-uuid',
          email: 'test-user@ionic.health',
          role: 'authenticated',
        }),
        domain: 'localhost',
        path: '/',
      },
    ]);
    await page.addInitScript(() => {
      window.localStorage.setItem('onboarding_completed', 'true');
    });
    await page.goto('/');

    // 6. Verify Dashboard title and subtitle (in en-US)
    await expect(page.locator('h1:has-text("Welcome to ihOS")')).toBeVisible();
    await expect(page.locator('text=Your consolidated view of compliance and governance.')).toBeVisible();

    // 7. Verify stats cards labels and values
    await expect(page.locator('text=Total Frameworks')).toBeVisible();
    await expect(page.getByRole('main').getByText('1', { exact: true })).toBeVisible(); // Frameworks set count from API fallback / scorecard

    await expect(page.locator('text=Analyzed Documents')).toBeVisible();
    await expect(page.getByText('15', { exact: true })).toBeVisible(); // Custom headers range mock value

    await expect(page.locator('text=Active Assessments')).toBeVisible();
    await expect(page.getByText('8', { exact: true })).toBeVisible(); // Custom headers range mock value

    await expect(page.locator('text=Compliance Score')).toBeVisible();
    await expect(page.getByText('76%', { exact: true })).toBeVisible(); // Custom snapshots scorecard value

    // 8. Verify Activity Feed widget is loaded
    await expect(page.locator('text=Recent Activity')).toBeVisible();
    await expect(page.locator('text=Critical Task Overdue')).toBeVisible();
  });
});
