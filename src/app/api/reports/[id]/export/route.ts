// src/app/api/reports/[id]/export/route.ts
// GET — generate and stream a PDF for a given intelligence_snapshot

import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 9,
    paddingTop: 54,
    paddingBottom: 54,
    paddingHorizontal: 56,
    backgroundColor: "#ffffff",
    color: "#1e293b",
  },
  coverPage: {
    fontFamily: "Helvetica",
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    backgroundColor: "#0f172a",
  },
  coverContent: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 56,
  },
  coverBrand: {
    fontSize: 32,
    fontFamily: "Helvetica-Bold",
    color: "#3DC2C2",
    marginBottom: 12,
  },
  coverTitle: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#e2e8f0",
    marginBottom: 6,
    textAlign: "center",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  coverSubtitle: {
    fontSize: 11,
    color: "#94a3b8",
    textAlign: "center",
    marginBottom: 32,
  },
  coverMetaContainer: {
    borderTopWidth: 1,
    borderTopColor: "#334155",
    paddingTop: 16,
    width: "80%",
    alignItems: "center",
  },
  coverMetaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginBottom: 6,
  },
  coverMetaLabel: {
    fontSize: 8,
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
  },
  coverMetaValue: {
    fontSize: 8,
    color: "#94a3b8",
  },
  coverClassification: {
    marginTop: 24,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#ef4444",
    color: "#ffffff",
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
    borderRadius: 2,
    letterSpacing: 1,
  },
  innerHeader: {
    position: "absolute",
    top: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    borderBottomWidth: 0.5,
    borderBottomColor: "#cbd5e1",
    paddingBottom: 4,
  },
  innerHeaderTitle: {
    fontSize: 7,
    color: "#94a3b8",
    fontFamily: "Helvetica-Bold",
  },
  innerHeaderBrand: {
    fontSize: 7,
    color: "#3DC2C2",
    fontFamily: "Helvetica-Bold",
  },
  headerBar: {
    backgroundColor: "#0f172a",
    marginHorizontal: -56,
    marginTop: -54,
    paddingHorizontal: 56,
    paddingTop: 28,
    paddingBottom: 20,
    marginBottom: 20,
  },
  brand: { fontSize: 16, fontFamily: "Helvetica-Bold", color: "#3DC2C2", marginBottom: 2 },
  reportTitle: { fontSize: 12, color: "#e2e8f0", marginBottom: 2 },
  reportMeta: { fontSize: 7, color: "#94a3b8" },
  sectionTitle: {
    fontSize: 10,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
    marginTop: 18,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#3DC2C2",
  },
  paragraph: { fontSize: 8.5, lineHeight: 1.5, color: "#334155", marginBottom: 8 },
  metricsRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    backgroundColor: "#f8fafc",
    borderRadius: 4,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: "#3DC2C2",
    alignItems: "center",
  },
  metricValue: {
    fontSize: 16,
    fontFamily: "Helvetica-Bold",
    color: "#0f172a",
  },
  metricLabel: { fontSize: 7, color: "#64748b", marginTop: 2, textAlign: "center" },
  table: { marginBottom: 12 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#0f172a",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 2,
  },
  tableHeaderCell: { fontSize: 7.5, color: "#e2e8f0", fontFamily: "Helvetica-Bold" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4.5,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableCell: { fontSize: 7.5, color: "#334155" },
  badge: {
    paddingHorizontal: 5,
    paddingVertical: 1.5,
    borderRadius: 3,
    fontSize: 6.5,
    fontFamily: "Helvetica-Bold",
  },
  badgeCritical: {
    backgroundColor: "#fef2f2",
    color: "#991b1b",
    borderWidth: 0.5,
    borderColor: "#f87171",
  },
  badgeHigh: {
    backgroundColor: "#fff7ed",
    color: "#c2410c",
    borderWidth: 0.5,
    borderColor: "#fb923c",
  },
  badgeMedium: {
    backgroundColor: "#fef3c7",
    color: "#92400e",
    borderWidth: 0.5,
    borderColor: "#fbbf24",
  },
  badgeLow: {
    backgroundColor: "#f0fdf4",
    color: "#166534",
    borderWidth: 0.5,
    borderColor: "#4ade80",
  },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 0.5,
    borderTopColor: "#e2e8f0",
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: "#94a3b8" },
  disclaimer: {
    fontSize: 7,
    color: "#94a3b8",
    marginTop: 16,
    fontStyle: "italic",
    lineHeight: 1.4,
  },
});

