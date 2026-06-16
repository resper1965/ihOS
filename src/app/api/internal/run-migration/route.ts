// src/app/api/internal/run-migration/route.ts
// ONE-TIME migration endpoint — REMOVE AFTER USE
// Protected by INTERNAL_MIGRATION_SECRET env var

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  // Simple secret check to avoid unauthorized execution
  const auth = request.headers.get("x-migration-secret");
  const secret = process.env.INTERNAL_MIGRATION_SECRET;

  if (!secret || auth !== secret) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const results: Record<string, unknown> = {};

  // Check current columns
  const { data: before } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .limit(1);

  results.columnsBefore = before && before[0] ? Object.keys(before[0]) : [];

  // Run migration via rpc if available, otherwise try direct update
  // Supabase service_role can use .rpc for custom functions
  // But we can also do it via the Admin API using fetch to the postgres endpoint

  // Strategy: use supabase-js to call a raw SQL function via RPC
  // We'll create an exec_sql function first if it doesn't exist
  try {
    // Try to use pg directly via supabase admin
    // The service role key can run arbitrary queries via the REST API
    // using Content-Profile: pg_catalog or similar

    const migrationSQL = `
      ALTER TABLE public.profiles
        ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS preferences JSONB DEFAULT '{}'::jsonb
    `;

    // Use the Supabase SQL endpoint (available via service_role in some versions)
    const response = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      {
        method: "POST",
        headers: {
          apikey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
          Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY!}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ sql: migrationSQL }),
      }
    );

    if (response.ok) {
      results.migrationResult = await response.json();
    } else {
      results.migrationRpcError = await response.text();

      // Fallback: try via pg_net or direct column add via update trick
      // Alternative: use supabase-js .rpc with SECURITY DEFINER function
      results.note = "exec_sql RPC not available — manual migration required";
    }
  } catch (err) {
    results.error = String(err);
  }

  // Verify columns after
  const { data: after } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .limit(1);

  results.columnsAfter = after && after[0] ? Object.keys(after[0]) : [];
  results.onboardingColumnPresent = results.columnsAfter
    ? (results.columnsAfter as string[]).includes("onboarding_completed")
    : false;

  return NextResponse.json(results);
}
