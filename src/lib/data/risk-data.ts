// Risk/Threat Modeling data layer
// Follows the 3-tier fallback pattern: Supabase → fallback → empty state

import { createClient } from "@/lib/supabase/server";
import { createClient as createAdminClient } from "@/lib/supabase/admin";
import type {
  ThreatModelRecord,
  ThreatModelSummary,
  ThreatModelData,
  ThreatModelReport,
} from "@/lib/supabase/types";

// ---------------------------------------------------------------------------
// Threat Model Queries
// ---------------------------------------------------------------------------

export async function getRecentThreatModels(
  limit = 10
): Promise<ThreatModelSummary[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("threat_models")
      .select("id, data, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map((row: { id: string; data: ThreatModelData; created_at: string }) => ({
      id: row.id,
      model_id: row.data?.model_id ?? row.id,
      product_version: row.data?.product_version ?? "unknown",
      status: row.data?.status ?? "draft",
      threat_count: row.data?.threat_model?.summary?.total_threats ?? 0,
      gap_count: row.data?.gaps?.length ?? 0,
      recommendation_count: row.data?.recommendations?.length ?? 0,
      avg_rpn: row.data?.fmea?.summary?.avg_rpn ?? 0,
      created_at: row.created_at,
    }));
  } catch {
    return [];
  }
}

export async function getThreatModelById(
  id: string
): Promise<ThreatModelRecord | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("threat_models")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return data as ThreatModelRecord;
  } catch {
    return null;
  }
}

export async function getLatestThreatModel(
  productVersion?: string
): Promise<ThreatModelRecord | null> {
  try {
    const supabase = createAdminClient();
    let query = supabase
      .from("threat_models")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(1);

    // Filter by version if provided (stored in JSONB data field)
    // Note: JSONB filtering may not work with all Supabase versions,
    // fallback to client-side filter if needed

    const { data, error } = await query.single();
    if (error || !data) return null;

    const record = data as ThreatModelRecord;

    // Client-side version filter if specified
    if (productVersion && record.data?.product_version !== productVersion) {
      return null;
    }

    return record;
  } catch {
    return null;
  }
}

export interface ThreatModelStats {
  totalModels: number;
  totalThreats: number;
  criticalHighThreats: number;
  avgRpn: number;
  totalGaps: number;
  approvedCount: number;
  draftCount: number;
}

export async function getThreatModelStats(): Promise<ThreatModelStats> {
  const emptyStats: ThreatModelStats = {
    totalModels: 0,
    totalThreats: 0,
    criticalHighThreats: 0,
    avgRpn: 0,
    totalGaps: 0,
    approvedCount: 0,
    draftCount: 0,
  };

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("threat_models")
      .select("data");

    if (error || !data || data.length === 0) return emptyStats;

    let totalThreats = 0;
    let criticalHigh = 0;
    let totalRpn = 0;
    let rpnCount = 0;
    let totalGaps = 0;
    let approved = 0;
    let draft = 0;

    for (const row of data) {
      const d = row.data as ThreatModelData;
      if (!d) continue;

      const threats = d.threat_model?.threats ?? [];
      totalThreats += threats.length;
      criticalHigh += threats.filter(
        (t) => t.severity === "critical" || t.severity === "high"
      ).length;

      if (d.fmea?.summary?.avg_rpn) {
        totalRpn += d.fmea.summary.avg_rpn;
        rpnCount++;
      }

      totalGaps += d.gaps?.length ?? 0;

      if (d.status === "approved") approved++;
      if (d.status === "draft") draft++;
    }

    return {
      totalModels: data.length,
      totalThreats,
      criticalHighThreats: criticalHigh,
      avgRpn: rpnCount > 0 ? Math.round((totalRpn / rpnCount) * 10) / 10 : 0,
      totalGaps,
      approvedCount: approved,
      draftCount: draft,
    };
  } catch {
    return emptyStats;
  }
}

// ---------------------------------------------------------------------------
// Threat Model Report Queries
// ---------------------------------------------------------------------------

export async function getThreatModelReports(
  threatModelId: string
): Promise<ThreatModelReport[]> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("threat_model_reports")
      .select("*")
      .eq("threat_model_id", threatModelId)
      .order("created_at", { ascending: false });

    if (error || !data) return [];
    return data as ThreatModelReport[];
  } catch {
    return [];
  }
}

export async function getThreatModelReportById(
  id: string
): Promise<ThreatModelReport | null> {
  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("threat_model_reports")
      .select("*")
      .eq("id", id)
      .single();

    if (error || !data) return null;
    return data as ThreatModelReport;
  } catch {
    return null;
  }
}
