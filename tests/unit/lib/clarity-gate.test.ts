// tests/unit/lib/clarity-gate.test.ts
// Unit tests for the Clarity Gate analyzer service (src/lib/chat/clarity-gate.ts)

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { verifyClarity } from '@/lib/chat/clarity-gate';
import { generateObject } from 'ai';

// Mock the 'ai' module
vi.mock('ai', () => ({
  generateObject: vi.fn(),
}));

describe('verifyClarity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns UNCLEAR immediately for empty or blank text without calling LLM', async () => {
    const emptyResult = await verifyClarity('');
    expect(emptyResult.clarityStatus).toBe('UNCLEAR');
    expect(emptyResult.issues).toHaveLength(1);
    expect(emptyResult.issues[0].code).toBe('E-SC06');
    expect(generateObject).not.toHaveBeenCalled();

    const blankResult = await verifyClarity('   \n  ');
    expect(blankResult.clarityStatus).toBe('UNCLEAR');
    expect(generateObject).not.toHaveBeenCalled();
  });

  it('returns structured result from LLM when generateObject succeeds', async () => {
    const mockReport = {
      clarityStatus: 'CLEAR',
      hitlStatus: 'PENDING',
      hitlPendingCount: 2,
      pointsPassed: [1, 2, 3, 4, 5, 6, 7, 8],
      issues: [
        {
          code: 'POINT-9',
          severity: 'VERIFIABLE',
          message: 'The document mentions a specific price of $50/mo.',
          fix: 'Add a source or citation for the pricing.',
          location: 'Pricing section',
        },
      ],
    };

    (generateObject as any).mockResolvedValue({
      object: mockReport,
    });

    const result = await verifyClarity('This is a document about pricing that states costs are $50/mo.');

    expect(generateObject).toHaveBeenCalled();
    expect(result.clarityStatus).toBe('CLEAR');
    expect(result.hitlStatus).toBe('PENDING');
    expect(result.hitlPendingCount).toBe(2);
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('POINT-9');
  });

  it('falls back gracefully to CLEAR status with warning when generateObject fails', async () => {
    (generateObject as any).mockRejectedValue(new Error('OpenAI API Timeout'));

    const result = await verifyClarity('Some document content to analyze.');

    expect(generateObject).toHaveBeenCalled();
    expect(result.clarityStatus).toBe('CLEAR'); // Safe default fallback
    expect(result.hitlStatus).toBe('REVIEWED_WITH_EXCEPTIONS');
    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].code).toBe('W-HC01');
    expect(result.issues[0].severity).toBe('WARNING');
    expect(result.issues[0].message).toContain('OpenAI API Timeout');
  });
});
