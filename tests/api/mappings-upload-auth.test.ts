// tests/api/mappings-upload-auth.test.ts
// /api/compliance/mappings/upload writes through createAdminClient() (service
// role, RLS bypassed) so it must gate on role the same way its sibling
// mappings/sync route does. Without this gate, any authenticated user could
// re-mint a quarantined framework into the Run Assessment picker.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { mockSupabaseServer } from '../setup';

function resetMocks() {
  mockSupabaseServer.auth.getUser.mockResolvedValue({
    data: { user: { id: 'test-user-id', email: 'test@example.com' } },
    error: null,
  });

  mockSupabaseServer.from.mockReturnThis();
  mockSupabaseServer.select.mockReturnThis();
  mockSupabaseServer.eq.mockReturnThis();
  mockSupabaseServer.single.mockResolvedValue({
    data: { role: 'admin' },
    error: null,
  });
}

function csvRequest() {
  return new Request('http://localhost/api/compliance/mappings/upload', {
    method: 'POST',
    headers: { 'content-type': 'text/csv' },
    body: 'framework_code,target_control_id,scf_control_code\nsoc2,CC6.1,GEN-01\n',
  });
}

describe('Compliance Mappings Upload API auth gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetMocks();
  });

  it('returns 401 when unauthenticated', async () => {
    const { POST } = await import('@/app/api/compliance/mappings/upload/route');

    mockSupabaseServer.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Session not found'),
    });

    const res = await POST(csvRequest() as any);
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 403 for a client_user role', async () => {
    const { POST } = await import('@/app/api/compliance/mappings/upload/route');

    mockSupabaseServer.single.mockResolvedValue({
      data: { role: 'client_user' },
      error: null,
    });

    const res = await POST(csvRequest() as any);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toBe('Forbidden: Admin or Ionic User required');
  });

  it('lets an admin past the auth gate', async () => {
    const { POST } = await import('@/app/api/compliance/mappings/upload/route');

    mockSupabaseServer.single.mockResolvedValue({
      data: { role: 'admin' },
      error: null,
    });

    const res = await POST(csvRequest() as any);

    // Only asserting the gate let the admin through — the route may still
    // fail past this point for unrelated body-parsing/db reasons.
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
