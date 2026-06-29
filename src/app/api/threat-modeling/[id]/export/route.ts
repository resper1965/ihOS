import { logger } from '@/lib/logger';
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
  Font
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

// ── Font Registration ───────────────────────────────────────────────────────

Font.register({
  family: 'Lato',
  fonts: [
    { src: 'https://fonts.gstatic.com/s/lato/v24/S6uyw4BMUTPHjx4wWw.ttf', fontWeight: 'normal' },
    { src: 'https://fonts.gstatic.com/s/lato/v24/S6u9w4BMUTPHh6UVSwiPHA.ttf', fontWeight: 'bold' }
  ]
});

// ── PDF Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Lato',
    fontSize: 10,
    paddingTop: 48,
    paddingBottom: 64,
    paddingHorizontal: 56,
    backgroundColor: '#ffffff',
    color: '#1e293b',
  },
  coverPage: {
    fontFamily: 'Lato',
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
    fontSize: 48,
    fontFamily: 'Lato',
    fontWeight: 'bold',
    color: '#3DC2C2',
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 24,
    fontFamily: 'Lato',
    fontWeight: 'bold',
    color: '#e2e8f0',
    marginBottom: 8,
    textAlign: 'center',
  },
  coverSubtitle: {
    fontSize: 12,
    color: '#94a3b8',
    textAlign: 'center',
    marginBottom: 32,
  },
  coverMeta: {
    fontSize: 10,
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
    fontFamily: 'Lato',
    fontWeight: 'bold',
    color: '#3DC2C2',
    marginBottom: 4,
  },
  reportTitle: { fontSize: 14, color: '#e2e8f0', marginBottom: 2 },
  reportMeta: { fontSize: 8, color: '#94a3b8' },
  sectionTitle: {
    fontSize: 14,
    fontFamily: 'Lato',
    fontWeight: 'bold',
    color: '#0f172a',
    marginTop: 24,
    marginBottom: 12,
    paddingBottom: 4,
    borderBottomWidth: 2,
    borderBottomColor: '#3DC2C2',
  },
  paragraph: { fontSize: 10, lineHeight: 1.5, color: '#334155', marginBottom: 8 },
  metricsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    backgroundColor: '#f8fafc',
    borderRadius: 6,
    padding: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#3DC2C2',
  },
  metricValue: {
    fontSize: 20,
    fontFamily: 'Lato',
    fontWeight: 'bold',
    color: '#0f172a',
  },
  metricLabel: { fontSize: 8, color: '#64748b', marginTop: 4, textTransform: 'uppercase' },
  table: { marginBottom: 16 },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    marginBottom: 4,
  },
  tableHeaderCell: {
    fontSize: 9,
    color: '#e2e8f0',
    fontFamily: 'Lato',
    fontWeight: 'bold',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  tableCell: { fontSize: 9, color: '#334155', paddingRight: 4 },
  severityCritical: { color: '#ef4444', fontWeight: 'bold' },
  severityHigh: { color: '#f97316', fontWeight: 'bold' },
  severityMedium: { color: '#eab308', fontWeight: 'bold' },
  severityLow: { color: '#3b82f6', fontWeight: 'bold' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 56,
    right: 56,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    paddingTop: 8,
  },
  footerText: { fontSize: 8, color: '#94a3b8' },
  disclaimer: {
    fontSize: 8,
    color: '#94a3b8',
    marginTop: 32,
    fontStyle: 'italic',
    lineHeight: 1.4,
  },
  tocItem: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 8,
    flexDirection: 'row',
  },
  tocNumber: {
    width: 24,
    fontFamily: 'Lato',
    fontWeight: 'bold',
    color: '#3DC2C2',
  }
});

// ── Helper ──────────────────────────────────────────────────────────────────

