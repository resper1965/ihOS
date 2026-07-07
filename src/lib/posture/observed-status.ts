// src/lib/posture/observed-status.ts
// The ANALYTICAL posture axis. Derives an "observed at runtime" status per
// SCF control from runtime_control_signals (fed by DefectDojo et al.).
//
// This axis NEVER overwrites the documental verdict
// (conforming/partial/informal/gap) — the two views are read side by side:
// a control can be documentally `conforming` and observedly `violated`.

import type { SupabaseClient } from '@supabase/supabase-js';
import { logger } from '@/lib/logger';

export type ObservedStatus = 'violated' | 'degraded' | 'clean';

export interface RuntimeSignal {
  scf_control_code: string;
  severity: 'Critical' | 'High' | 'Medium' | 'Low' | 'Info';
  active: boolean;
  risk_accepted: boolean;
  is_mitigated: boolean;
}

export interface ObservedControlStatus {
  scfControlCode: string;
  status: ObservedStatus;
  activeSignals: number;
  criticalOrHigh: number;
  riskAccepted: number;
}

export interface ObservedPostureSummary {
  violated: ObservedControlStatus[];
  degraded: ObservedControlStatus[];
  totalSignals: number;
  lastSyncedAt: string | null;
}

/**
 * Pure derivation for one control's signals:
 * - violated: any live (active, not mitigated, not risk-accepted) Critical/High
 * - degraded: any other live signal, or a risk-accepted Critical/High
 *   (accepted risk is still observable exposure, just governed)
 * - clean: nothing live
 */
export function deriveObservedStatus(signals: RuntimeSignal[]): ObservedStatus {
  let hasLive = false;
  let hasAcceptedSevere = false;

  for (const s of signals) {
    if (!s.active || s.is_mitigated) continue;
    const severe = s.severity === 'Critical' || s.severity === 'High';
    if (s.risk_accepted) {
      if (severe) hasAcceptedSevere = true;
      continue;
    }
    if (severe) return 'violated';
    if (s.severity !== 'Info') hasLive = true;
  }

  return hasLive || hasAcceptedSevere ? 'degraded' : 'clean';
}

/** Group raw signal rows by SCF control and derive each control's status. */
export function summarizeSignals(
  rows: Array<RuntimeSignal & { synced_at?: string }>,
): Omit<ObservedPostureSummary, 'lastSyncedAt'> & { lastSyncedAt: string | null } {
  const byControl = new Map<string, RuntimeSignal[]>();
  let lastSyncedAt: string | null = null;

  for (const row of rows) {
    const list = byControl.get(row.scf_control_code) ?? [];
    list.push(row);
    byControl.set(row.scf_control_code, list);
    if (row.synced_at && (!lastSyncedAt || row.synced_at > lastSyncedAt)) {
      lastSyncedAt = row.synced_at;
    }
  }

  const violated: ObservedControlStatus[] = [];
  const degraded: ObservedControlStatus[] = [];

  for (const [code, signals] of byControl) {
    const status = deriveObservedStatus(signals);
    if (status === 'clean') continue;

    const live = signals.filter((s) => s.active && !s.is_mitigated);
    const entry: ObservedControlStatus = {
      scfControlCode: code,
      status,
      activeSignals: live.length,
      criticalOrHigh: live.filter((s) => s.severity === 'Critical' || s.severity === 'High').length,
      riskAccepted: live.filter((s) => s.risk_accepted).length,
    };
    (status === 'violated' ? violated : degraded).push(entry);
  }

  const bySeverityThenCode = (a: ObservedControlStatus, b: ObservedControlStatus) =>
    b.criticalOrHigh - a.criticalOrHigh || a.scfControlCode.localeCompare(b.scfControlCode);
  violated.sort(bySeverityThenCode);
  degraded.sort(bySeverityThenCode);

  return { violated, degraded, totalSignals: rows.length, lastSyncedAt };
}

/**
 * Load the observed posture for a product version (plus org-wide signals,
 * which apply to every version). `productVersionId` undefined = everything.
 */
export async function getObservedPosture(
  admin: SupabaseClient,
  productVersionId?: string | null,
): Promise<ObservedPostureSummary> {
  // runtime_control_signals is newer than the generated Supabase types.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (admin as any)
    .from('runtime_control_signals')
    .select('scf_control_code, severity, active, risk_accepted, is_mitigated, synced_at, product_version_id')
    .eq('active', true);

  if (productVersionId) {
    query = query.or(`product_version_id.eq.${productVersionId},product_version_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    // Table may not exist yet (migration not applied) — degrade to empty.
    logger.warn('Observed posture query failed', {
      context: 'posture/observed-status',
      meta: { error: error.message },
    });
    return { violated: [], degraded: [], totalSignals: 0, lastSyncedAt: null };
  }

  return summarizeSignals((data ?? []) as Array<RuntimeSignal & { synced_at?: string }>);
}
