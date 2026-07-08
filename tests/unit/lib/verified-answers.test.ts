// tests/unit/lib/verified-answers.test.ts
// F5 safeguards (specs/003 Onda 4 — T503/T504):
//  - the promotion path NEVER writes to document_chunks (anti-echo-chamber:
//    document RAG / layer 2 must never retrieve previous answers / layer 3)
//  - unscoped promotions are parked as needs_review, never served
//  - stale suggestions are demoted to phrasing references

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST as promoteQa } from '@/app/api/chat/promote-qa/route';
import { buildVerifiedAnswerBlock, type VerifiedAnswerSuggestion } from '@/lib/chat/verified-answers';
import { mockSupabaseServer, mockSupabaseAdmin } from '../../setup';

interface PromotionResponse {
  success: boolean;
  data: { answersInserted: number; correctionsWritten: number; parkedForTriage: number };
}

function promotionRequest(body: Record<string, unknown>) {
  return new Request('http://localhost/api/chat/promote-qa', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

async function readJson(res: unknown): Promise<PromotionResponse> {
  return (res as { json: () => Promise<PromotionResponse> }).json();
}

const ITEMS = [
  {
    questionId: 'q-0',
    questionText: 'Is data encrypted at rest?',
    finalAnswer: 'Yes, AES-256 per the Cryptography Policy.',
    aiDraftAnswer: 'Yes, AES-256.',
    wasEdited: false,
  },
];

describe('promote-qa (T502/T504 anti-echo regression)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // admin.from('verified_answers').insert(...) resolves ok
    mockSupabaseAdmin.insert.mockResolvedValue({ data: null, error: null });
    // corpus fingerprint query path (compliance_documents select)
    mockSupabaseAdmin.select.mockReturnThis();
    mockSupabaseAdmin.eq.mockResolvedValue({ data: [], error: null });
  });

  it('writes to verified_answers and NEVER to document_chunks', async () => {
    const res = await promoteQa(
      promotionRequest({ items: ITEMS, salesChannel: 'B2B_GEHC' }),
    );
    const json = await readJson(res);

    expect(json.success).toBe(true);
    expect(json.data.answersInserted).toBe(1);
    expect(json.data.parkedForTriage).toBe(0);

    const adminTables = mockSupabaseAdmin.from.mock.calls.map((c: unknown[]) => c[0]);
    const serverTables = mockSupabaseServer.from.mock.calls.map((c: unknown[]) => c[0]);

    expect(adminTables).toContain('verified_answers');
    // Layer 2 store must never be touched by the promotion path.
    expect(adminTables).not.toContain('document_chunks');
    expect(serverTables).not.toContain('document_chunks');
  });

  it('parks channel-less promotions as needs_review (never served)', async () => {
    const res = await promoteQa(promotionRequest({ items: ITEMS }));
    const json = await readJson(res);

    expect(json.success).toBe(true);
    expect(json.data.parkedForTriage).toBe(1);

    const insertedRow = mockSupabaseAdmin.insert.mock.calls
      .map((c: unknown[]) => c[0] as Record<string, unknown>)
      .find((row: Record<string, unknown>) => row && 'final_answer' in row);
    expect(insertedRow?.status).toBe('needs_review');
    expect(insertedRow?.sales_channel).toBeNull();
  });

  it('rejects an invalid sales channel', async () => {
    const res = await promoteQa(
      promotionRequest({ items: ITEMS, salesChannel: 'ALL' }),
    );
    expect((res as unknown as { status: number }).status).toBe(400);
  });
});

describe('buildVerifiedAnswerBlock (T503 staleness)', () => {
  function suggestion(overrides: Partial<VerifiedAnswerSuggestion> = {}): VerifiedAnswerSuggestion {
    return {
      id: 'va-1',
      questionText: 'Is data encrypted at rest?',
      finalAnswer: 'Yes, AES-256.',
      similarity: 0.91,
      stale: false,
      mappedControls: [],
      createdAt: '2026-07-01T00:00:00Z',
      ...overrides,
    };
  }

  it('returns an empty string with no suggestions', () => {
    expect(buildVerifiedAnswerBlock([])).toBe('');
  });

  it('frames suggestions as phrasing references, never evidence', () => {
    const block = buildVerifiedAnswerBlock([suggestion()]);
    expect(block).toContain('phrasing reference only');
    expect(block).toContain('NEVER evidence');
    expect(block).toContain('AES-256');
    expect(block).not.toContain('POSSIBLY STALE');
  });

  it('marks stale suggestions explicitly', () => {
    const block = buildVerifiedAnswerBlock([suggestion({ stale: true })]);
    expect(block).toContain('POSSIBLY STALE');
    expect(block).toContain('corpus changed');
  });
});
