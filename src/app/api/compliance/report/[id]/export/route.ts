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

    // ABA 1: Visão Geral
    const overviewData = [
      ["Métrica", "Valor"],
      ["Total de Controles Evaluados", snapshotData.summary?.total ?? 0],
      ["Controles Conformes", snapshotData.summary?.compliant ?? 0],
      ["Controles Não Conformes", snapshotData.summary?.nonCompliant ?? 0],
      ["Taxa de Conformidade", `${snapshotData.summary?.complianceRate ?? 0}%`],
      ["Pontuação Média de Confiança", snapshotData.summary?.avgConfidence ?? 0],
      ["Data de Geração", new Date(snapshot.created_at || "").toLocaleString("pt-BR")],
      ["Framework Principal", snapshot.framework_code || "Geral"],
    ];
    const wsOverview = XLSX.utils.aoa_to_sheet(overviewData);
    XLSX.utils.book_append_sheet(wb, wsOverview, "Visão Geral");

    // ABA 2: Plano de Remediação (ROI Path)
    const roiHeader = [
      "ID do Controle",
      "Nome do Controle",
      "Pontuação ROI (Prioridade)",
      "Frameworks Mapeados",
    ];
    const roiRows = (snapshotData.roiPath || []).map((item: any) => [
      item.controlId || item.code || "",
      item.controlName || item.name || "",
      item.roiScore || item.roi || 0,
      Array.isArray(item.frameworks) ? item.frameworks.join(", ") : item.frameworks || "",
    ]);
    const wsRoi = XLSX.utils.aoa_to_sheet([roiHeader, ...roiRows]);
    XLSX.utils.book_append_sheet(wb, wsRoi, "Plano de Remediação");

    // ABA 3: Gaps de Evidências (Top Gaps)
    const gapHeader = [
      "Código do Controle",
      "Domínio",
      "Nome do Controle",
      "Gravidade",
      "Confiança",
      "Elementos Faltantes",
      "Notas do Auditor",
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
    XLSX.utils.book_append_sheet(wb, wsGaps, "Gaps de Evidências");

    // 4. Generate Excel buffer
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

    // 5. Return response stream
    return new Response(buf, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="Relatorio_Conformidade_${id}.xlsx"`,
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
