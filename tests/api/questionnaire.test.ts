// tests/api/questionnaire.test.ts
// Tests for the questionnaire pipeline API route handlers
// Each route exports a POST(req: Request) function that we call directly.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer } from '../setup';

// ---------------------------------------------------------------------------
// XLSX mock (needed by download-filled route)
// ---------------------------------------------------------------------------

vi.mock('xlsx', () => ({
  read: vi.fn(() => ({
    SheetNames: ['Sheet1'],
    Sheets: { Sheet1: { '!ref': 'A1:C10' } },
  })),
  utils: {
    sheet_to_json: vi.fn(() => []),
    encode_cell: vi.fn(({ r, c }: { r: number; c: number }) =>
      `${String.fromCharCode(65 + c)}${r + 1}`),
    decode_cell: vi.fn((ref: string) => ({
      r: parseInt(ref.slice(1)) - 1,
      c: ref.charCodeAt(0) - 65,
    })),
    decode_range: vi.fn(() => ({ s: { r: 0, c: 0 }, e: { r: 10, c: 5 } })),
    encode_range: vi.fn(() => 'A1:F11'),
  },
  write: vi.fn(() => Buffer.from('mock-xlsx-binary')),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetMocks() {
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.insert.mockReturnThis();
  mockSupabaseServer.update.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.not.mockReturnThis();
  mockSupabaseServer.order.mockReturnThis();
  mockSupabaseServer.limit.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: null, error: null });
  mockSupabaseServer.rpc.mockResolvedValue({ data: [], error: null });
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });
}

// ---------------------------------------------------------------------------
// parse-questionnaire route
// ---------------------------------------------------------------------------

describe('POST /api/chat/parse-questionnaire', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 400 when no file is provided in form data', async () => {
    const { POST } = await import(
      '@/app/api/chat/parse-questionnaire/route'
    );

    const formData = new FormData();
    const req = new Request('http://localhost/api/chat/parse-questionnaire', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toContain('file');
  });

  it('returns ParseResult for a valid XLSX file', async () => {
    // Re-mock xlsx for this test — need to set up read + sheet_to_json
    const xlsxModule = await import('xlsx');
    (xlsxModule.read as any).mockReturnValue({
      SheetNames: ['Sheet1'],
      Sheets: { Sheet1: { '!ref': 'A1:B3' } },
    });
    (xlsxModule.utils.sheet_to_json as any).mockReturnValue([
      ['Question', 'Answer'],
      ['What is MFA?', ''],
    ]);

    const { POST } = await import(
      '@/app/api/chat/parse-questionnaire/route'
    );

    const file = new File([Buffer.from('fake-xlsx-data')], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    });
    const formData = new FormData();
    formData.set('file', file);

    const req = new Request('http://localhost/api/chat/parse-questionnaire', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toBeDefined();
    expect(body.data.fileType).toBe('xlsx');
  });
});

// ---------------------------------------------------------------------------
// generate-answers route
// ---------------------------------------------------------------------------

describe('POST /api/chat/generate-answers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 400 for empty questions array', async () => {
    const { POST } = await import(
      '@/app/api/chat/generate-answers/route'
    );

    const req = new Request('http://localhost/api/chat/generate-answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions: [] }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
  });

  it('returns generated answers for valid questions', async () => {
    const { POST } = await import(
      '@/app/api/chat/generate-answers/route'
    );

    const questions = [
      { questionId: 'q-0', text: 'What is your backup policy?' },
      { questionId: 'q-1', text: 'How do you manage access control?' },
    ];

    const req = new Request('http://localhost/api/chat/generate-answers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ questions }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(2);
    expect(body.data[0].questionId).toBe('q-0');
    expect(body.data[0].generatedAnswer).toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// promote-qa route
// ---------------------------------------------------------------------------

describe('POST /api/chat/promote-qa', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    // Mock auth.getUser to return no user
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: null,
    });

    const { POST } = await import(
      '@/app/api/chat/promote-qa/route'
    );

    const req = new Request('http://localhost/api/chat/promote-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            questionId: 'q-0',
            questionText: 'Test?',
            finalAnswer: 'Yes',
            aiDraftAnswer: 'Yes',
            wasEdited: false,
          },
        ],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
  });

  it('inserts into document_chunks for valid items', async () => {
    // insert chain: from().insert() should resolve (no error)
    mockSupabaseServer.insert.mockResolvedValue({ data: null, error: null });

    const { POST } = await import(
      '@/app/api/chat/promote-qa/route'
    );

    const req = new Request('http://localhost/api/chat/promote-qa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: [
          {
            questionId: 'q-0',
            questionText: 'What is MFA?',
            finalAnswer: 'Multi-factor authentication.',
            aiDraftAnswer: 'Multi-factor authentication.',
            wasEdited: false,
          },
        ],
      }),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.chunksInserted).toBeGreaterThanOrEqual(0);
  });
});

// ---------------------------------------------------------------------------
// download-filled route
// ---------------------------------------------------------------------------

describe('POST /api/chat/download-filled', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns xlsx binary response for valid payload', async () => {
    const { POST } = await import(
      '@/app/api/chat/download-filled/route'
    );

    const payload = {
      originalFileBase64: Buffer.from('fake-xlsx').toString('base64'),
      fileName: 'questionnaire.xlsx',
      answers: [
        {
          cellCoords: 'C2',
          sheetName: 'Sheet1',
          answer: 'This is the answer.',
        },
      ],
    };

    const req = new Request('http://localhost/api/chat/download-filled', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(res.headers.get('Content-Disposition')).toContain('_filled.xlsx');
  });
});
