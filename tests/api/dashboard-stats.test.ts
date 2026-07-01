import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer } from '../setup';

describe('Dashboard Stats API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: { id: 'test-user-id', email: 'test@example.com' } },
      error: null,
    });
    mockSupabaseServer.from.mockReturnThis();
    mockSupabaseServer.select.mockReturnThis();
    mockSupabaseServer.eq.mockReturnThis();
    mockSupabaseServer.limit.mockReturnThis();
    mockSupabaseServer.single.mockReturnThis();
    mockSupabaseServer.maybeSingle.mockReturnThis();
    mockSupabaseServer.order.mockReturnThis();

    // Reset client-level state
    delete (mockSupabaseServer as any).then;
    (mockSupabaseServer as any).isStatsTest = true;

    // Factory to return independent builder per chain
    mockSupabaseServer.from.mockImplementation((table: string) => {
      const chainState = {
        table,
        columns: null as string | null,
        options: null as any,
        eq: null as { col: string; val: any } | null,
        limit: null as number | null,
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
        limit: vi.fn().mockImplementation((limitVal: number) => {
          chainState.limit = limitVal;
          return builder;
        }),
        order: vi.fn().mockImplementation(() => {
          return builder;
        }),
        maybeSingle: vi.fn().mockImplementation(async () => {
          if (chainState.table === 'msr_baselines') {
            return { data: { id: 'baseline-id', name: 'MSR v1', description: 'desc', product_versions: { version_code: 'v2.2.x' } }, error: null };
          }
          if (chainState.table === 'intelligence_snapshots') {
            return { data: { snapshot_data: { score: 85 } }, error: null };
          }
          return { data: null, error: null };
        }),
        then: (onFulfilled: any) => {
          let result = { data: [] as any[], error: null as any, count: null as any };

          if (chainState.table === 'compliance_documents') {
            if (chainState.options?.count === 'exact') {
              result = { data: [], error: null, count: 5 };
            }
          } else if (chainState.table === 'assessments') {
            if (chainState.options?.count === 'exact') {
              result = { data: [], error: null, count: 5 };
            } else if (chainState.columns === 'frameworks') {
              result = { data: [{ frameworks: ['iso27001'] }], error: null, count: null };
            }
          } else if (chainState.table === 'agent_notifications') {
            result = {
              data: [
                { id: '1', title: 'test', content: 'test', type: 'score_change', created_at: new Date().toISOString() }
              ],
              error: null,
              count: null
            };
          } else if (chainState.table === 'msr_controls') {
            result = {
              data: [
                { classification: 'MCR', status: 'accepted', pptdf_scope: ['Technology'] }
              ],
              error: null,
              count: null
            };
          }

          return Promise.resolve(result).then(onFulfilled);
        }
      };

      return builder;
    });
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/dashboard/stats/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const res = await GET(new Request("http://localhost") as any);
    const body = await res.json();
    console.log("401 TEST BODY:", body);

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns dashboard data successfully', async () => {
    const { GET } = await import('@/app/api/dashboard/stats/route');

    const res = await GET(new Request("http://localhost") as any);
    const body = await res.json();
    console.log("200 TEST BODY:", body);

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.stats.documents).toBe("5");
    expect(body.data.stats.assessments).toBe("5");
    expect(body.data.activities).toHaveLength(1);
    expect(body.data.msrData.baseline.name).toBe("MSR v1");
  });
});
