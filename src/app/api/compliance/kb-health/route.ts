import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import * as Sentry from "@sentry/nextjs";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const [
      totalDocsResult,
      totalChunksResult,
      missingIndexDocsResult,
      chunksWithIsoResult,
    ] = await Promise.all([
      supabase
        .from("compliance_documents")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("document_chunks")
        .select("id", { count: "exact", head: true }),
      supabase
        .from("compliance_documents")
        .select("id", { count: "exact", head: true })
        .eq("total_chunks", 0),
      supabase
        .from("document_chunks")
        .select("id")
        .not("iso_controls", "is", null),
    ]);

    const totalDocs = totalDocsResult.count ?? 0;
    const totalChunks = totalChunksResult.count ?? 0;
    const missingIndexDocs = missingIndexDocsResult.count ?? 0;
    const isoCoverageCount = chunksWithIsoResult.data?.length ?? 0;
    const isoPercentage = totalChunks > 0
      ? Math.round((isoCoverageCount / totalChunks) * 100)
      : 0;

    return NextResponse.json({
      success: true,
      data: {
        totalDocs,
        totalChunks,
        missingIndexDocs,
        isoCoverageCount,
        isoPercentage,
      },
    });
  } catch (err: any) {
    Sentry.captureException(err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to load knowledge base health metrics" },
      { status: 500 }
    );
  }
}
