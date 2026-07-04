// src/app/api/documents/[id]/route.ts
// PATCH — update document metadata (version, category, status, doc_type)

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { DOCUMENT_TYPES } from "@/lib/supabase/types-custom";

export const dynamic = "force-dynamic";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // compliance_documents has SELECT-only RLS policies (005_rls_policies.sql),
  // so metadata writes must go through the admin client — gated by the same
  // role check used elsewhere (threat-modeling/seed): admin or ionic_user.
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();
  if (profile?.role !== "admin" && profile?.role !== "ionic_user") {
    return NextResponse.json({ error: "Forbidden: admin or ionic_user role required" }, { status: 403 });
  }

  const { id } = await params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) {
    return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
  }

  let body: { product_version_id?: string | null; category?: string; status?: string; doc_type?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Build update payload with only allowed fields
  const update: Record<string, unknown> = {};
  if (body.product_version_id !== undefined) {
    update.product_version_id = body.product_version_id; // null = generic
  }
  if (body.category) update.category = body.category;
  if (body.status) update.status = body.status;
  if (body.doc_type) {
    const validDocTypes = Object.keys(DOCUMENT_TYPES);
    if (!validDocTypes.includes(body.doc_type)) {
      return NextResponse.json({ error: `Invalid doc_type. Allowed: ${validDocTypes.join(', ')}` }, { status: 400 });
    }
    update.doc_type = body.doc_type;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data, error } = await (admin as any)
    .from("compliance_documents")
    .update(update)
    .eq("id", docId)
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ document: data });
}
