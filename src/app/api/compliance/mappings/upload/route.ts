import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const adminSupabase = createAdminClient();

    const contentType = request.headers.get("content-type") || "";
    let mappings: any[] = [];

    if (contentType.includes("application/json")) {
      const body = await request.json();
      mappings = Array.isArray(body) ? body : [body];
    } else if (contentType.includes("multipart/form-data") || contentType.includes("text/csv") || contentType.includes("application/octet-stream")) {
      let csvText = "";
      if (contentType.includes("multipart/form-data")) {
        const formData = await request.formData();
        const file = formData.get("file") as File;
        if (!file) {
          return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
        }
        csvText = await file.text();
      } else {
        csvText = await request.text();
      }

      // Parse CSV
      const lines = csvText.split(/\r?\n/);
      if (lines.length < 2) {
        return NextResponse.json({ error: "CSV file is empty" }, { status: 400 });
      }

      const headers = lines[0].split(",").map(h => h.trim().toLowerCase());
      const frameworkIdx = headers.indexOf("framework_code");
      const targetIdx = headers.indexOf("target_control_id");
      const scfIdx = headers.indexOf("scf_control_code");

      if (frameworkIdx === -1 || targetIdx === -1 || scfIdx === -1) {
        return NextResponse.json({
          error: "CSV must contain headers: framework_code, target_control_id, scf_control_code"
        }, { status: 400 });
      }

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const cols = line.split(",").map(c => c.trim());
        if (cols.length < headers.length) continue;

        mappings.push({
          framework_code: cols[frameworkIdx],
          target_control_id: cols[targetIdx],
          scf_control_code: cols[scfIdx],
        });
      }
    } else {
      return NextResponse.json({ error: "Unsupported Content-Type" }, { status: 400 });
    }

    if (mappings.length === 0) {
      return NextResponse.json({ error: "No valid mappings found to import" }, { status: 400 });
    }

    // Prepare rows
    const rows = mappings.map(m => ({
      framework_code: m.framework_code.toUpperCase().replace(/\s+/g, '-'),
      target_control_id: m.target_control_id.trim(),
      scf_control_code: m.scf_control_code.trim().toUpperCase(),
      synced_at: new Date().toISOString(),
    }));

    // Filter rows to only insert ones where the scf_control_code exists in scf_controls.
    // In production, we'd do a join/filter, but for simplicity here we upsert and handle errors.
    const { data, error } = await adminSupabase
      .from("scf_framework_mappings")
      .upsert(rows, { onConflict: "framework_code,target_control_id,scf_control_code" })
      .select("id");

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      imported_count: rows.length,
    });
  } catch (err) {
    logger.error("Upload mappings failed", { context: "compliance/mappings/upload", error: err });
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
