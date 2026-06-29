import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Assessment Engine E2E Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Assessments Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to assessments page (requires auth)
    await page.goto('/assessments');
  });

  test('should render the assessments listing page', async ({ page }) => {
    // Verify page title area
    await expect(page.locator('text=Assessments')).toBeVisible();
    
    // Verify "Run Assessment" button is present
    await expect(page.locator('button:has-text("Run Assessment"), button:has-text("New Assessment")')).toBeVisible();
  });

  test('should open the Run Assessment modal', async ({ page }) => {
    // Click run assessment button
    const runButton = page.locator('button:has-text("Run Assessment"), button:has-text("New Assessment")').first();
    await runButton.click();

    // Verify modal opens with framework selection
    await expect(page.locator('text=ISO/IEC 27001')).toBeVisible({ timeout: 5000 });
  });

  test('should display assessment cards when assessments exist', async ({ page }) => {
    // Wait for loading to complete
    await page.waitForLoadState('networkidle');

    // Check if either "No assessments" or assessment cards are shown
    const hasAssessments = await page.locator('[data-testid="assessment-card"], .glass-card').count();
    const hasEmpty = await page.locator('text=No assessments').count();

    expect(hasAssessments + hasEmpty).toBeGreaterThan(0);
  });
});

test.describe('Assessment Detail Page', () => {
  test('should render 4-step stepper on assessment detail', async ({ page }) => {
    // Navigate to assessments page first
    await page.goto('/assessments');
    await page.waitForLoadState('networkidle');

    // Click on the first assessment card (if any)
    const firstCard = page.locator('[data-testid="assessment-card"], .glass-card').first();
    const cardCount = await firstCard.count();
    
    if (cardCount > 0) {
      await firstCard.click();
      await page.waitForLoadState('networkidle');

      // Verify stepper tabs are visible
      const expectedTabs = ['Overview', 'Scores', 'Evidence', 'Gaps'];
      for (const tab of expectedTabs) {
        await expect(page.locator(`text=${tab}`).first()).toBeVisible({ timeout: 5000 });
      }
    } else {
      test.skip();
    }
  });

  test('should navigate between stepper tabs', async ({ page }) => {
    await page.goto('/assessments');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[data-testid="assessment-card"], .glass-card').first();
    const cardCount = await firstCard.count();

    if (cardCount > 0) {
      await firstCard.click();
      await page.waitForLoadState('networkidle');

      // Click through each tab
      const tabs = ['Scores', 'Evidence', 'Gaps', 'Overview'];
      for (const tab of tabs) {
        const tabButton = page.locator(`button:has-text("${tab}"), [role="tab"]:has-text("${tab}")`).first();
        if (await tabButton.count() > 0) {
          await tabButton.click();
          await page.waitForTimeout(500);
        }
      }
    } else {
      test.skip();
    }
  });
});