function getSeverityStyle(severity: string) {
  const s = severity?.toLowerCase() || '';
  if (s.includes('critical')) return styles.severityCritical;
  if (s.includes('high')) return styles.severityHigh;
  if (s.includes('medium')) return styles.severityMedium;
  if (s.includes('low')) return styles.severityLow;
  return {};
}

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
        React.createElement(Text, { style: styles.coverTitle }, 'Enterprise Threat Model Report'),
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
          })} \nRisk Rating: ${exec.risk_rating.toUpperCase()}`,
        ),
      ),
    ),

    // ── Table of Contents ────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.headerBar, fixed: true },
        React.createElement(Text, { style: styles.brand }, 'ihOS'),
        React.createElement(Text, { style: styles.reportTitle }, 'Table of Contents'),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Version: ${report.product_version}  ·  Frameworks: ${(report.frameworks ?? []).join(', ')}`,
        ),
      ),
      React.createElement(
        View,
        { style: { marginTop: 24 } },
        React.createElement(View, { style: styles.tocItem }, 
          React.createElement(Text, { style: styles.tocNumber }, '1.'), 
          React.createElement(Text, null, 'Executive Summary')
        ),
        React.createElement(View, { style: styles.tocItem }, 
          React.createElement(Text, { style: styles.tocNumber }, '2.'), 
          React.createElement(Text, null, 'STRIDE Threat Analysis')
        ),
        React.createElement(View, { style: styles.tocItem }, 
          React.createElement(Text, { style: styles.tocNumber }, '3.'), 
          React.createElement(Text, null, 'FMEA Analysis — Top 20')
        ),
        React.createElement(View, { style: styles.tocItem }, 
          React.createElement(Text, { style: styles.tocNumber }, '4.'), 
          React.createElement(Text, null, 'Compliance Gaps')
        ),
        React.createElement(View, { style: styles.tocItem }, 
          React.createElement(Text, { style: styles.tocNumber }, '5.'), 
          React.createElement(Text, null, 'Recommendations')
        ),
      ),
      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Strictly Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`,
          },
        ),
      ),
    ),

    // ── Executive Summary ────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.headerBar, fixed: true },
        React.createElement(Text, { style: styles.brand }, 'ihOS'),
        React.createElement(Text, { style: styles.reportTitle }, '1. Executive Summary'),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Version: ${report.product_version}  ·  Frameworks: ${(report.frameworks ?? []).join(', ')}`,
        ),
      ),

      React.createElement(
        View,
        { style: styles.metricsRow, wrap: false },
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
        { style: styles.metricsRow, wrap: false },
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

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Strictly Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`,
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
        { style: styles.headerBar, fixed: true },
        React.createElement(Text, { style: styles.brand }, 'ihOS'),
        React.createElement(Text, { style: styles.reportTitle }, '2. STRIDE Threat Analysis'),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Version: ${report.product_version}  ·  Frameworks: ${(report.frameworks ?? []).join(', ')}`,
        ),
      ),

      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader, fixed: true },
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 35 }] }, 'Cat'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Title'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, 'Severity'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 40 }] }, 'RPN'),
        ),
        ...threats.map((t: StrideThreat, i: number) =>
          React.createElement(
            View,
            { key: t.id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }], wrap: false },
            React.createElement(Text, { style: [styles.tableCell, { width: 35, fontFamily: 'Lato', fontWeight: 'bold' }] }, t.stride_category),
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, t.title),
            React.createElement(Text, { style: [styles.tableCell, { width: 60 }, getSeverityStyle(t.severity)] }, t.severity),
            React.createElement(Text, { style: [styles.tableCell, { width: 40 }] }, String(t.rpn)),
          ),
        ),
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Strictly Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`,
          },
        ),
      ),
    ),

    // ── FMEA Top 20 ─────────────────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.headerBar, fixed: true },
        React.createElement(Text, { style: styles.brand }, 'ihOS'),
        React.createElement(Text, { style: styles.reportTitle }, '3. FMEA Analysis — Top 20'),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Version: ${report.product_version}  ·  Frameworks: ${(report.frameworks ?? []).join(', ')}`,
        ),
      ),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader, fixed: true },
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Failure Mode'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 25 }] }, 'S'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 25 }] }, 'O'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 25 }] }, 'D'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 35 }] }, 'RPN'),
        ),
        ...fmeaItems.map((item: FmeaItem, i: number) =>
          React.createElement(
            View,
            { key: item.threat_id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }], wrap: false },
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, item.failure_mode),
            React.createElement(Text, { style: [styles.tableCell, { width: 25 }] }, String(item.severity)),
            React.createElement(Text, { style: [styles.tableCell, { width: 25 }] }, String(item.occurrence)),
            React.createElement(Text, { style: [styles.tableCell, { width: 25 }] }, String(item.detection)),
            React.createElement(Text, { style: [styles.tableCell, { width: 35, fontFamily: 'Lato', fontWeight: 'bold' }] }, String(item.rpn)),
          ),
        ),
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Strictly Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`,
          },
        ),
      ),
    ),

    // ── Gaps & Recommendations ───────────────────────────────────────────
    React.createElement(
      Page,
      { size: 'A4', style: styles.page },
      React.createElement(
        View,
        { style: styles.headerBar, fixed: true },
        React.createElement(Text, { style: styles.brand }, 'ihOS'),
        React.createElement(Text, { style: styles.reportTitle }, '4. Compliance Gaps & 5. Recommendations'),
        React.createElement(
          Text,
          { style: styles.reportMeta },
          `Version: ${report.product_version}  ·  Frameworks: ${(report.frameworks ?? []).join(', ')}`,
        ),
      ),
      
      React.createElement(Text, { style: styles.sectionTitle, minPresenceAhead: 100 }, '4. Compliance Gaps'),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader, fixed: true },
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 70 }] }, 'Type'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Title'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, 'Priority'),
        ),
        ...gaps.map((g, i: number) =>
          React.createElement(
            View,
            { key: g.id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }], wrap: false },
            React.createElement(Text, { style: [styles.tableCell, { width: 70 }] }, g.gap_type),
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, g.title),
            React.createElement(Text, { style: [styles.tableCell, { width: 60 }, getSeverityStyle(g.priority)] }, g.priority),
          ),
        ),
      ),

      React.createElement(Text, { style: styles.sectionTitle, minPresenceAhead: 100, break: gaps.length > 10 }, '5. Recommendations'),
      React.createElement(
        View,
        { style: styles.table },
        React.createElement(
          View,
          { style: styles.tableHeader, fixed: true },
          React.createElement(Text, { style: [styles.tableHeaderCell, { flex: 1 }] }, 'Title'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 60 }] }, 'Priority'),
          React.createElement(Text, { style: [styles.tableHeaderCell, { width: 50 }] }, 'Effort'),
        ),
        ...recs.map((r, i: number) =>
          React.createElement(
            View,
            { key: r.id, style: [styles.tableRow, { backgroundColor: i % 2 === 0 ? '#f8fafc' : '#fff' }], wrap: false },
            React.createElement(Text, { style: [styles.tableCell, { flex: 1 }] }, r.title),
            React.createElement(Text, { style: [styles.tableCell, { width: 60 }, getSeverityStyle(r.priority)] }, r.priority),
            React.createElement(Text, { style: [styles.tableCell, { width: 50 }] }, r.effort),
          ),
        ),
      ),

      // Disclaimer
      React.createElement(
        Text,
        { style: styles.disclaimer, wrap: false },
        'This enterprise-grade report was generated automatically by ihOS.\nIt should be reviewed by qualified security professionals before being used as a basis for strategic security decisions.'
      ),

      React.createElement(
        View,
        { style: styles.footer, fixed: true },
        React.createElement(Text, { style: styles.footerText }, 'ihOS · Ionic Health · Strictly Confidential'),
        React.createElement(
          Text,
          {
            style: styles.footerText,
            render: ({ pageNumber, totalPages }: any) => `Page ${pageNumber} of ${totalPages}`,
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

  const report = reportRow as unknown as ThreatModelReport;
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
      logger.error("Excel export error", { context: "threat-modeling/export", error: err });
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
    logger.error("PDF export error", { context: "threat-modeling/export", error: err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to generate PDF' },
      { status: 500 },
    );
  }
}
