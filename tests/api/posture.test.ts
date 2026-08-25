// tests/api/posture.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { mockSupabaseServer } from '../setup';

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });
  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({ data: { role: 'admin' }, error: null });
}

function mockRequest(query: string) {
  return { url: `http://localhost/api/posture${query}` } as any;
}

describe('GET /api/posture', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { GET } = await import('@/app/api/posture/route');
    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const res = await GET(mockRequest('?controls=AC-1'));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 when the caller role is neither admin nor ionic_user', async () => {
    const { GET } = await import('@/app/api/posture/route');
    mockSupabaseServer.single.mockResolvedValue({ data: { role: 'client_user' }, error: null });

    const res = await GET(mockRequest('?controls=AC-1'));
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden');
  });

  it('returns 400 when an authorized caller omits controls', async () => {
    const { GET } = await import('@/app/api/posture/route');

    const res = await GET(mockRequest(''));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('controls is required');
  });

  it('returns 400 when an authorized caller requests more than 500 controls', async () => {
    const { GET } = await import('@/app/api/posture/route');
    const controls = Array.from({ length: 501 }, (_, i) => `AC-${i}`).join(',');

    const res = await GET(mockRequest(`?controls=${controls}`));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('at most 500 controls per request');
  });
});
