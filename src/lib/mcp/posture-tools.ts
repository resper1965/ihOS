// src/lib/mcp/posture-tools.ts
// F6-lite (specs/003 Onda 1c) — the read-only MCP posture surface.
//
// External agents read the ALREADY-PERSISTED posture; nothing here generates,
// evaluates, or writes (T601 partial — answer_question arrives later).
// Context rule: get_posture requires version × channel so an agent can never
// receive an answer that silently mixes sales-channel overlays.
// get_threat_posture is the documented exception: threat models are keyed by
// product version only (they are channel-agnostic by construction).

import { createHash, timingSafeEqual } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getObservedPosture } from '@/lib/posture/observed-status';

// ── Service-token auth (T602) ────────────────────────────────────────────────

export interface TokenCheck {
  ok: boolean;
  /** SHA-256 hex prefix identifying the token in the audit log. */
  fingerprint: string | null;
  /** 'unconfigured' | 'missing' | 'invalid' when not ok. */
  reason?: string;
}

/**
 * Constant-time comparison of the presented bearer token against
 * MCP_SERVICE_TOKEN. Never logs or returns the secret — only a fingerprint.
 */
export function verifyServiceToken(
  authorizationHeader: string | null,
  configuredToken: string | undefined = process.env.MCP_SERVICE_TOKEN,
): TokenCheck {
  if (!configuredToken || configuredToken.length < 32) {
    return { ok: false, fingerprint: null, reason: 'unconfigured' };
  }

  const presented = authorizationHeader?.startsWith('Bearer ')
    ? authorizationHeader.slice('Bearer '.length)
    : null;
  if (!presented) {
    return { ok: false, fingerprint: null, reason: 'missing' };
  }

  const fingerprint = createHash('sha256').update(presented).digest('hex').slice(0, 12);

  const a = Buffer.from(presented);
  const b = Buffer.from(configuredToken);
  const ok = a.length === b.length && timingSafeEqual(a, b);

  return ok
    ? { ok: true, fingerprint }
    : { ok: false, fingerprint, reason: 'invalid' };
}

// ── Tool catalog (tools/list) ────────────────────────────────────────────────

export const MCP_TOOLS = [
  {
    name: 'get_posture',
    description:
      'Current compliance posture for a product version and sales channel: framework scores (documental axis) plus observed runtime violations (analytical axis). Both context arguments are MANDATORY so answers never mix sales-channel document overlays.',
    inputSchema: {
      type: 'object',
      properties: {
        product_version_code: {
          type: 'string',
          description: 'Product version code (e.g. "v2.5.0") as registered in ihOS.',
        },
        sales_channel: {
          type: 'string',
          enum: ['B2B_GEHC', 'B2B_DIRECT'],
          description: 'Sales channel whose contract overlay applies.',
        },
      },
      required: ['product_version_code', 'sales_channel'],
    },
  },
  {
    name: 'list_gaps',
    description:
      'Top open compliance gaps (controls evaluated non-compliant), worst confidence first, from the persisted evaluations. Read-only.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum gaps to return (default 10).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_threat_posture',
    description:
      'Latest DOCUMENTAL threat-model summary for a product version: STRIDE threat counts, gaps and review status. Threat models are channel-scoped (NPR v3): pass sales_channel to read that channel\'s analysis; omit it to read only channel-less internal aggregate models. Runtime observation is never part of this output.',
    inputSchema: {
      type: 'object',
      properties: {
        product_version_code: {
          type: 'string',
          description: 'Product version code (e.g. "v2.5.0").',
        },
        sales_channel: {
          type: 'string',
          enum: ['B2B_GEHC', 'B2B_DIRECT'],
          description: 'Commercial context of the analysis. Omit for channel-less internal aggregate models only.',
        },
      },
      required: ['product_version_code'],
    },
  },
  {
    name: 'list_vendors',
    description:
      'List all registered vendors/suppliers, their risk levels, status, latest security assessments, and compliance documents.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'integer',
          minimum: 1,
          maximum: 50,
          description: 'Maximum vendors to return (default 20).',
        },
      },
      required: [],
    },
  },
  {
    name: 'check_vendor_evidence',
    description:
      'Check all compliance documents for a specific vendor, auditing if there are any expired evidence documents (ISO 27001 - A.5.22).',
    inputSchema: {
      type: 'object',
      properties: {
        vendor_id: {
          type: 'string',
          description: 'The unique identifier (UUID) of the vendor.',
        },
      },
      required: ['vendor_id'],
    },
  },
] as const;

export type McpToolName = (typeof MCP_TOOLS)[number]['name'];

// ── Tool handlers (read-only) ────────────────────────────────────────────────

export class McpToolError extends Error {
  constructor(message: string, public readonly code: string = 'INVALID_ARGUMENTS') {
    super(message);
    this.name = 'McpToolError';
  }
}

