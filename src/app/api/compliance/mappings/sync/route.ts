import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getLatestScfVersion, getScfControls } from "@/lib/standard-api/client";
import { generateEmbeddings } from "@/lib/chat/embeddings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if user is admin or ionic_user
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "ionic_user") {
      return NextResponse.json({ error: "Forbidden: Admin or Ionic User required" }, { status: 403 });
    }

    const adminSupabase = createAdminClient();

    // 1. Get latest SCF version
    const { scf_version_id, version_label } = await getLatestScfVersion();

    // 2. Fetch controls from GRC API
    let page = 1;
    let allControls: any[] = [];
    while (true) {
      const result = await getScfControls(scf_version_id, page, 100);
      const pageControls = result.data || [];
      if (pageControls.length === 0) break;
      allControls = allControls.concat(pageControls);
      
      // Limit to 200 controls for rapid sync to avoid function timeouts
      if (allControls.length >= 200) {
        allControls = allControls.slice(0, 200);
        break;
      }
      page++;
    }

    console.log(`[Sync Mappings] Fetched ${allControls.length} controls from GRC API.`);

    // 3. Upsert controls and generate embeddings in parallel batches
    let syncedCount = 0;
    const batchSize = 25;

    for (let i = 0; i < allControls.length; i += batchSize) {
      const batch = allControls.slice(i, i + batchSize);
      
      // Generate embeddings
      const texts = batch.map(c => `${c.control_title}. ${c.control_description || ""}`);
      let embeddings: number[][] = [];
      try {
        embeddings = await generateEmbeddings(texts);
      } catch (e) {
        logger.warn("Error generating embeddings", { context: "compliance/mappings/sync", error: e });
      }

      const rows = batch.map((c, idx) => {
        const code = c.control_code;
        const domain = code.split("-")[0] || "GEN";
        return {
          control_code: code,
          domain_code: domain,
          control_name: c.control_title,
          description: c.control_description || null,
          embedding: embeddings[idx] ? JSON.stringify(embeddings[idx]) : null,
        };
      });

      const { error: upsertError } = await adminSupabase
        .from("scf_controls")
        .upsert(rows, { onConflict: "control_code" });

      if (upsertError) {
        logger.error("Error upserting controls batch", { context: "compliance/mappings/sync", meta: { error: upsertError.message } });
      } else {
        syncedCount += rows.length;
      }
    }

    return NextResponse.json({
      success: true,
      scf_version: version_label,
      scf_version_id,
      controls_synced: syncedCount,
    });
  } catch (err) {
    logger.error("Sync mappings failed", { context: "compliance/mappings/sync", error: err });
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
