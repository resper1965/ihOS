// src/app/(dashboard)/posture/page.tsx
// The observed axis, which until now existed only as one widget on Overview.
//
// A Server Component calling src/lib/posture/read.ts directly, matching the
// pattern /compliance uses. It does NOT call /api/posture: that route requires
// an explicit `controls` parameter and 400s without one, so a "thin page over
// the endpoint" would still have to decide which controls to ask about. The
// scope decided here is the controls that actually carry evidence — asking
// about controls with no evidence would report a wall of `gap` rows that say
// nothing about our posture and everything about the query.
//
// Spec: docs/superpowers/specs/2026-09-09-ui-information-architecture-design.md §6

import { createAdminClient } from '@/lib/supabase/admin';
import { groupPosture, rowsToLinks, summarise } from '@/lib/posture/read';
import { PageTitleRegistrar } from '@/components/dashboard/page-title-registrar';
import { Activity } from 'lucide-react';

export const dynamic = 'force-dynamic';

/** Matches MAX_CONTROLS in src/app/api/posture/route.ts, for the same reason. */
const MAX_CONTROLS = 500;
const EVIDENCE_PAGE_SIZE = 1000;

export default async function PosturePage() {
  const db = createAdminClient();

  // PostgREST caps a response at max-rows and gives no stable order between two
  // range() calls without .order(), so both reads below page explicitly and
  // order. A silently truncated page does not error — it drops rows, and
  // dropped evidence reads as a control downgrading for no reason tied to the
  // evidence itself.
  const evidenceRows: Array<Record<string, unknown>> = [];
  for (let from = 0; ; from += EVIDENCE_PAGE_SIZE) {
    const { data, error } = await db
      .from('control_evidence')
      .select('scf_control_code, product_version_id, chunk_id, document_id, role, score, snippet')
      .order('scf_control_code')
      .order('chunk_id')
      .range(from, from + EVIDENCE_PAGE_SIZE - 1);
    if (error) {
      return (
        <div className="w-full space-y-8">
          <PageTitleRegistrar
            title="Posture"
            subtitle="Could not read evidence"
            icon={<Activity className="h-4 w-4 text-primary" />}
          />
          <p className="text-sm text-danger">control_evidence: {error.message}</p>
        </div>
      );
    }
    const page = (data ?? []) as Array<Record<string, unknown>>;
    evidenceRows.push(...page);
    if (page.length < EVIDENCE_PAGE_SIZE) break;
  }

  const controlCodes = [...new Set(evidenceRows.map((r) => String(r.scf_control_code)))]
    .sort()
    .slice(0, MAX_CONTROLS);

  const postures = groupPosture(controlCodes, rowsToLinks(evidenceRows));
  const summary = summarise(postures);

  return (
    <div className="w-full space-y-8">
      <PageTitleRegistrar
        title="Posture"
        subtitle={`${controlCodes.length} controls carrying evidence`}
        icon={<Activity className="h-4 w-4 text-primary" />}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(['conforming', 'partial', 'informal', 'gap'] as const).map((verdict) => (
          <div
            key={verdict}
            className="rounded-2xl border border-border-glass bg-bg-card p-4"
          >
            <div className="text-2xl font-bold text-text-primary">{summary[verdict]}</div>
            <div className="text-xs uppercase tracking-wider text-text-muted">{verdict}</div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-2xl border border-border-glass bg-bg-card">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border-glass text-left text-xs uppercase tracking-wider text-text-muted">
              <th className="px-4 py-3">Control</th>
              <th className="px-4 py-3">Verdict</th>
              <th className="px-4 py-3">Policy evidence</th>
              <th className="px-4 py-3">Operational evidence</th>
            </tr>
          </thead>
          <tbody>
            {postures.map((p) => (
              <tr key={p.scfControlCode} className="border-b border-border-glass last:border-0">
                <td className="px-4 py-3 font-medium text-text-primary">{p.scfControlCode}</td>
                <td className="px-4 py-3 text-text-secondary">{p.verdict}</td>
                <td className="px-4 py-3 text-text-secondary">{p.policy.length}</td>
                <td className="px-4 py-3 text-text-secondary">{p.operational.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {controlCodes.length === MAX_CONTROLS && (
        <p className="text-xs text-text-muted">
          Showing the first {MAX_CONTROLS} controls by code. More carry evidence than are
          listed here.
        </p>
      )}
    </div>
  );
}
