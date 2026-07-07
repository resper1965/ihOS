// src/app/api/mcp/route.ts
// F6-lite (specs/003 Onda 1c) — read-only MCP posture surface over
// Streamable HTTP (JSON-RPC 2.0, POST-only; no SSE stream in the lite cut).
//
// External agents authenticate with `Authorization: Bearer <MCP_SERVICE_TOKEN>`
// and may call: get_posture (version × channel mandatory), list_gaps,
// get_threat_posture (version-scoped exception). Every tools/call is written
// to mcp_audit_log with the token's fingerprint (T602). Nothing here writes
// or generates — it reads posture the platform already persisted.

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  verifyServiceToken,
  MCP_TOOLS,
  callMcpTool,
  McpToolError,
} from '@/lib/mcp/posture-tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

const PROTOCOL_VERSION = '2025-03-26';

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result });
}

function rpcError(id: string | number | null, code: number, message: string, httpStatus = 200) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { status: httpStatus },
  );
}

async function audit(
  fingerprint: string | null,
  toolName: string,
  args: Record<string, unknown>,
  success: boolean,
  errorCode: string | null,
  durationMs: number,
) {
  try {
    // mcp_audit_log is newer than the generated Supabase types.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const admin = createAdminClient() as any;
    await admin.from('mcp_audit_log').insert({
      tool_name: toolName,
      arguments: args,
      token_fingerprint: fingerprint,
      success,
      error_code: errorCode,
      duration_ms: durationMs,
    });
  } catch (err) {
    logger.warn('MCP audit write failed', {
      context: 'api/mcp',
      meta: { error: err instanceof Error ? err.message : 'unknown' },
    });
  }
}

export async function POST(request: NextRequest) {
  // ── Service auth (T602) ───────────────────────────────────────────────────
  const check = verifyServiceToken(request.headers.get('authorization'));
  if (!check.ok) {
    if (check.reason === 'unconfigured') {
      return NextResponse.json(
        { error: 'MCP surface not configured. Set MCP_SERVICE_TOKEN (≥32 chars).' },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let rpc: JsonRpcRequest;
  try {
    rpc = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, 'Parse error: invalid JSON', 400);
  }

  const id = rpc.id ?? null;

  if (rpc.jsonrpc !== '2.0' || typeof rpc.method !== 'string') {
    return rpcError(id, -32600, 'Invalid JSON-RPC 2.0 request', 400);
  }

  switch (rpc.method) {
    case 'initialize':
      return rpcResult(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: {
          name: 'ihos-posture',
          version: '0.1.0',
          description:
            'Read-only ihOS posture surface: persisted compliance verdicts, gaps and threat posture. No generation, no writes.',
        },
      });

    // Notifications carry no id and expect no result body.
    case 'notifications/initialized':
      return new NextResponse(null, { status: 202 });

    case 'tools/list':
      return rpcResult(id, { tools: MCP_TOOLS });

    case 'tools/call': {
      const params = rpc.params ?? {};
      const toolName = typeof params.name === 'string' ? params.name : '';
      const args = (params.arguments ?? {}) as Record<string, unknown>;
      const startedAt = Date.now();

      try {
        const admin = createAdminClient();
        const result = await callMcpTool(admin, toolName, args);
        await audit(check.fingerprint, toolName, args, true, null, Date.now() - startedAt);

        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        });
      } catch (err) {
        const isToolError = err instanceof McpToolError;
        const message = err instanceof Error ? err.message : 'Tool execution failed';
        const code = isToolError ? (err as McpToolError).code : 'INTERNAL_ERROR';

        await audit(check.fingerprint, toolName || 'unknown', args, false, code, Date.now() - startedAt);
        logger.warn('MCP tool call failed', {
          context: 'api/mcp',
          meta: { tool: toolName, code, error: message },
        });

        // Tool-level failures are returned as tool results (per MCP spec),
        // not JSON-RPC protocol errors.
        return rpcResult(id, {
          content: [{ type: 'text', text: JSON.stringify({ error: code, message }) }],
          isError: true,
        });
      }
    }

    default:
      return rpcError(id, -32601, `Method not found: ${rpc.method}`);
  }
}

// The lite surface is POST-only (no SSE stream).
export async function GET() {
  return NextResponse.json(
    { error: 'Method not allowed. The ihOS MCP surface accepts JSON-RPC 2.0 over POST only.' },
    { status: 405 },
  );
}
