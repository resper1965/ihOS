// src/lib/agents/intent-router.ts
// Keyword/pattern-based intent classifier for fast agent routing

import type { AgentProfileId, IntentClassification } from './types';
import { getProfile, DEFAULT_PROFILE_ID } from './profiles';
import type { AgentProfile } from './types';

// ---------------------------------------------------------------------------
// Keyword Rules
// ---------------------------------------------------------------------------

interface KeywordRule {
  profileId: AgentProfileId;
  /** Keywords that trigger this profile (all lowercased) */
  keywords: string[];
  /** Higher weight = stronger signal for this profile */
  weight: number;
}

const KEYWORD_RULES: KeywordRule[] = [
  {
    profileId: 'privacy',
    keywords: [
      'privacy', 'lgpd', 'gdpr', 'ccpa', 'ropa', 'dpia',
      'data protection', 'data subject', 'personal data',
      'processing activities', 'consent', 'data transfer',
      'dpo', 'data privacy', 'right to erasure', 'right to access',
      'cross-border', 'adequacy', 'anpd', 'proteção de dados',
    ],
    weight: 2,
  },
  {
    profileId: 'soc',
    keywords: [
      'soc 2', 'soc2', 'soc-2', 'type ii', 'type 2',
      'incident', 'triage', 'monitoring', 'audit',
      'trust services', 'trust criteria',
      'security operations', 'detection', 'containment',
      'evidence collection', 'cc6', 'cc7', 'cc8',
      'availability criteria', 'processing integrity',
    ],
    weight: 2,
  },
  {
    profileId: 'executive',
    keywords: [
      'executive', 'summary', 'roi', 'board', 'ceo', 'ciso', 'cto',
      'c-suite', 'business impact', 'strategic', 'investment',
      'dashboard', 'risk posture', 'overview', 'high-level',
      'budget', 'stakeholder', 'board report', 'quarterly',
    ],
    weight: 2,
  },
  {
    profileId: 'document',
    keywords: [
      'document', 'evidence', 'upload', 'analyze', 'file',
      'policy document', 'procedure', 'attestation',
      'gap analysis', 'document review', 'evidence quality',
      'template', 'document library', 'expired', 'renewal',
    ],
    weight: 2,
  },
];

// ---------------------------------------------------------------------------
// Classification Logic
// ---------------------------------------------------------------------------

/**
 * Classify a user message into an agent profile using keyword matching.
 *
 * Algorithm:
 * 1. Normalize the message to lowercase.
 * 2. For each keyword rule, count how many keywords appear in the message.
 * 3. Multiply match count by the rule's weight to get a score.
 * 4. The highest-scoring profile wins; ties go to the first match.
 * 5. If no keywords match, default to Compliance agent.
 */
export function classifyIntent(message: string = ""): IntentClassification {
  const normalized = (message || "").toLowerCase();

  let bestProfileId: AgentProfileId = DEFAULT_PROFILE_ID;
  let bestScore = 0;
  let bestMatches: string[] = [];

  for (const rule of KEYWORD_RULES) {
    const matched: string[] = [];

    for (const keyword of rule.keywords) {
      if (normalized.includes(keyword)) {
        matched.push(keyword);
      }
    }

    const score = matched.length * rule.weight;

    if (score > bestScore) {
      bestScore = score;
      bestProfileId = rule.profileId;
      bestMatches = matched;
    }
  }

  // Confidence: normalize score against a reasonable max (6 keywords = 1.0)
  const maxExpectedScore = 12; // 6 keywords × weight 2
  const confidence = bestScore > 0
    ? Math.min(bestScore / maxExpectedScore, 1.0)
    : 0.5; // Default profile gets 0.5 confidence

  return {
    profileId: bestProfileId,
    confidence,
    matchedKeywords: bestMatches,
  };
}

/**
 * Convenience function: classify intent and return the full AgentProfile.
 */
export function routeToAgent(message: string = ""): {
  profile: AgentProfile;
  classification: IntentClassification;
} {
  const classification = classifyIntent(message);
  const profile = getProfile(classification.profileId);

  return { profile, classification };
}
