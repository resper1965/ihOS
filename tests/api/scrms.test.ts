// tests/api/scrms.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer } from '../setup';
import { triggerGrcRecalibration } from '@/lib/assessment/grc-trigger';

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
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.is = vi.fn().mockReturnThis();
  mockSupabaseServer.limit.mockReturnThis();
  mockSupabaseServer.single.mockReturnThis();
  mockSupabaseServer.maybeSingle.mockReturnThis();
  mockSupabaseServer.order.mockReturnThis();

  mockSupabaseServer.single.mockImplementation(async () => {
    const lastTable = mockSupabaseServer.from.mock.calls[mockSupabaseServer.from.mock.calls.length - 1]?.[0];
    if (lastTable === 'profiles') {
      return { data: { role: 'admin' }, error: null };
    }
    return { data: null, error: null };
  });

  mockSupabaseServer.maybeSingle.mockImplementation(async () => {
    const lastTable = mockSupabaseServer.from.mock.calls[mockSupabaseServer.from.mock.calls.length - 1]?.[0];
    if (lastTable === 'msr_baselines') {
      return { data: { id: 'baseline-id', product_version_id: 'version-id' }, error: null };
    }
    return { data: null, error: null };
  });
}

describe('SCRMS Compliance API Route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  describe('GET', () => {
    it('returns 401 when unauthenticated', async () => {
      const { GET } = await import('@/app/api/compliance/scrms/route');

      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Session not found'),
      });

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns baseline and controls successfully', async () => {
      const { GET } = await import('@/app/api/compliance/scrms/route');

      mockSupabaseServer.from.mockImplementation((table: string) => {
        return mockSupabaseServer;
      });

      // Mock return data for msr_controls
      mockSupabaseServer.order.mockResolvedValue({
        data: [
          {
            id: 'control-1',
            control_code: 'CRY-01',
            classification: 'MCR',
            status: 'accepted',
            rejection_rationale: null,
            dsr_score: 80,
            dsr_factors: {},
            pptdf_scope: ['Technology'],
            scf_controls: {
              control_name: 'Cryptographic Protection',
              description: 'Protect sensitive info',
            },
          },
        ],
        error: null,
      });

      const res = await GET();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.baseline.id).toBe('baseline-id');
      expect(body.controls).toHaveLength(1);
      expect(body.controls[0].control_code).toBe('CRY-01');
    });
  });

  describe('POST', () => {
    it('returns 401 when unauthenticated', async () => {
      const { POST } = await import('@/app/api/compliance/scrms/route');

      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Session not found'),
      });

      const res = await POST();
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 403 when role is unauthorized', async () => {
      const { POST } = await import('@/app/api/compliance/scrms/route');

      mockSupabaseServer.single.mockResolvedValue({
        data: { role: 'standard_user' },
        error: null,
      });

      const res = await POST();
      const body = await res.json();

      expect(res.status).toBe(403);
      expect(body.error).toBe('Unauthorized');
    });

    it('triggers GRC recalibration and returns success', async () => {
      const { POST } = await import('@/app/api/compliance/scrms/route');

      const res = await POST();
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Recalibration completed successfully.');
      expect(triggerGrcRecalibration).toHaveBeenCalledWith('version-id', 'test-user-id');
    });
  });
});
