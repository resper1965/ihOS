// tests/api/report-export.test.ts
// Tests for report generation and Excel export API endpoints

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer, mockSupabaseAdmin } from '../setup';

function resetMocks() {
  // Reset server client mock
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.insert.mockReturnThis();
  mockSupabaseServer.update.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.order.mockReturnThis();
  mockSupabaseServer.limit.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: null, error: null });
  mockSupabaseServer.maybeSingle.mockResolvedValue({ data: null, error: null });
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });

  // Reset admin client mock
  mockSupabaseAdmin.from.mockReturnThis();
  mockSupabaseAdmin.select.mockReturnThis();
  mockSupabaseAdmin.insert.mockReturnThis();
  mockSupabaseAdmin.update.mockReturnThis();
  mockSupabaseAdmin.eq.mockReturnThis();
  mockSupabaseAdmin.order.mockReturnThis();
  mockSupabaseAdmin.limit.mockReturnThis();
  mockSupabaseAdmin.single.mockResolvedValue({ data: null, error: null });
  mockSupabaseAdmin.maybeSingle.mockResolvedValue({ data: null, error: null });
}

describe('Compliance Report API Endpoints', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  describe('GET /api/compliance/report', () => {
    it('returns a list of report snapshots when list=true is passed', async () => {
      const { GET } = await import('@/app/api/compliance/report/route');

      // Mock database response for snapshots list
      mockSupabaseAdmin.single.mockResolvedValue({ data: null, error: null });
      mockSupabaseAdmin.maybeSingle.mockResolvedValue({ data: null, error: null });
      mockSupabaseAdmin.order.mockResolvedValue({
        data: [
          {
            id: 123,
            framework_code: 'ISO-27001',
            created_at: '2026-06-07T12:00:00Z',
            metadata: { title: 'Test Report ISO-27001' }
          }
        ],
        error: null
      });

      const req = new Request('http://localhost/api/compliance/report?list=true');
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].id).toBe('123');
      expect(body.data[0].title).toBe('Test Report ISO-27001');
    });

    it('returns the latest report snapshot by default', async () => {
      const { GET } = await import('@/app/api/compliance/report/route');

      // Mock database response for a single pre-generated report snapshot
      mockSupabaseAdmin.maybeSingle.mockResolvedValue({
        data: {
          id: 456,
          snapshot_type: 'full_report',
          framework_code: 'ISO-27001',
          created_at: '2026-06-07T12:00:00Z',
          snapshot_data: { summary: { complianceRate: 92 } },
          metadata: {}
        },
        error: null
      });

      const req = new Request('http://localhost/api/compliance/report');
      const res = await GET(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.source).toBe('database');
      expect(body.report.summary.complianceRate).toBe(92);
    });
  });

  describe('POST /api/compliance/report', () => {
    it('returns 401 when unauthenticated', async () => {
      const { POST } = await import('@/app/api/compliance/report/route');

      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('Session not found')
      });

      const req = new Request('http://localhost/api/compliance/report', {
        method: 'POST',
        body: JSON.stringify({ frameworkCode: 'ISO-27001' })
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('generates and saves a new report snapshot when authenticated', async () => {
      const { POST } = await import('@/app/api/compliance/report/route');

      // Mock evidence evaluations
      mockSupabaseAdmin.order.mockResolvedValueOnce({
        data: [
          { control_code: 'A.5.1', domain_code: 'ORG', control_name: 'Policy', is_compliant: true, confidence_score: 95 }
        ],
        error: null
      });

      // Mock ROI and scorecard snapshots
      mockSupabaseAdmin.maybeSingle.mockResolvedValue({ data: null, error: null });

      // Mock insert response
      mockSupabaseAdmin.single.mockResolvedValue({
        data: {
          id: 789,
          snapshot_type: 'full_report',
          framework_code: 'ISO-27001',
          created_at: '2026-06-07T13:00:00Z',
          snapshot_data: { summary: { total: 1, compliant: 1 } },
          metadata: {}
        },
        error: null
      });

      const req = new Request('http://localhost/api/compliance/report', {
        method: 'POST',
        body: JSON.stringify({
          frameworkCode: 'ISO-27001',
          title: 'Manual Gen Report'
        })
      });

      const res = await POST(req);
      const body = await res.json();

      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.id).toBe('789');
    });
  });

  describe('GET /api/compliance/report/[id]/export', () => {
    it('returns 401 when unauthenticated', async () => {
      const { GET } = await import('@/app/api/compliance/report/[id]/export/route');

      mockSupabaseServer.auth.getUser.mockResolvedValue({
        data: { user: null },
        error: new Error('No user')
      });

      const req = new Request('http://localhost/api/compliance/report/123/export');
      const res = await GET(req, { params: Promise.resolve({ id: '123' }) });
      const body = await res.json();

      expect(res.status).toBe(401);
      expect(body.error).toBe('Unauthorized');
    });

    it('returns 404 when report snapshot is not found', async () => {
      const { GET } = await import('@/app/api/compliance/report/[id]/export/route');

      mockSupabaseAdmin.maybeSingle.mockResolvedValue({ data: null, error: null });

      const req = new Request('http://localhost/api/compliance/report/999/export');
      const res = await GET(req, { params: Promise.resolve({ id: '999' }) });
      const body = await res.json();

      expect(res.status).toBe(404);
      expect(body.error).toBe('Report not found');
    });

    it('returns Excel workbook binary stream when snapshot is found', async () => {
      const { GET } = await import('@/app/api/compliance/report/[id]/export/route');

      // Mock snapshot query
      mockSupabaseAdmin.maybeSingle.mockResolvedValue({
        data: {
          id: 123,
          snapshot_type: 'full_report',
          framework_code: 'ISO-27001',
          created_at: '2026-06-07T12:00:00Z',
          snapshot_data: {
            summary: { total: 10, compliant: 8, nonCompliant: 2, complianceRate: 80, avgConfidence: 85 },
            roiPath: [{ controlId: 'A.5.1', controlName: 'Access Control', roiScore: 9, frameworks: ['ISO-27001'] }],
            topGaps: [{ code: 'A.5.2', domain: 'Security', name: 'Asset Management', status: 'high', confidence: 40 }]
          }
        },
        error: null
      });

      const req = new Request('http://localhost/api/compliance/report/123/export');
      const res = await GET(req, { params: Promise.resolve({ id: '123' }) });

      expect(res.status).toBe(200);
      expect(res.headers.get('Content-Type')).toContain('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(res.headers.get('Content-Disposition')).toContain('filename="Relatorio_Conformidade_123.xlsx"');

      const arrayBuffer = await res.arrayBuffer();
      expect(arrayBuffer.byteLength).toBeGreaterThan(0);
    });
  });
});
