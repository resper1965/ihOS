import { test, expect } from '@playwright/test';

test.describe('Onboarding Wizard Flow', () => {
  test('should display the onboarding wizard to new users and complete it successfully', async ({ page }) => {
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

    // 2. Mock profiles table GET request to return onboarding_completed: false
    let onboardingCompleted = false;
    await page.route('**/rest/v1/profiles?select=onboarding_completed**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(
          onboardingCompleted ? [{ onboarding_completed: true }] : [{ onboarding_completed: false }]
        ),
      });
    });

    // 3. Mock profiles table SELECT ID (called in markComplete check)
    await page.route('**/rest/v1/profiles?select=id&id=eq.**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([{ id: 'test-user-uuid' }]),
      });
    });

    // 4. Intercept profile update PATCH request
    let patchTriggered = false;
    await page.route('**/rest/v1/profiles?id=eq.**', async (route) => {
      if (route.request().method() === 'PATCH') {
        const payload = route.request().postDataJSON();
        if (payload && payload.onboarding_completed === true) {
          patchTriggered = true;
          onboardingCompleted = true;
        }
        await route.fulfill({ status: 204 });
      } else {
        await route.continue();
      }
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
      window.localStorage.clear();
    });
    await page.goto('/');

    // 6. Verify that the onboarding wizard is visible
    const wizardModal = page.locator('h2:has-text("Welcome to ihOS")');
    await expect(wizardModal).toBeVisible();

    // 7. Step through the wizard
    // Step 0 -> Step 1
    const nextBtn = page.locator('button:has-text("Next")');
    await nextBtn.click();
    await expect(page.locator('text=Choose Your Frameworks')).toBeVisible();

    // Step 1 -> Step 2
    await nextBtn.click();
    await expect(page.locator('text=Upload Your Documents')).toBeVisible();

    // Step 2 -> Step 3
    await nextBtn.click();
    await expect(page.locator('text=Create Your First Assessment')).toBeVisible();

    // Step 3 -> Step 4
    await nextBtn.click();
    await expect(page.locator('text=Chat with the AI Assistant')).toBeVisible();

    // 8. Click Finish
    const finishBtn = page.locator('button:has-text("Finish")');
    await finishBtn.click();

    // 9. Verify that onboarding was completed and the modal is dismissed
    const isCompleted = await page.evaluate(() => window.localStorage.getItem("onboarding_completed"));
    expect(isCompleted).toBe("true");
    await expect(wizardModal).not.toBeVisible();
  });
});
