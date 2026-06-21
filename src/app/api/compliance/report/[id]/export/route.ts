// src/app/api/compliance/report/[id]/export/route.ts
// Generates and downloads the compliance report in Excel (XLSX) format

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as XLSX from "xlsx";

export const dynamic = "force-dynamic";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    // 1. Auth check
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 2. Fetch the specific full_report snapshot
    const { data: snapshot, error: snapshotError } = await supabase
      .from("intelligence_snapshots")
      .select("*")
      .eq("id", id)
      .eq("snapshot_type", "full_report")
      .maybeSingle();

    if (snapshotError) {
      throw snapshotError;
    }

    if (!snapshot || !snapshot.snapshot_data) {
      return NextResponse.json(
        { error: "Report not found" },
        { status: 404 }
      );
    }

    const snapshotData = snapshot.snapshot_data as any;

    // 3. Build workbook using xlsx
    const wb = XLSX.utils.book_new();

    // Tab 1: Overview
    const overviewData = [
      ["Metric", "Value"],
      ["Total Evaluated Controls", snapshotData.summary?.total ?? 0],
      ["Compliant Controls", snapshotData.summary?.compliant ?? 0],
      ["Non-Compliant Controls", snapshotData.summary?.nonCompliant ?? 0],
      ["Compliance Rate", `${snapshotData.summary?.complianceRate ?? 0}%`],
      ["Average Confidence Score", snapshotData.summary?.avgConfidence ?? 0],
      ["Generation Date", new Date(snapshot.created_at || "").toLocaleString("en-US")],
      ["Primary Framework", snapshot.framework_code || "General"],
    ];
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(wb, wsOverview, "Overview");

    // Tab 2: Remediation Plan (ROI Path)
    const roiHeader = [
      "Control ID",
      "Control Name",
      "ROI Score (Priority)",
      "Mapped Frameworks",
    ];
    const roiRows = (snapshotData.roiPath || []).map((item: any) => [
      item.controlId || item.code || "",
      item.controlName || item.name || "",
      item.roiScore || item.roi || 0,
      Array.isArray(item.frameworks) ? item.frameworks.join(", ") : item.frameworks || "",
    ]);
    const wsRoi = XLSX.utils.aoa_to_sheet([roiHeader, ...roiRows]);
    XLSX.utils.book_append_sheet(wb, wsRoi, "Remediation Plan");

    // Tab 3: Evidence Gaps (Top Gaps)
    const gapHeader = [
      "Control Code",
      "Domain",
      "Control Name",
      "Severity",
      "Confidence",
      "Missing Elements",
      "Auditor Notes",
    ];
    const gapRows = (snapshotData.topGaps || []).map((gap: any) => [
      gap.code || "",
      gap.domain || "",
      gap.name || "",
      gap.status || "low",
      `${gap.confidence ?? 0}%`,
      Array.isArray(gap.missingElements) ? gap.missingElements.join("; ") : gap.missingElements || "",
      gap.auditorNotes || "",
    ]);
    const wsGaps = XLSX.utils.aoa_to_sheet([gapHeader, ...gapRows]);
    XLSX.utils.book_append_sheet(wb, wsGaps, "Evidence Gaps");

    // 4. Generate Excel buffer
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // 5. Return response stream
    return new Response(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Compliance_Report_${id}.xlsx"`,
      },
    });
  } catch (error) {
    console.error("[API] /compliance/report/[id]/export error:", error);
    return NextResponse.json(
      {
        error: "Failed to export report",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