async function resolveVersionId(
  admin: SupabaseClient,
  productVersionCode: string,
): Promise<string> {
  const { data, error } = await admin
    .from('product_versions')
    .select('id')
    .eq('version_code', productVersionCode)
    .maybeSingle();
  // A query failure is an infra fault, not an unknown version — report it as such.
  if (error) {
    throw new McpToolError(`Version lookup failed: ${error.message}`, 'QUERY_FAILED');
  }
  const id = (data as { id?: string } | null)?.id;
  if (!id) {
    throw new McpToolError(
      `Unknown product_version_code: ${productVersionCode}`,
      'UNKNOWN_VERSION',
    );
  }
  return id;
}

async function getPosture(
  admin: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const versionCode = args.product_version_code;
  const channel = args.sales_channel;
  if (typeof versionCode !== 'string' || !versionCode) {
    throw new McpToolError('product_version_code is required');
  }
  if (channel !== 'B2B_GEHC' && channel !== 'B2B_DIRECT') {
    throw new McpToolError('sales_channel must be "B2B_GEHC" or "B2B_DIRECT"');
  }

  const versionId = await resolveVersionId(admin, versionCode);

  // Documental axis: latest persisted scorecard snapshot.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: snapshot } = await (admin as any)
    .from('intelligence_snapshots')
    .select('snapshot_data, created_at')
    .eq('snapshot_type', 'scorecard')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  // Analytical axis: observed runtime posture for this version.
  const observed = await getObservedPosture(admin, versionId);

  return {
    product_version_code: versionCode,
    sales_channel: channel,
    documental: snapshot
      ? {
          generated_at: snapshot.created_at,
          frameworks: snapshot.snapshot_data?.frameworks ?? snapshot.snapshot_data ?? null,
          // Honest scoping: intelligence_snapshots carries no version/channel
          // fields yet, so this scorecard is the latest ORGANIZATION-WIDE
          // snapshot — do not present it as isolated to the requested scope.
          scope: 'organization-wide',
          scope_note:
            'Scorecard snapshots are not yet version/channel-scoped; the requested context applies fully to the observed axis and to answer surfaces, not to this aggregate scorecard.',
        }
      : { generated_at: null, frameworks: null, scope: 'organization-wide', note: 'No scorecard snapshot persisted yet — run an assessment.' },
    observed: {
      violated_controls: observed.violated,
      degraded_controls: observed.degraded,
      last_synced_at: observed.lastSyncedAt,
    },
    disclaimer:
      'Documental and observed axes are independent views; neither overrides the other.',
  };
}

async function listGaps(
  admin: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const limitRaw = args.limit;
  const limit =
    typeof limitRaw === 'number' && Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 50
      ? limitRaw
      : 10;

  const { data, error } = await admin
    .from('evidence_evaluations')
    .select('control_code, scf_control_code, domain_code, control_name, confidence_score, missing_elements')
    .eq('is_compliant', false)
    .order('confidence_score', { ascending: true })
    .limit(limit);

  if (error) {
    throw new McpToolError(`Gap query failed: ${error.message}`, 'QUERY_FAILED');
  }

  return {
    gaps: (data ?? []).map((g: Record<string, unknown>) => ({
      control_code: g.control_code ?? g.scf_control_code ?? 'UNKNOWN',
      scf_control_code: g.scf_control_code ?? null,
      domain: g.domain_code ?? null,
      name: g.control_name ?? null,
      confidence: g.confidence_score ?? null,
      missing_elements: g.missing_elements ?? [],
    })),
    note: 'Gaps come from persisted evaluations; remediation plans/deadlines are intentionally not exposed.',
  };
}

