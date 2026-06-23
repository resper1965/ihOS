// tests/api/documents-reindex.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer, mockSupabaseAdmin } from '../setup';
import { extractText } from '@/lib/chat/document-extractor';
import { chunkDocument } from '@/lib/chat/chunker';
import { generateEmbeddings } from '@/lib/chat/embeddings';
import { extractDeltasFromDocument } from '@/lib/assessment/delta-extractor';
import { triggerGrcRecalibration } from '@/lib/assessment/grc-trigger';

vi.mock('@/lib/chat/document-extractor', () => ({
  extractText: vi.fn(),
  resolveFileType: vi.fn().mockReturnValue('txt'),
}));

vi.mock('@/lib/chat/chunker', () => ({
  chunkDocument: vi.fn(),
}));

vi.mock('@/lib/chat/embeddings', () => ({
  generateEmbeddings: vi.fn(),
}));

vi.mock('@/lib/assessment/delta-extractor', () => ({
  extractDeltasFromDocument: vi.fn(),
}));

vi.mock('@/lib/assessment/grc-trigger', () => ({
  triggerGrcRecalibration: vi.fn(),
}));

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });

  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.insert.mockReturnThis();
  mockSupabaseServer.update.mockReturnThis();
  mockSupabaseServer.delete.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockReturnThis();

  // Profiles and compliance_documents mocks
  mockSupabaseServer.single.mockImplementation(async () => {
    // Determine context based on last called table
    const lastTable = mockSupabaseServer.from.mock.calls[mockSupabaseServer.from.mock.calls.length - 1]?.[0];
    if (lastTable === 'profiles') {
      return { data: { role: 'admin' }, error: null };
    }
    if (lastTable === 'compliance_documents') {
      return {
        data: {
          id: 1,
          filename: 'test.txt',
          filepath: 'ISMS_CORE/test.txt',
          file_format: 'txt',
          product_version_id: 'v2.2.x',
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });

  mockSupabaseServer.storage.from.mockReturnValue({
    download: vi.fn().mockResolvedValue({ data: new Blob(['file content'], { type: 'text/plain' }), error: null }),
  });

  // Mock adminSupabase as well
  mockSupabaseAdmin.from.mockReturnThis();
  mockSupabaseAdmin.upsert.mockResolvedValue({ error: null });
}

describe('Document Re-indexing API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/documents/[id]/reindex/route');

    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const req = new Request('http://localhost/api/documents/1/reindex', {
      method: 'POST',
    });

    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Authentication required.');
  });

  it('returns 403 when user is not admin or ionic_user', async () => {
    const { POST } = await import('@/app/api/documents/[id]/reindex/route');

    mockSupabaseServer.single.mockImplementation(async () => {
      const lastTable = mockSupabaseServer.from.mock.calls[mockSupabaseServer.from.mock.calls.length - 1]?.[0];
      if (lastTable === 'profiles') {
        return { data: { role: 'standard_user' }, error: null };
      }
      return { data: null, error: null };
    });

    const req = new Request('http://localhost/api/documents/1/reindex', {
      method: 'POST',
    });

    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Unauthorized to perform re-indexing.');
  });

  it('performs re-indexing, extracts deltas, and triggers GRC recalibration', async () => {
    const { POST } = await import('@/app/api/documents/[id]/reindex/route');

    // Setup mock implementations for extraction & chunking
    (extractText as any).mockResolvedValue('Extracted document text content.');
    (chunkDocument as any).mockReturnValue([
      { content: 'Chunk 1', index: 0, metadata: { sectionTitle: 'Section 1' } },
    ]);
    (generateEmbeddings as any).mockResolvedValue([[0.1, 0.2, 0.3]]);
    (extractDeltasFromDocument as any).mockResolvedValue([
      {
        feature_slug: 'test-feature',
        description: 'Test feature description',
        affected_components: ['database'],
        risk_level: 'low',
      },
    ]);

    const req = new Request('http://localhost/api/documents/1/reindex', {
      method: 'POST',
    });

    const res = await POST(req, { params: Promise.resolve({ id: '1' }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.documentId).toBe(1);
    expect(body.data.chunkCount).toBe(1);

    expect(extractText).toHaveBeenCalled();
    expect(chunkDocument).toHaveBeenCalledWith('Extracted document text content.');
    
    // Wait briefly for background promises to settle
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(extractDeltasFromDocument).toHaveBeenCalledWith('Extracted document text content.');
    expect(triggerGrcRecalibration).toHaveBeenCalledWith('v2.2.x', 'test-user-id');
  });
});
