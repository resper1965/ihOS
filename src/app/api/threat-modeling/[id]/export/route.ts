// src/app/api/threat-modeling/[id]/export/route.ts
// GET — export threat model report as PDF or Excel (?format=pdf|excel)

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  renderToBuffer,
  Document,
  Page,
  Text,
  View,
  StyleSheet,
} from '@react-pdf/renderer';
import React from 'react';
import * as XLSX from 'xlsx';
import type {
  ThreatModelReport,
  ThreatModelReportData,
  StrideThreat,
  FmeaItem,
} from '@/lib/supabase/types';

export const dynamic = 'force-dynamic';

// ── PDF Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Helvetica',
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 48,
    paddingHorizontal: 56,
    backgroundColor: '#ffffff',
    color: '#1e293b',
  },
  coverPage: {
    fontFamily: 'Helvetica',
    paddingTop: 0,
    paddingBottom: 0,
    paddingHorizontal: 0,
    backgroundColor: '#0f172a',
  },
  coverContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 56,
  },
  coverBrand: {
    fontSize: 36,
    fontFamily: 'Helvetica-Bold',
    color: '#3DC2C2',
    marginBottom: 8,
  },
  coverTitle: {
    fontSize: 18,
    color: '#e2e8f0',
    marginBottom: 4,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: 11,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 24,
  },
  coverMeta: {
    fontSize: 9,
    color: '#64748b',
    textAlign: 'center',
  },
  headerBar: {
    backgroundColor: '#0f172a',
    marginHorizontal: -56,
    marginTop: -48,
    paddingHorizontal: 56,
    paddingTop: 32,
    paddingBottom: 24,
    marginBottom: 32,
  },
  brand: {
    fontSize: 20,
    fontFamily: 'Helvetica-Bold',
    color: '#3DC2C2',
    marginBottom: 4,
  },
  reportTitle: { fontSize: 14, color: '#e2e8f0', marginBottom: 2 },
  reportMeta: { fontSize: 8, color: '#94a3b8' },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
    marginTop: 24,
    marginBottom: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#3DC2C2',
  },
  paragraph: { fontSize: 9, lineHeight: 1.6, color: '#334155', marginBottom: 6 },
  metricsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 4,
    padding: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#3DC2C2',
  },
  metricValue: {
    fontSize: 16,
    fontFamily: 'Helvetica-Bold',
    color: '#0f172a',
  },
  metricLabel: { fontSize: 7, color: '#64748b', marginTop: 2 },
  table: { marginBottom: 12 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: 3,
    marginBottom: 2,
  },
  tableHeaderCell: {
    fontSize: 8,
    color: '#e2e8f0',
    fontFamily: 'Helvetica-Bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderBottomWidth: 0.5,
    borderBottomColor: '#e2e8f0',
  },
  tableCell: { fontSize: 8, color: '#334155' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  footerText: { fontSize: 7, color: '#94a3b8' },
  disclaimer: {
    fontSize: 7,
    color: '#94a3b8',
    marginTop: 24,
    fontStyle: 'italic',
  },
});

// ── PDF Document Builder ────────────────────────────────────────────────────

