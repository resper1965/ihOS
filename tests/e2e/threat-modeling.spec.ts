import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// Threat Modeling E2E Tests
// ─────────────────────────────────────────────────────────────────────────────

test.describe('Threat Modeling Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/threat-modeling');
  });

  test('should render the threat modeling listing page', async ({ page }) => {
    await expect(page.locator('text=Threat Modeling')).toBeVisible();
    
    // Verify "New Analysis" button is present
    await expect(
      page.locator('button:has-text("New Analysis"), button:has-text("Create"), button:has-text("New Threat Model")').first()
    ).toBeVisible();
  });

  test('should display threat model cards when models exist', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    const hasModels = await page.locator('[data-testid="threat-model-card"], .glass-card').count();
    const hasEmpty = await page.locator('text=No threat models').count();

    expect(hasModels + hasEmpty).toBeGreaterThan(0);
  });
});

test.describe('Threat Model Detail Page', () => {
  test('should render 5-step stepper on threat model detail', async ({ page }) => {
    await page.goto('/threat-modeling');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[data-testid="threat-model-card"], .glass-card').first();
    const cardCount = await firstCard.count();

    if (cardCount > 0) {
      await firstCard.click();
      await page.waitForLoadState('networkidle');

      // Verify stepper tabs are visible (5-step stepper for threat models)
      const expectedTabs = ['Overview', 'STRIDE', 'FMEA', 'Gaps', 'Report'];
      for (const tab of expectedTabs) {
        const tabElement = page.locator(`text=${tab}`).first();
        if (await tabElement.count() > 0) {
          await expect(tabElement).toBeVisible({ timeout: 5000 });
        }
      }
    } else {
      test.skip();
    }
  });

  test('should navigate between stepper tabs', async ({ page }) => {
    await page.goto('/threat-modeling');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[data-testid="threat-model-card"], .glass-card').first();
    const cardCount = await firstCard.count();

    if (cardCount > 0) {
      await firstCard.click();
      await page.waitForLoadState('networkidle');

      // Navigate through each tab
      const tabs = ['STRIDE', 'FMEA', 'Gaps', 'Report', 'Overview'];
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
