import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getScfFrameworks } from "@/lib/standard-api/client";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const frameworks = await getScfFrameworks();
    return NextResponse.json({
      success: true,
      data: frameworks,
    });
  } catch (error) {
    console.error("[API] /compliance/frameworks error:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch standard frameworks",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
