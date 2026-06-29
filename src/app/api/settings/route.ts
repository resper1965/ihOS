// src/app/api/settings/route.ts
// PATCH — persist user preferences in profiles.preferences (JSONB)

import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// Allowed preference keys — whitelist to prevent arbitrary JSONB injection
const ALLOWED_PREFS = new Set(["emailNotifications", "complianceAlerts", "darkMode"]);

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const ct = request.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      return NextResponse.json({ error: "Content-Type must be application/json" }, { status: 415 });
    }
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // Filter to only allowed keys
  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body)) {
    if (ALLOWED_PREFS.has(key)) {
      sanitized[key] = value;
    }
  }

  if (Object.keys(sanitized).length === 0) {
    return NextResponse.json({ error: "No valid preference keys provided" }, { status: 400 });
  }

  // Fetch existing preferences first to merge (avoid overwriting other keys)
  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();

  const existing =
    profile?.preferences && typeof profile.preferences === "object"
      ? (profile.preferences as Record<string, unknown>)
      : {};

  const merged = { ...existing, ...sanitized };

  const { error: updateError } = await supabase
    .from("profiles")
    .update({ preferences: merged as any })
    .eq("id", user.id);

  if (updateError) {
    logger.error("Update settings failed", { context: "settings", meta: { error: updateError.message } });
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, preferences: merged });
}

// GET — return current preferences
export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("preferences")
    .eq("id", user.id)
    .single();

  return NextResponse.json({
    preferences: profile?.preferences ?? {},
  });
}
