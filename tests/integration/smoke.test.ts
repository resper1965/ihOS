// tests/integration/smoke.test.ts
// Lightweight smoke tests — verify module imports don't crash
// and that expected exports are present.

import { describe, it, expect } from 'vitest';

describe('Smoke Tests: Module Imports', () => {
  // Test 1: @/lib/chat/parser — no crash
  it('imports @/lib/chat/parser without errors', async () => {
    const parser = await import('@/lib/chat/parser');

    expect(parser).toBeDefined();
    expect(typeof parser.parseExcel).toBe('function');
    expect(typeof parser.parsePDF).toBe('function');
    expect(typeof parser.parseQuestionnaire).toBe('function');
  });

  // Test 2: @/lib/agents/tools/index — exports agentTools map
  it('imports @/lib/agents/tools/index and exports agentTools map', async () => {
    const tools = await import('@/lib/agents/tools/index');

    expect(tools).toBeDefined();
    expect(tools.agentTools).toBeDefined();
    expect(typeof tools.agentTools).toBe('object');

    // Verify some specific tool names
    const toolNames = Object.keys(tools.agentTools);
    expect(toolNames).toContain('complianceScore');
    expect(toolNames).toContain('searchDocuments');
    expect(toolNames).toContain('createGoal');
    expect(toolNames.length).toBeGreaterThanOrEqual(10);
  });

  // Test 3: @/lib/agents/intent-router — exports routeToAgent / classifyIntent
  it('imports @/lib/agents/intent-router and exports routing functions', async () => {
    const router = await import('@/lib/agents/intent-router');

    expect(router).toBeDefined();
    expect(typeof router.classifyIntent).toBe('function');
    expect(typeof router.routeToAgent).toBe('function');
  });

  // Test 4: @/lib/agents/profiles — exports agentProfiles / getProfile
  it('imports @/lib/agents/profiles and exports profile functions', async () => {
    const profiles = await import('@/lib/agents/profiles');

    expect(profiles).toBeDefined();
    expect(typeof profiles.getProfile).toBe('function');
    expect(typeof profiles.getAllProfiles).toBe('function');
    expect(profiles.DEFAULT_PROFILE_ID).toBeDefined();
    expect(profiles.profiles).toBeDefined();
  });

  // Test 5: @/lib/chat/questionnaire-types — exports type interfaces
  it('imports @/lib/chat/questionnaire-types without errors', async () => {
    const types = await import('@/lib/chat/questionnaire-types');

    // This module only has type exports — the import itself is the test.
    // TypeScript types are erased at runtime, so we just verify the module loaded.
    expect(types).toBeDefined();
  });

  // Test 6: @/lib/standard-api/client — exports standardApi functions
  it('imports @/lib/standard-api/client and exports API functions', async () => {
    const client = await import('@/lib/standard-api/client');

    expect(client).toBeDefined();
    expect(typeof client.complianceScore).toBe('function');
    expect(typeof client.crossCoverage).toBe('function');
    expect(typeof client.blastRadius).toBe('function');
    expect(typeof client.roiPath).toBe('function');
    expect(typeof client.evaluateEvidence).toBe('function');
    expect(typeof client.translateRisk).toBe('function');
    expect(typeof client.triageIncident).toBe('function');
    expect(typeof client.scanVendorContract).toBe('function');
    expect(typeof client.council).toBe('function');
  });
});
