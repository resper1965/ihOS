import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // 1. Fetch active baseline
    const { data: baseline, error: baselineError } = await (supabase as any)
      .from("msr_baselines")
      .select(`
        id,
        name,
        description,
        status,
        product_version_id,
        product_versions (
          version_code
        )
      `)
      .eq("status", "active")
      .limit(1)
      .maybeSingle();

    if (baselineError) {
      throw baselineError;
    }

    if (!baseline) {
      return NextResponse.json({ success: true, message: "No active MSR baseline found", controls: [], stats: null });
    }

    // 2. Fetch all controls for this baseline and join scf_controls information
    const { data: controls, error: controlsError } = await (supabase as any)
      .from("msr_controls")
      .select(`
        id,
        control_code,
        classification,
        status,
        rejection_rationale,
        dsr_score,
        dsr_factors,
        pptdf_scope,
        scf_controls:control_code (
          control_name,
          description
        )
      `)
      .eq("baseline_id", baseline.id)
      .order("dsr_score", { ascending: false });

    if (controlsError) {
      throw controlsError;
    }

    // 3. Compute statistics
    const stats = {
      total_mcr: 0,
      total_dsr: 0,
      accepted_mcr: 0,
      accepted_dsr: 0,
      pending_dsr: 0,
      rejected_dsr: 0,
      pptdf: {
        People: 0,
        Process: 0,
        Technology: 0,
        Data: 0,
        Facilities: 0
      }
    };

    const formattedControls = (controls || []).map((c: any) => {
      const isMCR = c.classification === "MCR";
      const isDSR = c.classification === "DSR";
      
      if (isMCR) {
        stats.total_mcr++;
        if (c.status === "accepted") stats.accepted_mcr++;
      } else if (isDSR) {
        stats.total_dsr++;
        if (c.status === "accepted") stats.accepted_dsr++;
        else if (c.status === "pending_review") stats.pending_dsr++;
        else if (c.status === "rejected") stats.rejected_dsr++;
      }

      // Aggregate PPTDF scopes
      if (c.status === "accepted") {
        (c.pptdf_scope || []).forEach((scope: string) => {
          if (scope in stats.pptdf) {
            stats.pptdf[scope as keyof typeof stats.pptdf]++;
          }
        });
      }

      return {
        id: c.id,
        control_code: c.control_code,
        classification: c.classification,
        status: c.status,
        rejection_rationale: c.rejection_rationale,
        dsr_score: c.dsr_score,
        dsr_factors: c.dsr_factors,
        pptdf_scope: c.pptdf_scope,
        control_name: c.scf_controls?.control_name || "Unknown Control",
        description: c.scf_controls?.description || ""
      };
    });

    return NextResponse.json({
      success: true,
      baseline: {
        id: baseline.id,
        name: baseline.name,
        description: baseline.description,
        status: baseline.status,
        version_code: baseline.product_versions?.version_code || "v2.2.x"
      },
      stats,
      controls: formattedControls
    });

  } catch (err: any) {
    console.error("[api/scrms] GET error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
