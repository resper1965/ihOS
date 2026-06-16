// src/app/api/reports/[id]/export/route.ts
// GET — generate and stream a PDF for a given intelligence_snapshot

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { renderToBuffer, Document, Page, Text, View, StyleSheet, Font } from "@react-pdf/renderer";
import React from "react";

export const dynamic = "force-dynamic";

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: "Helvetica",
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    backgroundColor: "#ffffff",
    color: "#1e293b",
  },
  headerBar: {
    backgroundColor: "#0f172a",
    marginHorizontal: -56,
    marginTop: -48,
    paddingHorizontal: 56,
    paddingTop: 32,
    paddingBottom: 24,
    marginBottom: 32,
  },
  brand: { fontSize: 20, fontFamily: "Helvetica-Bold", color: "#60a5fa", marginBottom: 4 },
  reportTitle: { fontSize: 14, color: "#e2e8f0", marginBottom: 2 },
  reportMeta: { fontSize: 8, color: "#94a3b8" },
  sectionTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#1e40af",
    marginTop: 24,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: "#bfdbfe",
  },
  paragraph: { fontSize: 9, lineHeight: 1.6, color: "#334155", marginBottom: 6 },
  table: { marginBottom: 12 },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: "#1e3a5f",
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 2,
  },
  tableHeaderCell: { fontSize: 8, color: "#e2e8f0", fontFamily: "Helvetica-Bold" },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: "#e2e8f0",
  },
  tableCell: { fontSize: 8, color: "#334155" },
  badge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    fontSize: 7,
    fontFamily: "Helvetica-Bold",
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
  const framework = snapshot.framework_code ?? "Todos os Frameworks";
  const type = snapshot.snapshot_type ?? "full_report";

  const typeLabel: Record<string, string> = {
    scorecard: "Scorecard de Conformidade",
    roi_path: "Caminho de ROI — Remediação",
    domain_breakdown: "Análise por Domínio",
    full_report: "Relatório Executivo Completo",
  };

  return React.createElement(
    Document,
    { title: `ihOS — ${typeLabel[type] ?? "Relatório"}`, author: "ihOS · Ionic Health" },
    React.createElement(
      Page,
      { size: "A4", style: styles.page },

      // Header
      React.createElement(
        View,
        { style: styles.headerBar },
        React.createElement(Text, { style: styles.brand }, "ihOS"),
        React.createElement(Text, { style: styles.reportTitle }, typeLabel[type] ?? "Relatório"),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Framework: ${framework}  ·  Gerado em: ${generatedAt}  ·  Ionic Health`
        )
      ),

      // Summary section
      React.createElement(Text, { style: styles.sectionTitle }, "Sumário Executivo"),
      React.createElement(
        Text,
        { style: styles.paragraph },
        data.summary ??
          `Este relatório apresenta a postura de conformidade atual para o framework ${framework}. ` +
            `Os dados foram coletados automaticamente pelo sistema ihOS e refletem o estado mais recente das avaliações de evidências.`
      ),

      // Score section (if available)
      ...(data.overall_score !== undefined
        ? [
            React.createElement(Text, { style: styles.sectionTitle }, "Score de Conformidade"),
            React.createElement(
              View,
              { style: { flexDirection: "row", gap: 16, marginBottom: 12 } },
              React.createElement(
                View,
                {
                  style: {
                    flex: 1,
                    backgroundColor: "#f0fdf4",
                    borderRadius: 6,
                    padding: 12,
                    borderLeftWidth: 3,
                    borderLeftColor: "#22c55e",
                  },
                },
                React.createElement(
                  Text,
                  { style: { fontSize: 24, fontFamily: "Helvetica-Bold", color: "#16a34a" } },
                  `${data.overall_score ?? 0}%`
                ),
                React.createElement(Text, { style: { fontSize: 8, color: "#4ade80" } }, "Score Geral")
              )
            ),
          ]
        : []),

      // Gaps section (if available)
      ...(Array.isArray(data.gaps) && data.gaps.length > 0
        ? [
            React.createElement(Text, { style: styles.sectionTitle }, "Gaps Identificados"),
            React.createElement(
              View,
              { style: styles.table },
              React.createElement(
                View,
                { style: styles.tableHeader },
                React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, "Controle"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 80 }] }, "Domínio"),
                React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, "Prioridade")
              ),
              ...data.gaps.slice(0, 20).map((gap: any, i: number) =>
                React.createElement(
                  View,
                  { key: String(i), style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? "#f8fafc" : "#fff" }] },
                  React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, gap.name ?? gap.code ?? "—"),
                  React.createElement(Text, { style: [styles.tableCell, { width: 80 }] }, gap.domain ?? "—"),
                  React.createElement(Text, { style: [styles.tableCell, { width: 60 }] }, gap.status ?? "—")
                )
              )
            ),
          ]
        : []),

      // Raw data fallback
      ...(Object.keys(data).length > 0 && !data.gaps && !data.overall_score
        ? [
            React.createElement(Text, { style: styles.sectionTitle }, "Dados do Snapshot"),
            React.createElement(
              Text,
              { style: styles.paragraph },
              JSON.stringify(data, null, 2).slice(0, 1200)
            ),
          ]
        : []),

      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, "ihOS · Ionic Health · Confidencial"),
        React.createElement(
          Text,
          { style: styles.footerText, render: ({ pageNumber, totalPages }: any) => `Página ${pageNumber} de ${totalPages}` }
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
    .eq("id", id)
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
    console.error("[PDF Export Error]", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
