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
  it('exposes exactly the F6-lite read-only trio', () => {
    expect(MCP_TOOLS.map((t) => t.name)).toEqual([
      'get_posture',
      'list_gaps',
      'get_threat_posture',
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
