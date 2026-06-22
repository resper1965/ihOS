// src/lib/chat/clarity-gate.ts
// Core Clarity Gate analyzer service using Vercel AI SDK and OpenAI.

import { generateObject } from 'ai';
import { getOpenAI } from '@/lib/chat/openai';

import { z } from 'zod';
import fs from 'fs';
import path from 'path';

// Define Zod schema for structured output validation
export const ClarityIssueSchema = z.object({
  code: z.string().describe('Validation code (e.g. POINT-1, POINT-2, W-HC02, E-ST10)'),
  severity: z.enum(['CRITICAL', 'WARNING', 'TEMPORAL', 'VERIFIABLE']).describe('Severity level'),
  message: z.string().describe('Detailed description of the issue found'),
  fix: z.string().describe('Proposed correction or how to address the issue'),
  location: z.string().describe('Approximate location or context in the document where the issue occurs'),
});

export const ClarityGateResultSchema = z.object({
  clarityStatus: z.enum(['CLEAR', 'UNCLEAR']).describe('Overall clarity status of the document'),
  hitlStatus: z.enum(['PENDING', 'REVIEWED', 'REVIEWED_WITH_EXCEPTIONS']).describe('Human-In-The-Loop review status'),
  hitlPendingCount: z.number().nonnegative().describe('Number of claims that require human confirmation'),
  pointsPassed: z.array(z.number()).describe('List of the 9 Verification Points that fully passed (e.g., [1, 2, 3])'),
  issues: z.array(ClarityIssueSchema).describe('List of issues detected'),
});

export type ClarityIssue = z.infer<typeof ClarityIssueSchema>;
export type ClarityGateResult = z.infer<typeof ClarityGateResultSchema>;

let cachedPrompt: string | null = null;

const DEFAULT_SYSTEM_PROMPT = `You are a Clarity Gate Expert Auditor (v2.1).
Your mission is to perform an epistemic quality analysis on the provided document.
You must evaluate the text based on 9 fundamental Verification Points to prevent RAG language model hallucinations:

1. HYPOTHESIS vs FACT LABELING: Unproven hypothetical statements described as absolute facts without sources or markers.
2. UNCERTAINTY MARKER ENFORCEMENT: Future projections or estimates without qualifiers (e.g., using "will have" instead of "is expected to", "projected to").
3. ASSUMPTION VISIBILITY: Implicit assumptions affecting safety/operation that are not openly stated.
4. AUTHORITATIVE UNVALIDATED DATA: Tables or data with precise metrics (e.g., 100%, 89%) without clear sources.
5. DATA CONSISTENCY: Direct contradictions of values, dates, or facts within the same document.
6. IMPLICIT CAUSATION: Cause-and-effect relationships suggested without associated scientific or empirical validation.
7. FUTURE STATE AS PRESENT: Future plans or roadmaps described in the present tense as if they are already operational.
8. TEMPORAL COHERENCE: Chronological inconsistencies of dates or obsolete temporal terms (e.g., "today", "currently" referring to old dates).
9. EXTERNALLY VERIFIABLE CLAIMS: Specific prices, exact statistics, or competitor claims that require manual verification.

Status Rules:
- If there is ANY critical issue (such as tensing future states as present in an authoritative manner, severe data/date inconsistencies, or unproven safety claims), set clarityStatus to 'UNCLEAR' and hitlStatus to 'PENDING'.
- If there are only warnings (WARNING) or verifiable claims (VERIFIABLE), set clarityStatus to 'CLEAR' but hitlStatus to 'PENDING' (as it requires human confirmation of the content).
- hitlPendingCount must be the number of pending items and claims that require human confirmation (severities CRITICAL, WARNING, or VERIFIABLE).`;

function getSystemPrompt(): string {
  if (cachedPrompt) return cachedPrompt;
  try {
    const promptPath = path.join(process.cwd(), 'prompts', 'clarity_gate_v2_1.txt');
    cachedPrompt = fs.readFileSync(promptPath, 'utf8');
    return cachedPrompt;
  } catch (err) {
    console.error('[Clarity Gate] Failed to read prompt file, using default fallback:', err);
    return DEFAULT_SYSTEM_PROMPT;
  }
}

/**
 * Analyzes the given document text against the 9 Clarity Gate points.
 */
export async function verifyClarity(text: string): Promise<ClarityGateResult> {
  if (!text || !text.trim()) {
    return {
      clarityStatus: 'UNCLEAR',
      hitlStatus: 'PENDING',
      hitlPendingCount: 0,
      pointsPassed: [],
      issues: [
        {
          code: 'E-SC06',
          severity: 'CRITICAL',
          message: 'The document is empty or contains no readable text.',
          fix: 'Please upload a document with valid text content.',
          location: 'Entire document',
        },
      ],
    };
  }

  try {
    const openai = await getOpenAI();
    const response = await generateObject({
      model: openai('gpt-4o-mini'),
      schema: ClarityGateResultSchema,
      system: getSystemPrompt(),
      prompt: `Analyze the following corporate document text:\n\n${text.slice(0, 50000)}`, // limit text size for token boundaries
    });


    return response.object;
  } catch (err) {
    console.error('[Clarity Gate] Analysis failed:', err);
    // SAFE fallback: mark as UNCLEAR and require human review
    return {
      clarityStatus: 'UNCLEAR',
      hitlStatus: 'PENDING',
      hitlPendingCount: 1,
      pointsPassed: [],
      issues: [
        {
          code: 'E-SYS01',
          severity: 'CRITICAL',
          message: `Automatic Clarity Gate analysis failed: ${err instanceof Error ? err.message : String(err)}. The document could not be verified automatically.`,
          fix: 'This document requires manual epistemic quality review before it can be trusted in the knowledge base.',
          location: 'System Service',
        },
      ],
    };
  }
}
