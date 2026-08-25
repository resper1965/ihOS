// tests/unit/lib/mcp-posture.test.ts
// F6-lite unit tests: service-token auth and tool dispatch guardrails
// (src/lib/mcp/posture-tools.ts)

import { describe, it, expect, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  verifyServiceToken,
  callMcpTool,
  MCP_TOOLS,
  McpToolError,
} from '@/lib/mcp/posture-tools';

const TOKEN = 'a-sufficiently-long-service-token-0123456789';

describe('verifyServiceToken (T602)', () => {
  it('accepts the exact configured token and returns a fingerprint', () => {
    const check = verifyServiceToken(`Bearer ${TOKEN}`, TOKEN);
    expect(check.ok).toBe(true);
    expect(check.fingerprint).toHaveLength(12);
  });

  it('rejects a wrong token but still fingerprints it for the audit log', () => {
    const check = verifyServiceToken('Bearer wrong-token-wrong-token-wrong-token', TOKEN);
    expect(check.ok).toBe(false);
    expect(check.reason).toBe('invalid');
    expect(check.fingerprint).toHaveLength(12);
  });

  it('rejects missing/malformed authorization headers', () => {
    expect(verifyServiceToken(null, TOKEN).reason).toBe('missing');
    expect(verifyServiceToken(TOKEN, TOKEN).reason).toBe('missing'); // no Bearer prefix
  });

  it('refuses to run without a configured token (or one that is too short)', () => {
    expect(verifyServiceToken(`Bearer ${TOKEN}`, undefined).reason).toBe('unconfigured');
    expect(verifyServiceToken('Bearer short', 'short').reason).toBe('unconfigured');
  });

  it('never leaks the secret in the fingerprint', () => {
    const check = verifyServiceToken(`Bearer ${TOKEN}`, TOKEN);
    expect(check.fingerprint).not.toContain(TOKEN);
    expect(TOKEN).not.toContain(check.fingerprint!);
  });
});

describe('tool catalog', () => {
  it('exposes the read-only tools including vendors', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      'get_posture',
      'list_gaps',
      'get_threat_posture',
      'list_vendors',
      'check_vendor_evidence',
    ]);
  });

  it('makes version and channel mandatory on get_posture', () => {
    const getPosture = MCP_TOOLS.find((t) => t.name === 'get_posture')!;
    expect(getPosture.inputSchema.required).toEqual(['product_version_code', 'sales_channel']);
  });
});

describe('callMcpTool guardrails', () => {
  const admin = {} as SupabaseClient; // handlers must fail before touching the client

  it('rejects unknown tools', async () => {
    await expect(callMcpTool(admin, 'write_posture', {})).rejects.toMatchObject({
      code: 'UNKNOWN_TOOL',
    });
  });

  it('enforces mandatory version × channel on get_posture', async () => {
    await expect(callMcpTool(admin, 'get_posture', {})).rejects.toBeInstanceOf(McpToolError);
    await expect(
      callMcpTool(admin, 'get_posture', { product_version_code: 'v1' }),
    ).rejects.toMatchObject({ message: expect.stringContaining('sales_channel') });
    await expect(
      callMcpTool(admin, 'get_posture', { product_version_code: 'v1', sales_channel: 'ALL' }),
    ).rejects.toBeInstanceOf(McpToolError);
  });

  it('enforces mandatory version on get_threat_posture', async () => {
    await expect(callMcpTool(admin, 'get_threat_posture', {})).rejects.toBeInstanceOf(McpToolError);
  });

  it('surfaces unknown versions as a typed tool error', async () => {
    const adminWithNoVersions = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    } as unknown as SupabaseClient;

    await expect(
      callMcpTool(adminWithNoVersions, 'get_posture', {
        product_version_code: 'v99.99',
        sales_channel: 'B2B_GEHC',
      }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_VERSION' });
  });
});

describe('list_vendors & check_vendor_evidence handlers', () => {
  it('enforces vendor_id on check_vendor_evidence', async () => {
    const admin = {} as SupabaseClient;
    await expect(callMcpTool(admin, 'check_vendor_evidence', {})).rejects.toBeInstanceOf(McpToolError);
  });

  it('handles list_vendors with database mock and calculates scores and expired documents', async () => {
    const mockVendors = [
      {
        id: 'v1',
        name: 'AWS',
        description: 'Cloud provider',
        risk_level: 'high',
        status: 'active',
        created_at: '2026-07-24T12:00:00Z',
        assessments: [
          {
            id: 'a1',
            compliant_controls: 8,
            total_controls: 10,
            completed_at: '2026-07-24T12:00:00Z',
          }
        ],
        compliance_documents: [
          {
            id: 'd1',
            filename: 'soc2.pdf',
            doc_type: 'SOC 2 Report',
            expires_at: '2025-01-01T00:00:00Z', // expired
          }
        ]
      }
    ];

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          limit: vi.fn(() => ({
            order: vi.fn(async () => ({ data: mockVendors, error: null })),
          })),
        })),
      })),
    } as unknown as SupabaseClient;

    const result = await callMcpTool(mockAdmin, 'list_vendors', {});
    expect(result.vendors).toBeDefined();
    expect((result.vendors as any)[0]).toMatchObject({
      id: 'v1',
      name: 'AWS',
      latest_assessment_score: '80%',
      has_expired_evidences: true,
      document_count: 1,
    });
  });

  it('handles check_vendor_evidence sorting active vs expired documents', async () => {
    const mockVendor = {
      id: 'v1',
      name: 'AWS',
      compliance_documents: [
        {
          id: 'd1',
          filename: 'soc2_expired.pdf',
          doc_type: 'SOC 2',
          expires_at: '2025-01-01T00:00:00Z',
        },
        {
          id: 'd2',
          filename: 'iso27001_active.pdf',
          doc_type: 'ISO 27001 Certificate',
          expires_at: '2028-01-01T00:00:00Z',
        }
      ]
    };

    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: mockVendor, error: null })),
          })),
        })),
      })),
    } as unknown as SupabaseClient;

    const result = await callMcpTool(mockAdmin, 'check_vendor_evidence', { vendor_id: 'v1' });
    expect(result.vendor_name).toBe('AWS');
    expect(result.has_expired_documents).toBe(true);
    expect((result.expired_documents as any).length).toBe(1);
    expect((result.expired_documents as any)[0].filename).toBe('soc2_expired.pdf');
    expect((result.active_documents as any).length).toBe(1);
    expect((result.active_documents as any)[0].filename).toBe('iso27001_active.pdf');
  });

  it('throws typed error if vendor not found on check_vendor_evidence', async () => {
    const mockAdmin = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn(async () => ({ data: null, error: null })),
          })),
        })),
      })),
    } as unknown as SupabaseClient;

    await expect(
      callMcpTool(mockAdmin, 'check_vendor_evidence', { vendor_id: 'nonexistent-uuid' })
    ).rejects.toMatchObject({ code: 'VENDOR_NOT_FOUND' });
  });
});
