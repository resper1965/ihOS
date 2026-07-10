import { logger } from '@/lib/logger';
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

    const { data: vendors, error } = await supabase
      .from('vendors' as any)
      .select('*')
      .order('created_at', { ascending: false });

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: vendors ?? [],
    });
  } catch (error) {
    logger.error("Fetch vendors failed", { context: "compliance/vendors", error: error });
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch vendors",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, description, risk_level, status } = body;

    if (!name || name.trim() === "") {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    const { data: vendor, error } = await supabase
      .from('vendors' as any)
      .insert({
        name: name.trim(),
        description: description?.trim() || null,
        risk_level: risk_level || 'low',
        status: status || 'active',
        user_id: user.id
      })
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
    logger.error("Create vendor failed", { context: "compliance/vendors", error: error });
    return NextResponse.json(
      {
        success: false,
        error: "Failed to create vendor",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
