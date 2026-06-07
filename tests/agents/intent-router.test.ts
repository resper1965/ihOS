// tests/agents/intent-router.test.ts
// Unit tests for the intent classification / routing logic

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the profiles module which is imported by intent-router
vi.mock('@/lib/agents/profiles', () => ({
  getProfile: vi.fn((id: string) => ({
    id,
    name: `${id} Agent`,
    description: `Mock ${id} profile`,
    systemPrompt: `You are the ${id} agent.`,
    maxSteps: 5,
  })),
  getAllProfiles: vi.fn(() => []),
  DEFAULT_PROFILE_ID: 'compliance',
  profiles: {},
}));

import { classifyIntent, routeToAgent } from '@/lib/agents/intent-router';

describe('classifyIntent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Test 1: Privacy keywords
  it('routes privacy keywords to "privacy" profile', () => {
    const result = classifyIntent('We need a DPIA for our LGPD compliance data protection program.');

    expect(result.profileId).toBe('privacy');
    expect(result.confidence).toBeGreaterThan(0);
    expect(result.matchedKeywords.length).toBeGreaterThan(0);
    // Should match keywords like 'dpia', 'lgpd', 'data protection'
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['lgpd']),
    );
  });

  // Test 2: SOC / compliance keywords
  it('routes SOC keywords to "soc" profile', () => {
    const result = classifyIntent('We need to prepare for our SOC 2 Type II audit and incident triage.');

    expect(result.profileId).toBe('soc');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['soc 2']),
    );
  });

  // Test 3: Executive keywords
  it('routes executive keywords to "executive" profile', () => {
    const result = classifyIntent('Can you generate an executive summary ROI analysis for the board?');

    expect(result.profileId).toBe('executive');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['executive']),
    );
  });

  // Test 4: Document keywords
  it('routes document keywords to "document" profile', () => {
    const result = classifyIntent('Please analyze this uploaded document for evidence quality and gap analysis.');

    expect(result.profileId).toBe('document');
    expect(result.matchedKeywords).toEqual(
      expect.arrayContaining(['document']),
    );
  });

  // Test 5: Unknown / general message → defaults to 'compliance'
  it('routes unknown / general message to default "compliance" profile', () => {
    const result = classifyIntent('Hello, how are you today?');

    expect(result.profileId).toBe('compliance');
    expect(result.confidence).toBe(0.5); // default confidence
    expect(result.matchedKeywords).toHaveLength(0);
  });

  // Additional edge cases
  it('handles empty string gracefully', () => {
    const result = classifyIntent('');
    expect(result.profileId).toBe('compliance');
    expect(result.confidence).toBe(0.5);
  });

  it('is case-insensitive', () => {
    const result = classifyIntent('We need GDPR PRIVACY assessment for data PROTECTION');
    expect(result.profileId).toBe('privacy');
  });
});

describe('routeToAgent', () => {
  it('returns both profile and classification', () => {
    const result = routeToAgent('Check our LGPD privacy compliance');

    expect(result.profile).toBeDefined();
    expect(result.profile.id).toBe('privacy');
    expect(result.classification).toBeDefined();
    expect(result.classification.profileId).toBe('privacy');
  });

  it('returns compliance profile for generic messages', () => {
    const result = routeToAgent('Tell me about best practices');

    expect(result.profile.id).toBe('compliance');
    expect(result.classification.confidence).toBe(0.5);
  });
});
