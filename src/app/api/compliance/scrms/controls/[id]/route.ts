import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Only administrators or internal users can update baselines (RBAC)
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || (profile.role !== "admin" && profile.role !== "ionic_user")) {
      return NextResponse.json({ error: "Forbidden: insufficient permissions" }, { status: 403 });
    }

    const body = await request.json();
    const { status, rejection_rationale } = body;

    if (!status || !["accepted", "rejected", "pending_review"].includes(status)) {
      return NextResponse.json({ error: "Invalid status value" }, { status: 400 });
    }

    const updateData: Record<string, any> = {
      status,
      updated_at: new Date().toISOString()
    };

    if (status === "rejected" && rejection_rationale !== undefined) {
      updateData.rejection_rationale = rejection_rationale;
    } else if (status === "accepted") {
      updateData.rejection_rationale = null;
    }

    const { data, error } = await (supabase as any)
      .from("msr_controls")
      .update(updateData)
      .eq("id", id)
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      control: data
    });

  } catch (err: any) {
    console.error("[api/scrms/controls/[id]] PATCH error:", err);
    return NextResponse.json({ error: err.message || "Internal Server Error" }, { status: 500 });
  }
}
