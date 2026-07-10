import { logger } from '@/lib/logger';
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { error } = await supabase
      .from('vendors' as any)
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      message: "Vendor deleted successfully"
    });
  } catch (error) {
    logger.error("Delete vendor failed", { context: "compliance/vendors/delete", error: error });
    return NextResponse.json(
      {
        success: false,
        error: "Failed to delete vendor",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, risk_level, status } = body;

    const updateData: Record<string, any> = {};
    if (name !== undefined) updateData.name = name.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (risk_level !== undefined) updateData.risk_level = risk_level;
    if (status !== undefined) updateData.status = status;
    updateData.updated_at = new Date().toISOString();

    const { data: vendor, error } = await supabase
      .from('vendors' as any)
      .update(updateData)
      .eq('id', params.id)
      .eq('user_id', user.id)
      .select('*')
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: vendor,
    });
  } catch (error) {
    logger.error("Update vendor failed", { context: "compliance/vendors/update", error: error });
    return NextResponse.json(
      {
        success: false,
        error: "Failed to update vendor",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