// ── PDF Document ─────────────────────────────────────────────────────────────

function ComplianceReportPDF({
  snapshot,
  generatedAt,
}: {
  snapshot: any;
  generatedAt: string;
}) {
  const data = snapshot.snapshot_data ?? {};
  const framework = snapshot.framework_code ?? "All Frameworks";
  const type = snapshot.snapshot_type ?? "full_report";

  const typeLabel: Record<string, string> = {
    scorecard: "Compliance Scorecard",
    roi_path: "ROI Path — Remediation",
    domain_breakdown: "Domain Breakdown",
    full_report: "Complete Executive Report",
  };

  const summaryObj = (data.summary && typeof data.summary === 'object') ? data.summary : null;
  const summaryText = typeof data.summary === 'string'
    ? data.summary
    : summaryObj
    ? `Compliance Summary: Out of ${summaryObj.total ?? 0} total evaluated controls, ${summaryObj.compliant ?? 0} are compliant and ${summaryObj.nonCompliant ?? 0} are non-compliant. The overall compliance rate is ${summaryObj.complianceRate ?? 0}% with an average evaluation confidence of ${summaryObj.avgConfidence ?? 0}%.`
    : `This report presents the current compliance posture for the ${framework} framework. The data was automatically collected by the ihOS system and reflects the most recent state of evidence evaluations.`;

  const complianceScore = summaryObj?.complianceRate ?? data.overall_score ?? 0;
  const totalControls = summaryObj?.total ?? data.evaluationCount ?? 0;
  const compliantControls = summaryObj?.compliant ?? 0;
  const nonCompliantControls = summaryObj?.nonCompliant ?? 0;
  const avgConfidence = summaryObj?.avgConfidence ?? 0;

  const complianceColor = complianceScore >= 80
    ? "#16a34a" // green
    : complianceScore >= 50
    ? "#d97706" // amber
    : "#dc2626"; // red

  const domainBreakdown = data.domainBreakdown || data.domain_breakdown || [];
  const gaps = data.gaps || data.topGaps || [];
  const roiPath = data.roiPath || data.roi_path || data.recommended_path || [];

  return React.createElement(
    Document,
    { title: `ihOS — ${typeLabel[type] ?? "Report"}`, author: "ihOS · Ionic Health" },
    
    // Cover Page
    React.createElement(
      Page,
      { size: "A4", style: styles.coverPage },
      React.createElement(
        View,
        { style: styles.coverContent },
        React.createElement(Text, { style: styles.coverBrand }, "ihOS"),
        React.createElement(Text, { style: styles.coverTitle }, typeLabel[type] ?? "Compliance Assessment Report"),
        React.createElement(Text, { style: styles.coverSubtitle }, "Executive GRC Mapping & Gap Analysis"),
        React.createElement(
          View,
          { style: styles.coverMetaContainer },
          React.createElement(
            View,
            { style: styles.coverMetaRow },
            React.createElement(Text, { style: styles.coverMetaLabel }, "Framework:"),
            React.createElement(Text, { style: styles.coverMetaValue }, framework)
          ),
          React.createElement(
            View,
            { style: styles.coverMetaRow },
            React.createElement(Text, { style: styles.coverMetaLabel }, "Generated On:"),
            React.createElement(Text, { style: styles.coverMetaValue }, generatedAt)
          ),
          React.createElement(
            View,
            { style: styles.coverMetaRow },
            React.createElement(Text, { style: styles.coverMetaLabel }, "Platform:"),
            React.createElement(Text, { style: styles.coverMetaValue }, "ihOS by Ionic Health")
          )
        ),
        React.createElement(Text, { style: styles.coverClassification }, "CONFIDENTIAL")
      )
    ),

    // Content Page
    React.createElement(
      Page,
      { size: "A4", style: styles.page },
      // Inner Header (fixed on content page)
      React.createElement(
        View,
        { style: styles.innerHeader, fixed: true },
        React.createElement(Text, { style: styles.innerHeaderTitle }, `${typeLabel[type] ?? "Report"} · ${framework}`),
        React.createElement(Text, { style: styles.innerHeaderBrand }, "ihOS by Ionic Health")
      ),

      // Header Bar on first content page
      React.createElement(
        View,
        { style: styles.headerBar },
        React.createElement(Text, { style: styles.brand }, "ihOS"),
        React.createElement(Text, { style: styles.reportTitle }, typeLabel[type] ?? "Report"),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Framework: ${framework}  ·  Generated: ${generatedAt}`
        )
      ),

      // Executive Summary
      React.createElement(Text, { style: styles.sectionTitle }, "Executive Summary"),
      React.createElement(Text, { style: styles.paragraph }, summaryText),

      // Metrics Row
      React.createElement(
        View,
        { style: styles.metricsRow },
        React.createElement(
          View,
          { style: [styles.metricBox, { borderLeftColor: complianceColor }] },
          React.createElement(Text, { style: [styles.metricValue, { color: complianceColor }] }, `${complianceScore}%`),
          React.createElement(Text, { style: styles.metricLabel }, "Compliance Score")
        ),
        React.createElement(
          View,
          { style: styles.metricBox },
          React.createElement(Text, { style: styles.metricValue }, String(totalControls)),
          React.createElement(Text, { style: styles.metricLabel }, "Total Controls")
        ),
        React.createElement(
          View,
          { style: [styles.metricBox, { borderLeftColor: "#22c55e" }] },
          React.createElement(Text, { style: [styles.metricValue, { color: "#16a34a" }] }, String(compliantControls)),
          React.createElement(Text, { style: styles.metricLabel }, "Compliant")
        ),
        React.createElement(
          View,
          { style: [styles.metricBox, { borderLeftColor: "#ef4444" }] },
          React.createElement(Text, { style: [styles.metricValue, { color: "#dc2626" }] }, String(nonCompliantControls)),
          React.createElement(Text, { style: styles.metricLabel }, "Non-Compliant")
        ),
        React.createElement(
          View,
          { style: [styles.metricBox, { borderLeftColor: "#3b82f6" }] },
          React.createElement(Text, { style: [styles.metricValue, { color: "#2563eb" }] }, `${avgConfidence}%`),
          React.createElement(Text, { style: styles.metricLabel }, "Avg Confidence")
        )
      ),

      // Domain Breakdown section (if available)
      ...(domainBreakdown.length > 0
        ? [
            React.createElement(Text, { style: styles.sectionTitle }, "Domain Performance Breakdown"),
            React.createElement(
              View,
              { style: styles.table },
              React.createElement(
                View,
                { style: styles.tableHeader },
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 80 }] }, "Domain Code"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, "Total Controls"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 80 }] }, "Compliant"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 80 }] }, "Compliance Rate")
              ),
              ...domainBreakdown.map((d: any, i: number) =>
                React.createElement(
                  View,
                  { key: String(i), style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff" }] },
                  React.createElement(Text, { style: [styles.tableCell, { width: 80, fontFamily: "Helvetica-Bold" }] }, d.domain),
                  React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, String(d.total)),
                  React.createElement(Text, { style: [styles.tableCell, { width: 80 }] }, String(d.compliant)),
                  React.createElement(Text, { style: [styles.tableCell, { width: 80, fontFamily: "Helvetica-Bold" }] }, `${d.rate ?? 0}%`)
                )
              )
            ),
          ]
        : []),

      // Gaps section (if available)
      ...(gaps.length > 0
        ? [
            React.createElement(Text, { style: styles.sectionTitle }, "Identified Compliance Gaps (Top Gaps)"),
            React.createElement(
              View,
              { style: styles.table },
              React.createElement(
                View,
                { style: styles.tableHeader },
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, "Control"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, "Domain"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, "Control Name"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 50 }] }, "Severity"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 45 }] }, "Confidence")
              ),
              ...gaps.slice(0, 15).map((gap: any, i: number) => {
                const sev = String(gap.status || "low").toLowerCase();
                const badgeStyle = [
                  styles.badge,
                  sev === "critical"
                    ? styles.badgeCritical
                    : sev === "high"
                    ? styles.badgeHigh
                    : sev === "medium"
                    ? styles.badgeMedium
                    : styles.badgeLow,
                ];
                return React.createElement(
                  View,
                  { key: String(i), style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff" }] },
                  React.createElement(Text, { style: [styles.tableCell, { width: 60, fontFamily: "Helvetica-Bold" }] }, gap.code || "—"),
                  React.createElement(Text, { style: [styles.tableCell, { width: 60 }] }, gap.domain || "—"),
                  React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, gap.name || "—"),
                  React.createElement(
                    View,
                    { style: { width: 50, justifyContent: "center", alignItems: "flex-start" } },
                    React.createElement(Text, { style: badgeStyle }, sev.toUpperCase())
                  ),
                  React.createElement(Text, { style: [styles.tableCell, { width: 45 }] }, `${gap.confidence ?? 0}%`)
                );
              })
            ),
          ]
        : []),

      // Remediation Roadmap (ROI Path) section (if available)
      ...(roiPath.length > 0
        ? [
            React.createElement(Text, { style: styles.sectionTitle }, "Remediation Roadmap & Action Plan (ROI Path)"),
            React.createElement(
              View,
              { style: styles.table },
              React.createElement(
                View,
                { style: styles.tableHeader },
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 30 }] }, "Step"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, "Control ID"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, "Control Name"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 55 }] }, "ROI Score")
              ),
              ...roiPath.slice(0, 15).map((item: any, i: number) =>
                React.createElement(
                  View,
                  { key: String(i), style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff" }] },
                  React.createElement(Text, { style: [styles.tableCell, { width: 30, fontFamily: "Helvetica-Bold" }] }, String(i + 1)),
                  React.createElement(Text, { style: [styles.tableCell, { width: 60 }] }, item.controlId || item.code || "—"),
                  React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, item.controlName || item.name || "—"),
                  React.createElement(Text, { style: [styles.tableCell, { width: 55, fontFamily: "Helvetica-Bold" }] }, String(item.roiScore || item.roi || 0))
                )
              )
            ),
          ]
        : []),

      // Disclaimer
      React.createElement(
        Text,
        { style: styles.disclaimer },
        "This report was generated automatically by ihOS. The assessment results and remediation recommendations are based on automated evidence triage and natural language processing. Qualified governance, risk, and compliance professionals should review all suggestions prior to implementing control modifications."
      ),

      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, "ihOS · Ionic Health · Confidential"),
        React.createElement(
          Text,
          { style: styles.footerText, render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}` }
        )
      )
    )
  );
}

// ── Route Handler ─────────────────────────────────────────────────────────────

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const { data: snapshot, error } = await supabase
    .from("intelligence_snapshots")
    .select("*")
    .eq("id", Number(id))
    .single();

  if (error || !snapshot) {
    return NextResponse.json({ error: "Report not found" }, { status: 404 });
  }

  const generatedAt = new Date().toLocaleString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  try {
    const pdfBuffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(ComplianceReportPDF, { snapshot, generatedAt }) as any
    );

    const filename = `ihOS-report-${snapshot.snapshot_type}-${id.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.byteLength),
      },
    });
  } catch (err) {
    logger.error("PDF Export Error", { context: "reports/export", error: err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
