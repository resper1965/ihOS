// src/app/api/versions/[id]/route.ts
// PATCH  — update status or specs (admin/ionic_user only)
// DELETE — deprecate version (admin/ionic_user only)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { ProductVersion, ProductVersionUpdate } from "@/lib/supabase/types";

export const dynamic = "force-dynamic";

const VALID_STATUSES = new Set(["active", "supported", "deprecated"]);

async function requireAdmin(supabase: Awaited<ReturnType<typeof createClient>>) {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return { error: "Unauthorized" as const };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "admin" && profile.role !== "ionic_user")) {
    return { error: "Forbidden" as const };
  }
  return { error: null };
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { error: authError } = await requireAdmin(supabase);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError === "Unauthorized" ? 401 : 403 });
  }

  const { id } = await params;

  let body: { status?: string; technical_specs?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.has(body.status)) {
      return NextResponse.json(
        { error: `Invalid status. Must be one of: ${[...VALID_STATUSES].join(", ")}` },
        { status: 400 }
      );
    }
    update.status = body.status;

    // If activating this version, demote all others to "supported"
    if (body.status === "active") {
      await supabase
        .from("product_versions")
        .update({ status: "supported" })
        .eq("status", "active")
        .neq("id", id);
    }
  }

  if (body.technical_specs !== undefined) {
    update.technical_specs = body.technical_specs;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const typed: ProductVersionUpdate = {};
  if (update.status !== undefined) typed.status = update.status as ProductVersion["status"];
  if (update.technical_specs !== undefined) typed.technical_specs = update.technical_specs;

  const { data, error } = await supabase
    .from("product_versions")
    .update(typed)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ version: data });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { error: authError } = await requireAdmin(supabase);
  if (authError) {
    return NextResponse.json({ error: authError }, { status: authError === "Unauthorized" ? 401 : 403 });
  }

  const { id } = await params;

  // Soft delete — mark as deprecated instead of removing
  const { data, error } = await supabase
    .from("product_versions")
    .update({ status: "deprecated" })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ version: data });
}