function ThreatModelPDF({ report }: { report: ThreatModelReportData }) {
  const exec = report.executive_summary;
  const threats = Object.values(report.stride_analysis?.by_category ?? {}).flatMap(
    (cat) => cat.threats,
  );
  const fmeaItems = (report.fmea_analysis?.items ?? []).slice(0, 20);
  const gaps = report.gap_analysis ?? [];
  const recs = report.recommendations ?? [];

  return React.createElement(
    Document,
    { title: `ihOS — Threat Model Report · ${report.product_version}`, author: 'ihOS · Ionic Health' },

    // ── Cover Page ────────────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: [styles.page, styles.coverPage] },
      React.createElement(
        View,
        { style: styles.coverContent },
        React.createElement(Text, { style: styles.coverBrand }, 'ihOS'),
        React.createElement(Text, { style: styles.coverTitle }, 'Threat Model Report'),
        React.createElement(
          Text,
          { style: styles.coverSubtitle },
          `${report.product_version} · ${(report.frameworks ?? []).join(', ')}`,
        ),
        React.createElement(
          Text,
          { style: styles.coverMeta },
          `Generated: ${new Date(report.generated_at).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })} · Risk Rating: ${exec.risk_rating.toUpperCase()}`,
        ),
      ),
    ),

    // ── Executive Summary ────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },

      React.createElement(
        View,
        { style: styles.headerBar },
        React.createElement(Text, { style: styles.brand }, 'ihOS'),
        React.createElement(Text, { style: styles.reportTitle }, 'Executive Summary'),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Version: ${report.product_version}  ·  Frameworks: ${(report.frameworks ?? []).join(', ')}`,
        ),
      ),

      // Metrics grid
      React.createElement(
        View,
        { style: styles.metricsRow },
        React.createElement(
          View,
          { style: styles.metricBox },
          React.createElement(Text, { style: styles.metricValue }, String(exec.total_threats)),
          React.createElement(Text, { style: styles.metricLabel }, 'Total Threats'),
        ),
        React.createElement(
          View,
          { style: [styles.metricBox, { borderLeftColor: '#ef4444' }] },
          React.createElement(Text, { style: [styles.metricValue, { color: '#ef4444' }] }, String(exec.critical_count)),
          React.createElement(Text, { style: styles.metricLabel }, 'Critical'),
        ),
        React.createElement(
          View,
          { style: [styles.metricBox, { borderLeftColor: '#f97316' }] },
          React.createElement(Text, { style: [styles.metricValue, { color: '#f97316' }] }, String(exec.high_count)),
          React.createElement(Text, { style: styles.metricLabel }, 'High'),
        ),
      ),
      React.createElement(
        View,
        { style: styles.metricsRow },
        React.createElement(
          View,
          { style: styles.metricBox },
          React.createElement(Text, { style: styles.metricValue }, exec.avg_rpn.toFixed(1)),
          React.createElement(Text, { style: styles.metricLabel }, 'Avg RPN'),
        ),
        React.createElement(
          View,
          { style: styles.metricBox },
          React.createElement(Text, { style: styles.metricValue }, String(exec.max_rpn)),
          React.createElement(Text, { style: styles.metricLabel }, 'Max RPN'),
        ),
        React.createElement(
          View,
          { style: styles.metricBox },
          React.createElement(Text, { style: styles.metricValue }, String(exec.total_gaps)),
          React.createElement(Text, { style: styles.metricLabel }, 'Gaps'),
        ),
      ),

      React.createElement(Text, { style: styles.paragraph }, exec.narrative),

      // Footer
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) =>
              `Page ${pageNumber} of ${totalPages}`,
          },
        ),
      ),
    ),

    // ── STRIDE Threats ──────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.headerBar },
        React.createElement(Text, { style: styles.brand }, 'ihOS'),
        React.createElement(Text, { style: styles.reportTitle }, 'STRIDE Threat Analysis'),
      ),

      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 30 }] }, 'Cat'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Title'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, 'Severity'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 35 }] }, 'RPN'),
        ),
        ...threats.slice(0, 30).map((t: StrideThreat, i: number) =>
          React.createElement(
            View,
            { key: t.id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }] },
            React.createElement(Text, { style: [styles.tableCell, { width: 30 }] }, t.stride_category),
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, t.title),
            React.createElement(Text, { style: [styles.tableCell, { width: 60 }] }, t.severity),
            React.createElement(Text, { style: [styles.tableCell, { width: 35 }] }, String(t.rpn)),
          ),
        ),
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) =>
              `Page ${pageNumber} of ${totalPages}`,
          },
        ),
      ),
    ),

    // ── FMEA Top 20 ─────────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.sectionTitle }, 'FMEA Analysis — Top 20'),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Failure Mode'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 25 }] }, 'S'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 25 }] }, 'O'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 25 }] }, 'D'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 35 }] }, 'RPN'),
        ),
        ...fmeaItems.map((item: FmeaItem, i: number) =>
          React.createElement(
            View,
            { key: item.threat_id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }] },
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, item.failure_mode),
            React.createElement(Text, { style: [styles.tableCell, { width: 25 }] }, String(item.severity)),
            React.createElement(Text, { style: [styles.tableCell, { width: 25 }] }, String(item.occurrence)),
            React.createElement(Text, { style: [styles.tableCell, { width: 25 }] }, String(item.detection)),
            React.createElement(Text, { style: [styles.tableCell, { width: 35 }] }, String(item.rpn)),
          ),
        ),
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) =>
              `Page ${pageNumber} of ${totalPages}`,
          },
        ),
      ),
    ),

    // ── Gaps ─────────────────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(Text, { style: styles.sectionTitle }, 'Compliance Gaps'),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, 'Type'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Title'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 50 }] }, 'Priority'),
        ),
        ...gaps.slice(0, 25).map((g, i: number) =>
          React.createElement(
            View,
            { key: g.id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }] },
            React.createElement(Text, { style: [styles.tableCell, { width: 60 }] }, g.gap_type),
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, g.title),
            React.createElement(Text, { style: [styles.tableCell, { width: 50 }] }, g.priority),
          ),
        ),
      ),

      // ── Recommendations ─────────────────────────────────────────────────
      React.createElement(Text, { style: styles.sectionTitle }, 'Recommendations'),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader },
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Title'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 50 }] }, 'Priority'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 45 }] }, 'Effort'),
        ),
        ...recs.slice(0, 20).map((r, i: number) =>
          React.createElement(
            View,
            { key: r.id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }] },
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, r.title),
            React.createElement(Text, { style: [styles.tableCell, { width: 50 }] }, r.priority),
            React.createElement(Text, { style: [styles.tableCell, { width: 45 }] }, r.effort),
          ),
        ),
      ),

      // Disclaimer
      React.createElement(
        Text,
        { style: styles.disclaimer },
        'This report was generated automatically by ihOS. It should be reviewed by qualified security professionals before being used as basis for security decisions.',
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) =>
              `Page ${pageNumber} of ${totalPages}`,
          },
        ),
      ),
    ),
  );
}

// ── Excel Builder ───────────────────────────────────────────────────────────

function buildExcelBuffer(report: ThreatModelReportData): Buffer {
  const wb = XLSX.utils.book_new();
  const exec = report.executive_summary;

  // 1. Summary
  const summaryRows = [
    ['ihOS — Threat Model Report'],
    [],
    ['Product Version', report.product_version],
    ['Frameworks', (report.frameworks ?? []).join(', ')],
    ['Generated At', report.generated_at],
    ['Status', report.status],
    [],
    ['Metric', 'Value'],
    ['Total Threats', exec.total_threats],
    ['Critical Threats', exec.critical_count],
    ['High Threats', exec.high_count],
    ['Average RPN', exec.avg_rpn],
    ['Max RPN', exec.max_rpn],
    ['Compliance Gaps', exec.total_gaps],
    ['Recommendations', exec.recommendations_count],
    ['Risk Rating', exec.risk_rating],
  ];
  const wsSummary = XLSX.utils.aoa_to_sheet(summaryRows);
  XLSX.utils.book_append_sheet(wb, wsSummary, 'Summary');

  // 2. STRIDE Threats
  const allThreats = Object.values(report.stride_analysis?.by_category ?? {}).flatMap(
    (cat) => cat.threats,
  );
  const threatRows: any[][] = [
    ['ID', 'Category', 'Title', 'Component', 'Severity', 'Likelihood', 'RPN', 'Mitigations'],
    ...allThreats.map((t: StrideThreat) => [
      t.id,
      t.stride_category,
      t.title,
      t.affected_component,
      t.severity,
      t.likelihood,
      t.rpn,
      (t.mitigations ?? []).join('; '),
    ]),
  ];
  const wsThreats = XLSX.utils.aoa_to_sheet(threatRows);
  XLSX.utils.book_append_sheet(wb, wsThreats, 'STRIDE Threats');

  // 3. FMEA Analysis
  const fmeaRows: any[][] = [
    ['Failure Mode', 'Severity (1-10)', 'Occurrence (1-10)', 'Detection (1-10)', 'RPN', 'Action'],
    ...(report.fmea_analysis?.items ?? []).map((item: FmeaItem) => [
      item.failure_mode,
      item.severity,
      item.occurrence,
      item.detection,
      item.rpn,
      item.recommended_action,
    ]),
  ];
  const wsFmea = XLSX.utils.aoa_to_sheet(fmeaRows);
  XLSX.utils.book_append_sheet(wb, wsFmea, 'FMEA Analysis');

  // 4. Compliance Gaps
  const gapRows: any[][] = [
    ['Type', 'Title', 'Description', 'Priority', 'Controls'],
    ...(report.gap_analysis ?? []).map((g) => [
      g.gap_type,
      g.title,
      g.description,
      g.priority,
      (g.affected_controls ?? []).join('; '),
    ]),
  ];
  const wsGaps = XLSX.utils.aoa_to_sheet(gapRows);
  XLSX.utils.book_append_sheet(wb, wsGaps, 'Compliance Gaps');

  // 5. Recommendations
  const recRows: any[][] = [
    ['Title', 'Description', 'Priority', 'Effort', 'Frameworks'],
    ...(report.recommendations ?? []).map((r) => [
      r.title,
      r.description,
      r.priority,
      r.effort,
      (r.frameworks ?? []).join('; '),
    ]),
  ];
  const wsRecs = XLSX.utils.aoa_to_sheet(recRows);
  XLSX.utils.book_append_sheet(wb, wsRecs, 'Recommendations');

  const xlsxBuffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return xlsxBuffer;
}

// ── Route Handler ───────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  // Auth
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { id } = await params;
  const format = request.nextUrl.searchParams.get('format') ?? 'pdf';
  const admin = createAdminClient();

  // Fetch the latest report for this threat model
  const { data: reportRow, error: fetchError } = await admin
    .from('threat_model_reports')
    .select('*')
    .eq('threat_model_id', id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (fetchError || !reportRow) {
    return NextResponse.json(
      { error: 'No report found for this threat model. Generate a report first.' },
      { status: 404 },
    );
  }

  const report = reportRow as ThreatModelReport;
  const reportData: ThreatModelReportData = report.report_data;

  // ── Excel Export ────────────────────────────────────────────────────────
  if (format === 'excel') {
    try {
      const xlsxBuffer = buildExcelBuffer(reportData);
      const filename = `ihOS-threat-model-${report.product_version}-${id.slice(0, 8)}.xlsx`;

      return new NextResponse(new Uint8Array(xlsxBuffer), {
        status: 200,
        headers: {
          'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Content-Length': String(xlsxBuffer.byteLength),
        },
      });
    } catch (err) {
      console.error('[ThreatModeling] Excel export error:', err);
      return NextResponse.json(
        { error: err instanceof Error ? err.message : 'Failed to generate Excel export' },
        { status: 500 },
      );
    }
  }

  // ── PDF Export (default) ────────────────────────────────────────────────
  try {
    const pdfBuffer = await renderToBuffer(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      React.createElement(ThreatModelPDF, { report: reportData }) as any,
    );

    const filename = `ihOS-threat-model-${report.product_version}-${id.slice(0, 8)}.pdf`;

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': String(pdfBuffer.byteLength),
      },
    });
  } catch (err) {
    console.error('[ThreatModeling] PDF export error:', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate PDF' },
      { status: 500 },
    );
  }
}
