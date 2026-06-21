// src/app/reports/[id]/print/page.tsx
// Server-rendered print layout page for compliance reports

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function PrintReportPage({ params }: PageProps) {
  const { id } = await params;
  const adminSupabase = createAdminClient();

  const { data: snapshot, error } = await adminSupabase
    .from("intelligence_snapshots")
    .select("*")
    .eq("id", id)
    .eq("snapshot_type", "full_report")
    .maybeSingle();

  if (error || !snapshot || !snapshot.snapshot_data) {
    notFound();
  }

  const reportData = snapshot.snapshot_data as any;
  const generatedAt = new Date(snapshot.created_at || "").toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="bg-white text-black min-h-screen p-8 max-w-4xl mx-auto font-sans leading-relaxed">
      {/* Header */}
      <div className="border-b-2 border-black pb-4 mb-8 flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">ihOS</h1>
          <p className="text-xs uppercase tracking-widest text-gray-500 font-bold">
            Intelligent Hardened Operating System
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold">GRC Compliance Report</p>
          <p className="text-xs text-gray-500">Generated at: {generatedAt}</p>
        </div>
      </div>

      {/* Metadata */}
      <div className="grid grid-cols-2 gap-4 mb-8 bg-gray-50 p-4 rounded-lg text-sm border border-gray-200">
        <div>
          <p className="font-semibold text-gray-600">Primary Framework:</p>
          <p className="font-bold text-gray-900">{snapshot.framework_code || "Multiple"}</p>
        </div>
        <div>
          <p className="font-semibold text-gray-600">Report ID:</p>
          <p className="font-mono text-gray-900">{id}</p>
        </div>
      </div>

      {/* Summary */}
      <div className="mb-8">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">
          1. Executive Summary
        </h2>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div className="border border-gray-200 p-3 rounded-lg bg-gray-50">
            <p className="text-2xl font-black text-primary">
              {reportData.summary?.complianceRate ?? 0}%
            </p>
            <p className="text-xs font-bold text-gray-500 mt-1">Compliance Rate</p>
          </div>
          <div className="border border-gray-200 p-3 rounded-lg bg-gray-50">
            <p className="text-2xl font-black text-gray-900">
              {reportData.summary?.total ?? 0}
            </p>
            <p className="text-xs font-bold text-gray-500 mt-1">Controls Assessed</p>
          </div>
          <div className="border border-gray-200 p-3 rounded-lg bg-gray-50">
            <p className="text-2xl font-black text-emerald-600">
              {reportData.summary?.compliant ?? 0}
            </p>
            <p className="text-xs font-bold text-gray-500 mt-1">Compliant</p>
          </div>
          <div className="border border-gray-200 p-3 rounded-lg bg-gray-50">
            <p className="text-2xl font-black text-red-600">
              {reportData.summary?.nonCompliant ?? 0}
            </p>
            <p className="text-xs font-bold text-gray-500 mt-1">Non-Compliant</p>
          </div>
        </div>
      </div>

      {/* Domain Breakdown */}
      <div className="mb-8 page-break-after">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">
          2. Compliance by Domain
        </h2>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-400 bg-gray-50">
              <th className="py-2 px-3 font-bold">Domain</th>
              <th className="py-2 px-3 font-bold text-center">Assessments</th>
              <th className="py-2 px-3 font-bold text-center">Compliant</th>
              <th className="py-2 px-3 font-bold text-right">Rate</th>
            </tr>
          </thead>
          <tbody>
            {(reportData.domainBreakdown || []).map((dom: any, index: number) => (
              <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-2 px-3 font-semibold text-gray-800">{dom.domain}</td>
                <td className="py-2 px-3 text-center">{dom.total}</td>
                <td className="py-2 px-3 text-center text-emerald-600 font-semibold">{dom.compliant}</td>
                <td className="py-2 px-3 text-right font-black text-gray-950">{dom.rate}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Remediation Plan (ROI Path) */}
      <div className="mb-8 page-break-before">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">
          3. Prioritized Remediation Plan (ROI)
        </h2>
        <p className="text-xs text-gray-500 mb-4">
          Recommended actions ordered by compliance return on investment (ROI), crossing security impact with remediation cost.
        </p>
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-gray-400 bg-gray-50">
              <th className="py-2 px-3 font-bold w-24">Control</th>
              <th className="py-2 px-3 font-bold">Description/Name</th>
              <th className="py-2 px-3 font-bold text-center w-24">ROI Score</th>
              <th className="py-2 px-3 font-bold text-right w-36">Frameworks</th>
            </tr>
          </thead>
          <tbody>
            {(reportData.roiPath || []).slice(0, 15).map((item: any, index: number) => (
              <tr key={index} className="border-b border-gray-200 hover:bg-gray-50">
                <td className="py-2 px-3 font-mono font-bold text-gray-900">{item.controlId || item.code}</td>
                <td className="py-2 px-3 text-gray-700">{item.controlName || item.name}</td>
                <td className="py-2 px-3 text-center font-bold text-primary">{item.roiScore || item.roi}</td>
                <td className="py-2 px-3 text-right text-xs text-gray-500">
                  {Array.isArray(item.frameworks) ? item.frameworks.join(", ") : item.frameworks || ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Top Gaps Detail */}
      <div className="mb-8 page-break-before">
        <h2 className="text-xl font-bold border-b border-gray-300 pb-2 mb-4">
          4. Detail of Identified Gaps
        </h2>
        <div className="space-y-6">
          {(reportData.topGaps || []).slice(0, 10).map((gap: any, index: number) => (
            <div key={index} className="border border-gray-300 p-4 rounded-lg bg-gray-50">
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono font-bold bg-gray-200 text-gray-800 px-2 py-0.5 rounded text-xs">
                    {gap.code}
                  </span>
                  <h3 className="font-bold text-sm text-gray-900">{gap.name}</h3>
                </div>
                <span className={`text-xs font-black uppercase px-2 py-0.5 rounded ${
                  gap.status === "critical" ? "bg-red-100 text-red-800" :
                  gap.status === "high" ? "bg-orange-100 text-orange-800" :
                  gap.status === "medium" ? "bg-yellow-100 text-yellow-800" :
                  "bg-green-100 text-green-800"
                }`}>
                  {gap.status}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-2">Domain: {gap.domain}</p>
              
              {gap.missingElements && gap.missingElements.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-bold text-gray-600 mb-1">Missing Elements:</p>
                  <ul className="list-disc pl-5 text-xs text-gray-700 space-y-0.5">
                    {gap.missingElements.map((el: string, idx: number) => (
                      <li key={idx}>{el}</li>
                    ))}
                  </ul>
                </div>
              )}

              {gap.auditorNotes && (
                <div>
                  <p className="text-xs font-bold text-gray-600 mb-1">Auditor Notes:</p>
                  <p className="text-xs text-gray-600 italic bg-white p-2 rounded border border-gray-200">
                    {gap.auditorNotes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Footer / Signature */}
      <div className="mt-16 border-t border-gray-300 pt-8 flex justify-between items-center text-xs text-gray-500">
        <p>© 2026 ihOS GRC Platform. All rights reserved.</p>
        <p>GRC Compliance Digital Signature</p>
      </div>

      {/* Auto print trigger */}
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
