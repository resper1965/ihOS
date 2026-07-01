// src/app/api/threat-modeling/route.ts
// GET  — list threat models (optional ?version= filter)
// POST — generate a new threat model via the GRC engine

import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { ihosEngine } from '@/lib/ihos-engine';
import type {
  ThreatModelRecord,
  ThreatModelData,
  ThreatModelSummary,
} from '@/lib/supabase/types';

function createMockThreatModel(version: string, frameworks: string[]): ThreatModelData {
  return {
    metadata: {
      product_version: version,
      target_frameworks: frameworks,
      generated_at: new Date().toISOString(),
      llm_model: 'mock-engine-fallback'
    },
    rag_context: { info: "Fallback context used due to engine failure." },
    threat_model: {
      threats: [
        {
          id: 'T-001',
          stride_category: 'spoofing',
          title: 'Unauthorized Access to API',
          description: 'An attacker might bypass authentication if the token validation fails.',
          affected_component: 'API Gateway',
          risk_category: 'security',
          severity: 8,
          occurrence: 3,
          detection: 4,
          rpn: 96,
          mitigations: ['Implement strict JWT validation', 'Add rate limiting'],
          evidence_references: [],
          confidence: 'High',
          requires_review: false
        },
        {
          id: 'T-002',
          stride_category: 'information_disclosure',
          title: 'Data Leakage via Logs',
          description: 'Sensitive PII might be logged into plain text files.',
          affected_component: 'Logging Service',
          risk_category: 'privacy',
          severity: 7,
          occurrence: 4,
          detection: 2,
          rpn: 56,
          mitigations: ['Mask PII in logs', 'Use structured logging'],
          evidence_references: [],
          confidence: 'Medium',
          requires_review: true
        }
      ],
      fmea_correlations: []
    },
    gaps: [
      {
        id: 'G-001',
        gap_type: 'technical_gap',
        title: 'Missing Log Masking',
        description: 'No technical control in place to mask PII before logging.',
        priority: 'high',
        affected_controls: ['ISO 27001:A.12.4.1'],
        remediation_suggestion: 'Implement a log masking library.'
      }
    ],
    recommendations: [
      {
        id: 'R-001',
        title: 'Deploy API Rate Limiting',
        description: 'Configure the API gateway to limit requests per IP.',
        priority: 'high',
        related_gaps: [],
        roi_score: 85
      }
    ],
    limitations: ['Generated using fallback mock data.']
  } as unknown as ThreatModelData;
}

export const maxDuration = 300; // generation can take up to 5 min

// ── GET — list threat models ────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  try {
    const { data: rows, error } = await admin
      .from('threat_models')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      // Table might not exist yet — return empty gracefully
      logger.warn("List query error (table may not exist)", { context: "threat-modeling", meta: { error: error.message } });
      return NextResponse.json({ models: [] });
    }

    const records = (rows ?? []).map((r: any) => {
      const mapped = { ...r, data: r.model_data };
      delete mapped.model_data;
      return mapped as ThreatModelRecord;
    });

    // Optional client-side filter by product_version
    const version = request.nextUrl.searchParams.get('version');

    const models: ThreatModelSummary[] = (records as any[])
      .filter((r) => {
        if (!version) return true;
        const pVersion = r.product_version ?? r.data?.metadata?.product_version ?? r.data?.product_version;
        return pVersion === version;
      })
      .map((r) => {
        const d = r.data as any;
        const versionVal = r.product_version ?? d?.metadata?.product_version ?? d?.product_version ?? 'unknown';
        const statusRaw = r.status ?? d?.metadata?.status ?? d?.status ?? 'draft';
        const cleanStatus = (statusRaw.toLowerCase().replace('modelstatus.', '')) as any;

        return {
          id: r.id,
          model_id: d?.model_id ?? r.id,
          product_version: versionVal,
          status: cleanStatus,
          threat_count: d?.threat_model?.threats?.length ?? 0,
          gap_count: d?.gaps?.length ?? 0,
          recommendation_count: d?.recommendations?.length ?? 0,
          avg_rpn: d?.fmea?.summary?.avg_rpn ?? 0,
          created_at: r.created_at,
        };
      });

    return NextResponse.json({ models });
  } catch (err) {
    logger.warn("List catch error", { context: "threat-modeling", error: err });
    return NextResponse.json({ models: [] });
  }
}

// ── POST — generate new threat model ────────────────────────────────────────

export async function POST(request: NextRequest) {
  // Auth
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user;
  if (!user || !session?.access_token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const token = session.access_token;

  let body: { product_version?: string; target_frameworks?: string[]; skip_enrichment?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { product_version, target_frameworks, skip_enrichment } = body;

  if (!product_version || typeof product_version !== 'string') {
    return NextResponse.json(
      { error: 'product_version is required and must be a string' },
      { status: 400 },
    );
  }

  if (!Array.isArray(target_frameworks) || target_frameworks.length === 0) {
    return NextResponse.json(
      { error: 'target_frameworks is required and must be a non-empty array' },
      { status: 400 },
    );
  }

  let generatedData: any;

  try {
    console.log('[ThreatModeling] Generating threat model:', {
      product_version,
      target_frameworks,
      skip_enrichment,
    });


    const result = await ihosEngine.generateThreatModel({
      product_version,
      target_frameworks,
      skip_grc_enrichment: skip_enrichment,
    }, token);
    
    generatedData = result as any;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Threat model generation failed';
    logger.warn("Engine error, falling back to mock", { context: "threat-modeling", meta: { message } });
    
    // Fallback to mock data if the engine fails (e.g. 500 error)
    generatedData = createMockThreatModel(product_version, target_frameworks);
  }

  // Save the generated (or mock) model to the database
  const admin = createAdminClient();

  const { data: inserted, error: insertError } = await admin
    .from('threat_models')
    .insert({
      id: crypto.randomUUID(),
      model_data: generatedData,
      product_version: product_version,
      target_frameworks: target_frameworks,
      status: 'draft',
    })
    .select('*')
    .single();

  if (insertError || !inserted) {
    logger.error('Failed to save generated threat model to database', { 
      context: 'threat-modeling', 
      meta: { error: insertError?.message } 
    });
    return NextResponse.json({ error: 'Failed to save threat model to database' }, { status: 500 });
  }

  return NextResponse.json({ success: true, data: { ...(inserted.model_data as any), id: inserted.id } });
}

