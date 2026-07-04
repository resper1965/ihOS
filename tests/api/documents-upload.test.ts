// tests/api/documents-upload.test.ts
// Integration tests for document upload, validation, and pgvector indexing pipeline.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer, mockSupabaseAdmin } from '../setup';
import { verifyClarity } from '@/lib/chat/clarity-gate';
import { chunkDocument } from '@/lib/chat/chunker';
import { generateEmbeddings } from '@/lib/chat/embeddings';

// Mock the dependencies
vi.mock('@/lib/chat/clarity-gate', () => ({
  verifyClarity: vi.fn(),
}));

vi.mock('@/lib/chat/chunker', () => ({
  chunkDocument: vi.fn().mockReturnValue([
    { content: 'Chunk 1 content', index: 0, metadata: {} },
  ]),
}));

vi.mock('@/lib/chat/embeddings', () => ({
  generateEmbeddings: vi.fn().mockResolvedValue([[0.1, 0.2, 0.3]]),
}));

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });

  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.insert.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.update.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  
  mockSupabaseServer.single.mockResolvedValue({
    data: { id: 100 }, // Mock document ID
    error: null,
  });

  // The route performs storage upload + the document/chunks inserts through the
  // admin client (createAdminClient), so it must be configured too — otherwise
  // the document insert resolves to { data: null } and the route 500s.
  mockSupabaseAdmin.from.mockReturnThis();
  mockSupabaseAdmin.insert.mockReturnThis();
  mockSupabaseAdmin.select.mockReturnThis();
  mockSupabaseAdmin.update.mockReturnThis();
  mockSupabaseAdmin.eq.mockReturnThis();
  mockSupabaseAdmin.single.mockResolvedValue({
    data: { id: 100 },
    error: null,
  });
}

describe('Document Upload and Ingestion API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/documents/upload/route');

    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const req = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      body: new FormData(),
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Authentication required.');
  });

  it('returns 400 when file field is missing', async () => {
    const { POST } = await import('@/app/api/documents/upload/route');

    const formData = new FormData();
    formData.append('category', 'ISMS_CORE');

    const req = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('A "file" field is required.');
  });

  it('calls Clarity Gate check and returns 422 if UNCLEAR and forceIndex is false', async () => {
    const { POST } = await import('@/app/api/documents/upload/route');

    // Mock Clarity Gate failure
    (verifyClarity as any).mockResolvedValue({
      clarityStatus: 'UNCLEAR',
      hitlStatus: 'PENDING',
      hitlPendingCount: 1,
      pointsPassed: [1, 2],
      issues: [{ code: 'POINT-3', severity: 'CRITICAL', message: 'Implicit assumptions found.', fix: 'Explain assumptions.', location: 'Intro' }],
    });

    const file = new File(['Unproven security claims will be achieved in 2027.'], 'policy.txt', { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'ISMS_CORE');

    const req = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(422);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Document fails Clarity Gate quality check.');
    expect(body.clarityReport.clarityStatus).toBe('UNCLEAR');
    expect(verifyClarity).toHaveBeenCalledWith('Unproven security claims will be achieved in 2027.');
    expect(chunkDocument).not.toHaveBeenCalled(); // Blocked ingestion
  });

  it('bypasses Clarity Gate check and indexes successfully if forceIndex is true', async () => {
    const { POST } = await import('@/app/api/documents/upload/route');

    const file = new File(['Unproven security claims will be achieved in 2027.'], 'policy.txt', { type: 'text/plain' });
    const formData = new FormData();
    formData.append('file', file);
    formData.append('category', 'ISMS_CORE');
    formData.append('forceIndex', 'true');

    const req = new Request('http://localhost/api/documents/upload', {
      method: 'POST',
      body: formData,
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.documentId).toBe(100);
    expect(body.data.chunkCount).toBe(1);
    expect(verifyClarity).not.toHaveBeenCalled(); // Bypassed
    expect(chunkDocument).toHaveBeenCalled(); // Executed chunking
    expect(generateEmbeddings).toHaveBeenCalled(); // Executed embeddings
  });
});
