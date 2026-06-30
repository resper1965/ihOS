import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer } from '../setup';

describe('Knowledge Base Health API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    });
    mockSupabaseServer.from.mockReturnThis();
    mockSupabaseServer.select.mockReturnThis();
    mockSupabaseServer.eq.mockReturnThis();
    mockSupabaseServer.not.mockReturnThis();

    // Reset client-level state
    delete (mockSupabaseServer as any).then;
    (mockSupabaseServer as any).isStatsTest = false;

    // Factory to return independent builder per chain
    mockSupabaseServer.from.mockImplementation((table: string) => {
      const chainState = {
        table,
        columns: null as string | null,
        options: null as any,
        eq: null as { col: string; val: any } | null,
        not: null as { col: string; op: string; val: any } | null,
      };

      const builder: any = {
        select: vi.fn().mockImplementation((columns?: string, options?: any) => {
          chainState.columns = columns ?? null;
          chainState.options = options ?? null;
          return builder;
        }),
        eq: vi.fn().mockImplementation((col: string, val: any) => {
          chainState.eq = { col, val };
          return builder;
        }),
        not: vi.fn().mockImplementation((col: string, op: string, val: any) => {
          chainState.not = { col, op, val };
          return builder;
        }),
        then: (onFulfilled: any) => {
          let result = { data: [] as any[], error: null as any, count: null as any };

          if (chainState.table === 'compliance_documents') {
            if (chainState.options?.count === 'exact') {
              if (chainState.eq?.col === 'total_chunks' && chainState.eq?.val === 0) {
                result = { data: [], error: null, count: 1 }; // missingIndexDocs
              } else {
                result = { data: [], error: null, count: 10 }; // totalDocs
              }
            }
          } else if (chainState.table === 'document_chunks') {
            if (chainState.options?.count === 'exact') {
              result = { data: [], error: null, count: 100 }; // totalChunks
            } else if (chainState.not?.col === 'iso_controls') {
              result = { data: [{ id: '1' }, { id: '2' }], error: null, count: null }; // chunksWithIso
            }
          }

          return Promise.resolve(result).then(onFulfilled);
        }
      };

      return builder;
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/compliance/kb-health/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const res = await GET();
    const body = await res.json();
    console.log("401 TEST BODY:", body);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns kb health data successfully', async () => {
    const { GET } = await import('@/app/api/compliance/kb-health/route');

    const res = await GET();
    const body = await res.json();
    console.log("200 TEST BODY:", body);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.totalDocs).toBe(10);
    expect(body.data.totalChunks).toBe(100);
    expect(body.data.missingIndexDocs).toBe(1);
    expect(body.data.isoCoverageCount).toBe(2);
    expect(body.data.isoPercentage).toBe(2);
  });
});
