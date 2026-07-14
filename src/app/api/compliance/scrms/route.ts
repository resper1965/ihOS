import { logger } from '@/lib/logger';
import { NextResponse, NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { triggerGrcRecalibration } from "@/lib/assessment/grc-trigger";

export const dynamic = "force-dynamic";

export async function GET(req?: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let vendorId: string | null = null;
    if (req) {
      const { searchParams } = new URL(req.url);
      vendorId = searchParams.get("vendorId");
    }

    let query = supabase
      .from("msr_baselines")
      .select(`
        id,
        name,
        description,
        status,
        product_version_id,
        vendor_id,
        parent_baseline_id,
        isms_baseline_id,
        product_versions (
          version_code
        ),
        vendors:vendor_id (
          name
        )
      `)
      .eq("status", "active");

    if (vendorId) {
      query = query.eq("vendor_id", vendorId);
    } else {
      query = query.is("vendor_id", null);
    }

    const { data: baseline, error: baselineError } = await query
      .limit(1)
      .maybeSingle();

    if (baselineError) {
      throw baselineError;
    }

    if (!baseline) {
      return NextResponse.json({ success: true, message: "No active MSR baseline found", controls: [], stats: null, deltas: [], ismsStats: null });
    }

    // 2. Fetch version specific deltas if not vendor-scoped
    let deltas: any[] = [];
    if (baseline.product_version_id) {
      const { data: deltasData, error: deltasError } = await supabase
        .from("product_version_deltas")
        .select("feature_slug, description, affected_components, risk_level")
        .eq("product_version_id", baseline.product_version_id);
      if (!deltasError && deltasData) {
        deltas = deltasData;
      }
    }

    // 3. Fetch Core ISMS controls stats
    let ismsStats = { total: 0, implemented: 0 };
    if (baseline.isms_baseline_id) {
      const { data: ismsControls, error: ismsError } = await supabase
        .from("isms_controls")
        .select("status")
        .eq("isms_id", baseline.isms_baseline_id);
      
      if (!ismsError && ismsControls) {
        ismsStats.total = ismsControls.length;
        ismsStats.implemented = ismsControls.filter((c: any) => c.status === "implemented").length;
      }
    }

    // 4. Fetch all controls for this baseline and join scf_controls information
    const { data: controls, error: controlsError } = await supabase
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

    // 5. Compute statistics
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
        version_code: baseline.product_versions?.version_code || null,
        vendor_name: (baseline as any).vendors?.name || null,
        parent_baseline_id: baseline.parent_baseline_id,
        isms_baseline_id: baseline.isms_baseline_id
      },
      stats,
      controls: formattedControls,
      deltas: deltas,
      ismsStats
    });

  } catch (err: any) {
    logger.error("GET SCRM data failed", { context: "compliance/scrms", error: err });
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(req?: NextRequest) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify role (admin or ionic_user)
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (profile?.role !== "admin" && profile?.role !== "ionic_user") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    let vendorId: string | null = null;
    if (req) {
      const body = await req.json().catch(() => ({}));
      vendorId = body.vendorId;
    }

    if (vendorId) {
      console.log(`[Manual Recalibration] Triggered by ${user.id} for vendor ${vendorId}`);
      await triggerGrcRecalibration(null, user.id, vendorId);
      return NextResponse.json({ success: true, message: "Recalibration completed successfully." });
    }

    // 1. Fetch active baseline to get product_version_id
    const { data: baseline } = await supabase
      .from("msr_baselines")
      .select("product_version_id")
      .eq("status", "active")
      .is("vendor_id", null)
      .limit(1)
      .maybeSingle();

    let productVersionId = baseline?.product_version_id;

    if (!productVersionId) {
      // Fallback: fetch first product version if no active baseline exists yet
      const { data: fallbackVersion } = await supabase
        .from("product_versions")
        .select("id")
        .limit(1)
        .maybeSingle();

      productVersionId = fallbackVersion?.id;
    }

    if (!productVersionId) {
      return NextResponse.json({ error: "No product version found to calibrate." }, { status: 400 });
    }

    console.log(`[Manual Recalibration] Triggered by ${user.id} for version ${productVersionId}`);
    
    // Await the recalibration so the UI receives success once it is fully done
    await triggerGrcRecalibration(productVersionId, user.id);

    return NextResponse.json({ success: true, message: "Recalibration completed successfully." });
  } catch (err: any) {
    logger.error("POST SCRM recalibration failed", { context: "compliance/scrms", error: err });
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
