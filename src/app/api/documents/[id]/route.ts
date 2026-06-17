// src/app/api/documents/[id]/route.ts
// PATCH — update document metadata (version, category, status)
// DELETE — delete document and its chunks

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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

  const { id } = await params;
  const docId = parseInt(id, 10);
  if (isNaN(docId)) {
    return NextResponse.json({ error: "Invalid document ID" }, { status: 400 });
  }

  let body: { product_version_id?: string | null; category?: string; status?: string };
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

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
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
