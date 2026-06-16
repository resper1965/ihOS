// src/app/api/versions/route.ts
// GET  — list all product versions
// POST — create a new version (admin/ionic_user only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ProductVersionInsert } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { user: null, profile: null, error: "Unauthorized" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ionic_user")) {
    return { user: null, profile: null, error: "Forbidden" };
  }
  return { user, profile, error: null };
}

export async function GET() {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("product_versions")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { error: authError } = await requireAdmin(supabase);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError === "Unauthorized" ? 401 : 403 });
  }

  let body: { product_name: string; version_code: string; technical_specs?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { product_name, version_code, technical_specs = {} } = body;

  if (!product_name?.trim() || !version_code?.trim()) {
    return NextResponse.json({ error: "product_name and version_code are required" }, { status: 400 });
  }

  const insert: ProductVersionInsert = {
    product_name: product_name.trim(),
    version_code: version_code.trim(),
    status: "supported", // new versions start as supported, admin promotes to active
    technical_specs,
  };

  const { data, error } = await supabase
    .from("product_versions")
    .insert(insert)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ version: data }, { status: 201 });
}
