import { describe, it, expect } from 'vitest';
import { classifyIntent, routeToAgent } from '@/lib/agents/intent-router';

describe('classifyIntent', () => {
  // -------------------------------------------------------------------------
  // Privacy profile routing
  // -------------------------------------------------------------------------
  describe('privacy keywords', () => {
    it('routes "privacy" keyword to privacy profile', () => {
      const result = classifyIntent('Tell me about our privacy posture');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords).toContain('privacy');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('routes LGPD keyword to privacy profile', () => {
      const result = classifyIntent('How do we comply with LGPD requirements?');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords).toContain('lgpd');
    });

    it('routes GDPR keyword to privacy profile', () => {
      const result = classifyIntent('What is our GDPR data transfer policy?');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords).toContain('gdpr');
      expect(result.matchedKeywords).toContain('data transfer');
    });

    it('routes DPIA keyword to privacy profile', () => {
      const result = classifyIntent('We need to perform a DPIA assessment');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords).toContain('dpia');
    });

    it('routes "data subject" to privacy profile', () => {
      const result = classifyIntent('A data subject requested access to their records');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords).toContain('data subject');
    });

    it('routes "consent" to privacy profile', () => {
      const result = classifyIntent('How should we handle consent management?');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords).toContain('consent');
    });
  });

  // -------------------------------------------------------------------------
  // SOC profile routing
  // -------------------------------------------------------------------------
  describe('SOC keywords', () => {
    it('routes "soc 2" keyword to soc profile', () => {
      const result = classifyIntent('What is our SOC 2 readiness?');
      expect(result.profileId).toBe('soc');
      expect(result.matchedKeywords).toContain('soc 2');
    });

    it('routes "soc2" keyword to soc profile', () => {
      const result = classifyIntent('Show me soc2 controls status');
      expect(result.profileId).toBe('soc');
      expect(result.matchedKeywords).toContain('soc2');
    });

    it('routes "incident" keyword to soc profile', () => {
      const result = classifyIntent('We have a security incident to triage');
      expect(result.profileId).toBe('soc');
      expect(result.matchedKeywords).toContain('incident');
      expect(result.matchedKeywords).toContain('triage');
    });

    it('routes "trust services" to soc profile', () => {
      const result = classifyIntent('Explain the trust services criteria for audit');
      expect(result.profileId).toBe('soc');
      expect(result.matchedKeywords).toContain('trust services');
      expect(result.matchedKeywords).toContain('audit');
    });

    it('routes SOC control IDs to soc profile', () => {
      const result = classifyIntent('What is the status of CC7 controls?');
      expect(result.profileId).toBe('soc');
      expect(result.matchedKeywords).toContain('cc7');
    });
  });

  // -------------------------------------------------------------------------
  // Executive profile routing
  // -------------------------------------------------------------------------
  describe('executive keywords', () => {
    it('routes "executive summary" to executive profile', () => {
      const result = classifyIntent('Give me an executive summary of risks');
      expect(result.profileId).toBe('executive');
      expect(result.matchedKeywords).toContain('executive');
      expect(result.matchedKeywords).toContain('summary');
    });

    it('routes "ROI" to executive profile', () => {
      const result = classifyIntent('What is the ROI of our compliance investment?');
      expect(result.profileId).toBe('executive');
      expect(result.matchedKeywords).toContain('roi');
      expect(result.matchedKeywords).toContain('investment');
    });

    it('routes "board report" to executive profile', () => {
      const result = classifyIntent('Prepare a board report on risk posture');
      expect(result.profileId).toBe('executive');
      expect(result.matchedKeywords).toContain('board report');
      expect(result.matchedKeywords).toContain('risk posture');
    });

    it('routes C-suite keywords to executive profile', () => {
      const result = classifyIntent('Prepare a CISO dashboard overview');
      expect(result.profileId).toBe('executive');
      expect(result.matchedKeywords).toContain('ciso');
      expect(result.matchedKeywords).toContain('dashboard');
      expect(result.matchedKeywords).toContain('overview');
    });
  });

  // -------------------------------------------------------------------------
  // Document profile routing
  // -------------------------------------------------------------------------
  describe('document keywords', () => {
    it('routes "document review" to document profile', () => {
      const result = classifyIntent('Can you do a document review of this policy?');
      expect(result.profileId).toBe('document');
      expect(result.matchedKeywords).toContain('document review');
    });

    it('routes "evidence" to document profile', () => {
      const result = classifyIntent('Upload evidence for the attestation');
      expect(result.profileId).toBe('document');
      expect(result.matchedKeywords).toContain('evidence');
      expect(result.matchedKeywords).toContain('upload');
      expect(result.matchedKeywords).toContain('attestation');
    });

    it('routes "gap analysis" to document profile', () => {
      const result = classifyIntent('Run a gap analysis on our document library');
      expect(result.profileId).toBe('document');
      expect(result.matchedKeywords).toContain('gap analysis');
      expect(result.matchedKeywords).toContain('document library');
    });
  });

  // -------------------------------------------------------------------------
  // Default / compliance fallback
  // -------------------------------------------------------------------------
  describe('default routing to compliance', () => {
    it('defaults to compliance for generic messages', () => {
      const result = classifyIntent('Hello, how can you help me?');
      expect(result.profileId).toBe('compliance');
      expect(result.matchedKeywords).toEqual([]);
      expect(result.confidence).toBe(0.5);
    });

    it('defaults to compliance for empty message', () => {
      const result = classifyIntent('');
      expect(result.profileId).toBe('compliance');
      expect(result.matchedKeywords).toEqual([]);
      expect(result.confidence).toBe(0.5);
    });

    it('defaults to compliance for unrelated topics', () => {
      const result = classifyIntent('What is the weather like today?');
      expect(result.profileId).toBe('compliance');
      expect(result.matchedKeywords).toEqual([]);
    });
  });

  // -------------------------------------------------------------------------
  // Mixed keyword prioritization
  // -------------------------------------------------------------------------
  describe('mixed keyword prioritization', () => {
    it('picks the profile with the most keyword matches', () => {
      // "privacy" + "lgpd" + "data protection" = 3 matches x weight 2 = 6
      // vs "audit" = 1 match x weight 2 = 2
      const result = classifyIntent('We need data protection for LGPD privacy compliance audit');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords.length).toBeGreaterThan(1);
    });

    it('picks SOC over document when SOC has more matches', () => {
      // SOC: "incident" + "triage" + "monitoring" + "containment" = 4 x 2 = 8
      // Document: "evidence" = 1 x 2 = 2
      const result = classifyIntent('Incident triage with monitoring and containment of evidence');
      expect(result.profileId).toBe('soc');
    });
  });

  // -------------------------------------------------------------------------
  // Case insensitivity
  // -------------------------------------------------------------------------
  describe('case insensitivity', () => {
    it('matches keywords regardless of case', () => {
      const result = classifyIntent('PRIVACY POLICY FOR LGPD COMPLIANCE');
      expect(result.profileId).toBe('privacy');
      expect(result.matchedKeywords).toContain('privacy');
      expect(result.matchedKeywords).toContain('lgpd');
    });

    it('handles mixed case input', () => {
      const result = classifyIntent('Our SoC 2 Type II Assessment');
      expect(result.profileId).toBe('soc');
      expect(result.matchedKeywords).toContain('soc 2');
      expect(result.matchedKeywords).toContain('type ii');
    });
  });

  // -------------------------------------------------------------------------
  // Confidence scoring
  // -------------------------------------------------------------------------
  describe('confidence scoring', () => {
    it('returns 0.5 confidence for default (no matches)', () => {
      const result = classifyIntent('Hello');
      expect(result.confidence).toBe(0.5);
    });

    it('returns confidence proportional to keyword matches', () => {
      const single = classifyIntent('privacy');
      const multiple = classifyIntent('privacy lgpd gdpr');
      expect(multiple.confidence).toBeGreaterThan(single.confidence);
    });

    it('caps confidence at 1.0', () => {
      const result = classifyIntent(
        'privacy lgpd gdpr ccpa dpia data protection data subject personal data consent data transfer'
      );
      expect(result.confidence).toBeLessThanOrEqual(1.0);
    });
  });

  // -------------------------------------------------------------------------
  // IntentClassification shape
  // -------------------------------------------------------------------------
  describe('return shape', () => {
    it('returns an object with profileId, confidence, and matchedKeywords', () => {
      const result = classifyIntent('Test message');
      expect(result).toHaveProperty('profileId');
      expect(result).toHaveProperty('confidence');
      expect(result).toHaveProperty('matchedKeywords');
      expect(typeof result.profileId).toBe('string');
      expect(typeof result.confidence).toBe('number');
      expect(Array.isArray(result.matchedKeywords)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// routeToAgent
// ---------------------------------------------------------------------------
describe('routeToAgent', () => {
  it('returns a profile and classification', () => {
    const result = routeToAgent('Show me LGPD status');
    expect(result).toHaveProperty('profile');
    expect(result).toHaveProperty('classification');
    expect(result.profile.id).toBe('privacy');
    expect(result.classification.profileId).toBe('privacy');
  });

  it('returns compliance profile for generic messages', () => {
    const result = routeToAgent('hello');
    expect(result.profile.id).toBe('compliance');
    expect(result.profile.name).toBe('Compliance Agent');
  });

  it('returns a profile with all required fields', () => {
    const result = routeToAgent('incident triage');
    expect(result.profile).toHaveProperty('id');
    expect(result.profile).toHaveProperty('name');
    expect(result.profile).toHaveProperty('description');
    expect(result.profile).toHaveProperty('systemPrompt');
    expect(result.profile).toHaveProperty('maxSteps');
  });
});