async function getThreatPosture(
  admin: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const versionCode = args.product_version_code;
  if (typeof versionCode !== 'string' || !versionCode) {
    throw new McpToolError('product_version_code is required');
  }
  const channel = args.sales_channel;
  if (channel !== undefined && channel !== 'B2B_GEHC' && channel !== 'B2B_DIRECT') {
    throw new McpToolError('sales_channel must be "B2B_GEHC" or "B2B_DIRECT" when provided');
  }

  // select * and filter in JS: sales_channel is a newer column and legacy
  // rows/databases read as NULL (channel-less), matching only channel-less
  // requests — GEHC posture is never served from a Direct analysis.
  const { data: rows, error: threatQueryError } = await admin
    .from('threat_models')
    .select('*')
    .eq('product_version', versionCode)
    .order('created_at', { ascending: false })
    .limit(25);

  if (threatQueryError) {
    throw new McpToolError(`Threat model lookup failed: ${threatQueryError.message}`, 'QUERY_FAILED');
  }

  const wanted = (channel as string | undefined) ?? null;
  const row = ((rows ?? []) as Array<{
    id: string; status: string; created_at: string; target_frameworks?: string[];
    model_data?: Record<string, unknown>; sales_channel?: string | null;
  }>).find((r) => {
    const rowChannel = r.sales_channel
      ?? (r.model_data as { metadata?: { sales_channel?: string | null } } | undefined)?.metadata?.sales_channel
      ?? null;
    return rowChannel === wanted;
  });

  if (!row) {
    return {
      product_version_code: versionCode,
      sales_channel: wanted,
      threat_model: null,
      note: wanted
        ? `No threat model has been generated for this version in channel ${wanted} yet.`
        : 'No channel-less threat model exists for this version. Pass sales_channel to read a channel-scoped analysis.',
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = (row.model_data ?? {}) as any;
  const threats: Array<Record<string, unknown>> = d?.threat_model?.threats ?? [];
  const byCategory: Record<string, number> = {};
  for (const t of threats) {
    const cat = String(t.stride_category ?? 'unknown');
    byCategory[cat] = (byCategory[cat] ?? 0) + 1;
  }

  return {
    product_version_code: versionCode,
    sales_channel: wanted,
    threat_model: {
      id: row.id,
      status: String(row.status ?? 'draft').toLowerCase().replace('modelstatus.', ''),
      generated_at: row.created_at,
      target_frameworks: row.target_frameworks ?? [],
      threat_count: threats.length,
      threats_by_stride_category: byCategory,
      inherited_threats: threats.filter((t) => t.is_new === false).length,
      gap_count: (d?.gaps ?? []).length,
      limitations: d?.limitations ?? [],
    },
  };
}

async function listVendors(
  admin: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const limitRaw = args.limit;
  const limit =
    typeof limitRaw === 'number' && Number.isInteger(limitRaw) && limitRaw >= 1 && limitRaw <= 50
      ? limitRaw
      : 20;

  const { data: vendors, error } = await admin
    .from('vendors' as any)
    .select(`
      id,
      name,
      description,
      risk_level,
      status,
      created_at,
      assessments:assessments (
        id,
        compliant_controls,
        total_controls,
        completed_at
      ),
      compliance_documents:compliance_documents (
        id,
        filename,
        doc_type,
        expires_at
      )
    `)
    .limit(limit)
    .order('created_at', { ascending: false });

  if (error) {
    throw new McpToolError(`Vendor query failed: ${error.message}`, 'QUERY_FAILED');
  }

  return {
    vendors: (vendors ?? []).map((v: any) => {
      const sorted = v.assessments
        ? [...v.assessments].sort((a: any, b: any) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime())
        : [];
      const latest = sorted[0];

      let score = null;
      if (latest && latest.total_controls > 0) {
        score = `${Math.round((latest.compliant_controls / latest.total_controls) * 100)}%`;
      }

      const hasExpired = v.compliance_documents?.some((doc: any) => {
        if (!doc.expires_at) return false;
        return new Date(doc.expires_at).getTime() < new Date().getTime();
      }) ?? false;

      return {
        id: v.id,
        name: v.name,
        description: v.description,
        risk_level: v.risk_level,
        status: v.status,
        created_at: v.created_at,
        latest_assessment_score: score,
        has_expired_evidences: hasExpired,
        document_count: v.compliance_documents?.length ?? 0,
      };
    }),
  };
}

async function checkVendorEvidence(
  admin: SupabaseClient,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const vendorId = args.vendor_id;
  if (typeof vendorId !== 'string' || !vendorId) {
    throw new McpToolError('vendor_id is required');
  }

  const { data: vendor, error } = await admin
    .from('vendors' as any)
    .select(`
      id,
      name,
      compliance_documents:compliance_documents (
        id,
        filename,
        doc_type,
        expires_at
      )
    `)
    .eq('id', vendorId)
    .maybeSingle();

  if (error) {
    throw new McpToolError(`Vendor lookup failed: ${error.message}`, 'QUERY_FAILED');
  }

  if (!vendor) {
    throw new McpToolError(`Vendor not found for id: ${vendorId}`, 'VENDOR_NOT_FOUND');
  }

  const docs = (vendor as any).compliance_documents ?? [];
  const now = new Date();

  const expiredDocs = docs.filter((doc: any) => {
    if (!doc.expires_at) return false;
    return new Date(doc.expires_at).getTime() < now.getTime();
  });

  const activeDocs = docs.filter((doc: any) => {
    if (!doc.expires_at) return true;
    return new Date(doc.expires_at).getTime() >= now.getTime();
  });

  return {
    vendor_id: vendorId,
    vendor_name: (vendor as any).name,
    has_expired_documents: expiredDocs.length > 0,
    expired_documents: expiredDocs.map((doc: any) => ({
      id: doc.id,
      filename: doc.filename,
      doc_type: doc.doc_type,
      expires_at: doc.expires_at,
    })),
    active_documents: activeDocs.map((doc: any) => ({
      id: doc.id,
      filename: doc.filename,
      doc_type: doc.doc_type,
      expires_at: doc.expires_at,
    })),
  };
}

/** Dispatch a tools/call to its handler. */
export async function callMcpTool(
  admin: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  switch (name) {
    case 'get_posture':
      return getPosture(admin, args);
    case 'list_gaps':
      return listGaps(admin, args);
    case 'get_threat_posture':
      return getThreatPosture(admin, args);
    case 'list_vendors':
      return listVendors(admin, args);
    case 'check_vendor_evidence':
      return checkVendorEvidence(admin, args);
    default:
      throw new McpToolError(`Unknown tool: ${name}`, 'UNKNOWN_TOOL');
  }
}
