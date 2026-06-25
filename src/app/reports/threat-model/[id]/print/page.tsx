// src/app/reports/threat-model/[id]/print/page.tsx
// Server-rendered print layout page for threat model reports

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  ThreatModelReport,
  ThreatModelReportData,
  StrideThreat,
  FmeaItem,
  SeverityLevel,
} from "@/lib/supabase";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const STRIDE_LABELS: Record<string, string> = {
  S: "Spoofing",
  T: "Tampering",
  R: "Repudiation",
  I: "Information Disclosure",
  D: "Denial of Service",
  E: "Elevation of Privilege",
};

const IMPACT_LABELS = ["Negligible", "Minor", "Moderate", "Major", "Critical"];
const LIKELIHOOD_LABELS = ["Rare", "Unlikely", "Possible", "Likely", "Almost Certain"];

function getRiskCellBg(risk: number): string {
  if (risk >= 20) return "bg-red-200";
  if (risk >= 15) return "bg-red-100";
  if (risk >= 10) return "bg-orange-100";
  if (risk >= 5) return "bg-yellow-100";
  return "bg-green-100";
}

function getPriorityBadge(priority: SeverityLevel): { bg: string; text: string } {
  switch (priority) {
    case "critical":
      return { bg: "bg-red-100", text: "text-red-800" };
    case "high":
      return { bg: "bg-orange-100", text: "text-orange-800" };
    case "medium":
      return { bg: "bg-yellow-100", text: "text-yellow-800" };
    case "low":
      return { bg: "bg-green-100", text: "text-green-800" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-800" };
  }
}

function getEffortBadge(effort: string): { bg: string; text: string } {
  switch (effort) {
    case "low":
      return { bg: "bg-green-100", text: "text-green-800" };
    case "medium":
      return { bg: "bg-yellow-100", text: "text-yellow-800" };
    case "high":
      return { bg: "bg-red-100", text: "text-red-800" };
    default:
      return { bg: "bg-gray-100", text: "text-gray-800" };
  }
}

function getRiskRatingBadge(rating: SeverityLevel): { bg: string; text: string } {
  switch (rating) {
    case "critical":
      return { bg: "bg-red-600", text: "text-white" };
    case "high":
      return { bg: "bg-orange-500", text: "text-white" };
    case "medium":
      return { bg: "bg-yellow-400", text: "text-yellow-900" };
    case "low":
      return { bg: "bg-green-500", text: "text-white" };
    default:
      return { bg: "bg-gray-400", text: "text-white" };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

export default async function ThreatModelPrintPage({ params }: PageProps) {
  const { id } = await params;
  const adminSupabase = createAdminClient();

  const { data: report, error } = await adminSupabase
    .from("threat_model_reports" as any)
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !report || !(report as any).report_data) {
    notFound();
  }

  const reportRecord = report as unknown as ThreatModelReport;
  const rd = reportRecord.report_data as ThreatModelReportData;

  const generatedAt = new Date(rd.generated_at || reportRecord.created_at).toLocaleDateString(
    "en-US",
    {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }
  );

  const exec = rd.executive_summary;
  const riskBadge = getRiskRatingBadge(exec.risk_rating);

  // Build risk matrix cell map
  const cellMap: Record<string, number> = {};
  for (const cell of rd.risk_matrix?.cells ?? []) {
    const key = `${cell.likelihood}-${cell.impact}`;
    cellMap[key] = (cellMap[key] ?? 0) + cell.count;
  }

  // FMEA items sorted by RPN desc, top 20
  const fmeaTop20 = [...(rd.fmea_analysis?.items ?? [])]
    .sort((a, b) => b.rpn - a.rpn)
    .slice(0, 20);

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans leading-relaxed print:p-4">
      {/* ═══════════════ COVER ═══════════════ */}
      <div className="border-b-4 border-black pb-8 mb-10">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">ihOS</h1>
            <p className="text-xs uppercase tracking-[0.3em] text-gray-500 font-bold mt-1">
              Intelligent Hardened Operating System
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500">Report ID</p>
            <p className="font-mono text-xs text-gray-700">{id}</p>
          </div>
        </div>

        <div className="mt-10">
          <h2 className="text-3xl font-extrabold text-gray-900">
            Threat Model Report
          </h2>
          <div className="mt-4 grid grid-cols-2 gap-4 text-sm bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div>
              <p className="font-semibold text-gray-600">Model ID:</p>
              <p className="font-bold font-mono text-gray-900">{rd.model_id}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-600">Product Version:</p>
              <p className="font-bold text-gray-900">{rd.product_version}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-600">Frameworks:</p>
              <p className="font-bold text-gray-900">
                {rd.frameworks?.join(", ") || "—"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-gray-600">Generated:</p>
              <p className="font-bold text-gray-900">{generatedAt}</p>
            </div>
            <div>
              <p className="font-semibold text-gray-600">Status:</p>
              <p className="font-bold text-gray-900 uppercase">{rd.status}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ═══════════════ EXECUTIVE SUMMARY ═══════════════ */}
      <div className="mb-10 page-break-after">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-6">
          1. Executive Summary
        </h2>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 text-center">
            <p className="text-3xl font-black text-gray-900">{exec.total_threats}</p>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase">Total Threats</p>
          </div>
          <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 text-center">
            <p className="text-3xl font-black text-red-600">{exec.critical_count}</p>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase">Critical</p>
          </div>
          <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 text-center">
            <p className="text-3xl font-black text-orange-600">{exec.high_count}</p>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase">High</p>
          </div>
          <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 text-center">
            <p className="text-3xl font-black text-amber-600">{exec.avg_rpn.toFixed(1)}</p>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase">Avg RPN</p>
          </div>
          <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 text-center">
            <p className="text-3xl font-black text-gray-900">{exec.total_gaps}</p>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase">Compliance Gaps</p>
          </div>
          <div className="border border-gray-200 p-4 rounded-lg bg-gray-50 text-center">
            <p className="text-3xl font-black text-gray-900">{exec.recommendations_count}</p>
            <p className="text-xs font-bold text-gray-500 mt-1 uppercase">Recommendations</p>
          </div>
        </div>

        <div className="flex items-center gap-3 mb-4">
          <span className="text-sm font-bold text-gray-700">Overall Risk Rating:</span>
          <span
            className={`rounded-lg px-3 py-1 text-sm font-black uppercase ${riskBadge.bg} ${riskBadge.text}`}
          >
            {exec.risk_rating}
          </span>
        </div>

        {exec.narrative && (
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 text-sm text-gray-700 leading-relaxed">
            {exec.narrative}
          </div>
        )}
      </div>

      {/* ═══════════════ RISK MATRIX ═══════════════ */}
      <div className="mb-10 page-break-before">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-6">
          2. Risk Assessment Matrix
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          5×5 Likelihood × Impact matrix showing threat distribution.
        </p>

        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="border border-gray-300 bg-gray-100 p-2 text-xs font-bold text-gray-600">
                Likelihood ↓ / Impact →
              </th>
              {IMPACT_LABELS.map((label) => (
                <th
                  key={label}
                  className="border border-gray-300 bg-gray-100 p-2 text-xs font-bold text-gray-600 text-center"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[5, 4, 3, 2, 1].map((likelihoodRow) => (
              <tr key={likelihoodRow}>
                <td className="border border-gray-300 bg-gray-50 p-2 text-xs font-semibold text-gray-700">
                  {LIKELIHOOD_LABELS[likelihoodRow - 1]}
                </td>
                {[1, 2, 3, 4, 5].map((impactCol) => {
                  const key = `${likelihoodRow}-${impactCol}`;
                  const risk = likelihoodRow * impactCol;
                  const count = cellMap[key] ?? 0;
                  return (
                    <td
                      key={key}
                      className={`border border-gray-300 p-2 text-center font-bold ${getRiskCellBg(risk)}`}
                    >
                      {count > 0 ? count : ""}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ═══════════════ STRIDE ANALYSIS ═══════════════ */}
      <div className="mb-10 page-break-before">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-6">
          3. STRIDE Analysis
        </h2>

        {Object.entries(rd.stride_analysis?.by_category ?? {}).map(
          ([category, data]) => {
            const catData = data as { count: number; threats: StrideThreat[] };
            return (
              <div key={category} className="mb-6">
                <h3 className="text-base font-bold text-gray-900 mb-2 flex items-center gap-2">
                  <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-gray-200 text-xs font-black text-gray-700">
                    {category}
                  </span>
                  {STRIDE_LABELS[category] ?? category}
                  <span className="text-sm font-normal text-gray-500">
                    ({catData.count} threat{catData.count !== 1 ? "s" : ""})
                  </span>
                </h3>

                {catData.threats && catData.threats.length > 0 && (
                  <table className="w-full border-collapse text-xs mb-2">
                    <thead>
                      <tr className="bg-gray-100 border-b border-gray-300">
                        <th className="py-1.5 px-2 text-left font-bold text-gray-600">Threat</th>
                        <th className="py-1.5 px-2 text-left font-bold text-gray-600">Component</th>
                        <th className="py-1.5 px-2 text-center font-bold text-gray-600">Severity</th>
                        <th className="py-1.5 px-2 text-center font-bold text-gray-600">RPN</th>
                      </tr>
                    </thead>
                    <tbody>
                      {catData.threats.map((threat) => {
                        const badge = getPriorityBadge(threat.severity);
                        return (
                          <tr
                            key={threat.id}
                            className="border-b border-gray-200"
                          >
                            <td className="py-1.5 px-2 text-gray-800 font-medium">
                              {threat.title}
                            </td>
                            <td className="py-1.5 px-2 text-gray-600">
                              {threat.affected_component}
                            </td>
                            <td className="py-1.5 px-2 text-center">
                              <span
                                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-black uppercase ${badge.bg} ${badge.text}`}
                              >
                                {threat.severity}
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-center font-bold text-gray-900">
                              {threat.rpn}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            );
          }
        )}
      </div>

      {/* ═══════════════ FMEA TOP 20 ═══════════════ */}
      <div className="mb-10 page-break-before">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-6">
          4. FMEA Analysis — Top 20 by RPN
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Failure Mode and Effects Analysis. RPN = Severity × Occurrence × Detection (max 1000).
        </p>

        {fmeaTop20.length > 0 ? (
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr className="bg-gray-100 border-b border-gray-300">
                <th className="py-2 px-2 text-left font-bold text-gray-600">#</th>
                <th className="py-2 px-2 text-left font-bold text-gray-600">Failure Mode</th>
                <th className="py-2 px-2 text-center font-bold text-gray-600">S</th>
                <th className="py-2 px-2 text-center font-bold text-gray-600">O</th>
                <th className="py-2 px-2 text-center font-bold text-gray-600">D</th>
                <th className="py-2 px-2 text-center font-bold text-gray-600">RPN</th>
                <th className="py-2 px-2 text-left font-bold text-gray-600">
                  Recommended Action
                </th>
              </tr>
            </thead>
            <tbody>
              {fmeaTop20.map((item, idx) => (
                <tr key={idx} className="border-b border-gray-200">
                  <td className="py-1.5 px-2 text-gray-500 font-mono">{idx + 1}</td>
                  <td className="py-1.5 px-2 text-gray-800 font-medium max-w-[200px]">
                    {item.failure_mode}
                  </td>
                  <td className="py-1.5 px-2 text-center font-bold text-gray-900">
                    {item.severity}
                  </td>
                  <td className="py-1.5 px-2 text-center font-bold text-gray-900">
                    {item.occurrence}
                  </td>
                  <td className="py-1.5 px-2 text-center font-bold text-gray-900">
                    {item.detection}
                  </td>
                  <td
                    className={`py-1.5 px-2 text-center font-black ${
                      item.rpn >= 200
                        ? "text-red-700"
                        : item.rpn >= 100
                          ? "text-amber-700"
                          : "text-green-700"
                    }`}
                  >
                    {item.rpn}
                  </td>
                  <td className="py-1.5 px-2 text-gray-600 max-w-[200px]">
                    {item.recommended_action}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-gray-500 italic">No FMEA data available.</p>
        )}
      </div>

      {/* ═══════════════ GAP ANALYSIS ═══════════════ */}
      <div className="mb-10 page-break-before">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-6">
          5. Gap Analysis
        </h2>

        {rd.gap_analysis && rd.gap_analysis.length > 0 ? (
          <div className="space-y-4">
            {rd.gap_analysis.map((gap, idx) => {
              const badge = getPriorityBadge(gap.priority);
              return (
                <div
                  key={gap.id || idx}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-xs bg-gray-200 text-gray-800 px-2 py-0.5 rounded">
                        {idx + 1}. {gap.gap_type}
                      </span>
                      <h4 className="font-bold text-sm text-gray-900">{gap.title}</h4>
                    </div>
                    <span
                      className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${badge.bg} ${badge.text}`}
                    >
                      {gap.priority}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 mt-2">{gap.description}</p>
                  {gap.affected_controls && gap.affected_controls.length > 0 && (
                    <p className="text-[10px] text-gray-500 mt-2">
                      <span className="font-bold">Affected Controls:</span>{" "}
                      {gap.affected_controls.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No gaps identified.</p>
        )}
      </div>

      {/* ═══════════════ RECOMMENDATIONS ═══════════════ */}
      <div className="mb-10 page-break-before">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-6">
          6. Recommendations
        </h2>

        {rd.recommendations && rd.recommendations.length > 0 ? (
          <div className="space-y-4">
            {rd.recommendations.map((rec, idx) => {
              const prBadge = getPriorityBadge(rec.priority);
              const efBadge = getEffortBadge(rec.effort);
              return (
                <div
                  key={rec.id || idx}
                  className="border border-gray-200 rounded-lg p-4 bg-gray-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-gray-900">
                        {idx + 1}. {rec.title}
                      </h4>
                      <p className="text-xs text-gray-600 mt-1">{rec.description}</p>
                      {rec.frameworks && rec.frameworks.length > 0 && (
                        <p className="text-[10px] text-gray-500 mt-2">
                          <span className="font-bold">Frameworks:</span>{" "}
                          {rec.frameworks.join(", ")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-[10px] font-black uppercase px-2 py-0.5 rounded ${prBadge.bg} ${prBadge.text}`}
                      >
                        {rec.priority}
                      </span>
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded ${efBadge.bg} ${efBadge.text}`}
                      >
                        {rec.effort} effort
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No recommendations available.</p>
        )}
      </div>

      {/* ═══════════════ FOOTER ═══════════════ */}
      <div className="mt-16 border-t-2 border-gray-300 pt-8">
        <div className="flex justify-between items-center text-xs text-gray-500">
          <div>
            <p className="font-bold">Generated by ihOS GRC Platform</p>
            <p className="mt-1">
              This report was generated automatically by the ihOS threat
              modeling engine. The information is based on automated analysis of
              ISMS documents, STRIDE threat modeling, and FMEA risk
              quantification.
            </p>
          </div>
          <p className="shrink-0 ml-8">© {new Date().getFullYear()} ihOS</p>
        </div>
        <p className="text-[10px] text-gray-400 mt-4 italic">
          Disclaimer: This automated analysis should be reviewed by qualified
          security professionals. It does not constitute a complete security
          assessment and should be used as a supporting tool in the risk
          management process.
        </p>
      </div>

      {/* Print styles + auto-print trigger */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media print {
              .no-print { display: none !important; }
              .page-break-before { page-break-before: always; }
              .page-break-after { page-break-after: always; }
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
          `,
        }}
      />
      <script
        dangerouslySetInnerHTML={{
          __html: `
            window.addEventListener('load', () => {
              setTimeout(() => {
                window.print();
              }, 1000);
            });
          `,
        }}
      />
    </div>
  );
}
