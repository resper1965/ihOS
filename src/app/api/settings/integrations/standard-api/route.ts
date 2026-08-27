// GET /api/settings/integrations/standard-api
//
// Replaces the hardcoded status="Connected" badge that used to render for the
// Standard GRC API row on the Settings page regardless of whether the key
// was valid, absent, expired, or — as it actually was — missing three scopes
// while every /intelligence/* call returned 403. This route probes the real
// API and reports what it actually says.
//
// Auth gate mirrors src/app/api/compliance/mappings/sync/route.ts:18-29.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getSecret, getSecretSource } from "@/lib/supabase/vault";

export const dynamic = "force-dynamic";

const KEY_PREFIX_MARKER = "standard_live_";
const KEY_PREFIX_LENGTH = 12;
const PROBE_TIMEOUT_MS = 5_000;

export type StandardApiHealth = {
  reachable: boolean;
  keyConfigured: boolean;
  keyPrefix: string | null; // first 12 chars after standard_live_, never the key
  keySource: "env" | "vault" | "none"; // which source getSecret() actually resolved — see vault.ts's getSecretSource
  scopesHeld: string[] | null; // parsed from the API's own 403 body
  scopesMissing: string[] | null;
  catalogReadable: boolean;
  checkedAt: string;
  detail: string | null;
};

/**
 * Parses "This API key lacks the required scope(s): <missing>. Key has: <held>."
 * out of a Standard API 403 `detail` string. Fails closed: any shape that
 * doesn't match yields { scopesHeld: null, scopesMissing: null } rather than a
 * partial or guessed parse — a half-parsed scope list shown as fact is the
 * same defect class this route exists to remove.
 */
export function parseScopeError(
  detail: string | null | undefined
): { scopesHeld: string[] | null; scopesMissing: string[] | null } {
  if (!detail) return { scopesHeld: null, scopesMissing: null };

  const match = detail.match(
    /required scope\(s\):\s*([^.]+)\.\s*Key has:\s*([^.]+)\.?/i
  );
  if (!match) return { scopesHeld: null, scopesMissing: null };

  const scopesMissing = match[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const scopesHeld = match[2]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  if (scopesMissing.length === 0 || scopesHeld.length === 0) {
    return { scopesHeld: null, scopesMissing: null };
  }

  return { scopesHeld, scopesMissing };
}

function extractKeyPrefix(apiKey: string): string | null {
  if (!apiKey.startsWith(KEY_PREFIX_MARKER)) return null;
  const prefix = apiKey.slice(
    KEY_PREFIX_MARKER.length,
    KEY_PREFIX_MARKER.length + KEY_PREFIX_LENGTH
  );
  return prefix || null;
}

async function probe(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

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
    .select("role")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "admin" && profile?.role !== "ionic_user") {
    return NextResponse.json(
      { error: "Forbidden: Admin or Ionic User required" },
      { status: 403 }
    );
  }

  const checkedAt = new Date().toISOString();

  let apiKey: string | null = null;
  try {
    apiKey = await getSecret("STANDARD_GRC_API_KEY");
  } catch {
    apiKey = null;
  }

  if (!apiKey) {
    const health: StandardApiHealth = {
      reachable: false,
      keyConfigured: false,
      keyPrefix: null,
      keySource: "none",
      scopesHeld: null,
      scopesMissing: null,
      catalogReadable: false,
      checkedAt,
      detail: "STANDARD_GRC_API_KEY is not configured.",
    };
    return NextResponse.json(health);
  }

  const keySource = await getSecretSource("STANDARD_GRC_API_KEY");

  const keyPrefix = extractKeyPrefix(apiKey);
  const baseUrl = (process.env.STANDARD_GRC_API_URL || "").replace(/\/+$/, "");
  const authHeaders = { Authorization: `Bearer ${apiKey}`, Accept: "application/json" };

  let reachable = false;
  let catalogReadable = false;
  let scopesHeld: string[] | null = null;
  let scopesMissing: string[] | null = null;
  let detail: string | null = null;

  // 1. GET /scf/versions/latest — proves the credential authenticates at all.
  try {
    const versionsRes = await probe(`${baseUrl}/scf/versions/latest`, {
      method: "GET",
      headers: authHeaders,
    });
    reachable = versionsRes.ok;
    catalogReadable = versionsRes.ok;
    if (!versionsRes.ok) {
      const body: any = await versionsRes.json().catch(() => null);
      detail = typeof body?.detail === "string" ? body.detail : `HTTP ${versionsRes.status}`;
    }
  } catch (err) {
    reachable = false;
    catalogReadable = false;
    detail = err instanceof Error ? err.message : "Network error probing Standard API";
  }

  // 2. POST /intelligence/compliance-score — proves whether the scorer scope
  //    is present. A minimal body; this is a probe, not a real assessment.
  try {
    const scoreRes = await probe(`${baseUrl}/intelligence/compliance-score`, {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ framework_code: "iso27001" }),
    });

    if (scoreRes.ok) {
      scopesMissing = [];
    } else {
      const body: any = await scoreRes.json().catch(() => null);
      const scopeDetail = typeof body?.detail === "string" ? body.detail : null;
      const parsed = parseScopeError(scopeDetail);
      scopesHeld = parsed.scopesHeld;
      scopesMissing = parsed.scopesMissing;
      if (!detail && scopeDetail) detail = scopeDetail;
    }
  } catch (err) {
    if (!detail) detail = err instanceof Error ? err.message : "Network error probing Standard API";
  }

  const health: StandardApiHealth = {
    reachable,
    keyConfigured: true,
    keyPrefix,
    keySource,
    scopesHeld,
    scopesMissing,
    catalogReadable,
    checkedAt,
    detail,
  };

  return NextResponse.json(health);
}
