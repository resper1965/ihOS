// POST /api/settings/integrations/standard-api/key
//
// Lets an admin/ionic_user store the Standard GRC API key in Supabase Vault.
//
// The important part is not the write — it's that `getSecret` (src/lib/
// supabase/vault.ts) checks process.env FIRST, so a key saved here is inert
// wherever STANDARD_GRC_API_KEY is set as an env var, which is every
// environment today (local and Vercel). That precedence is deliberate:
// deployed configuration must stay authoritative over a database row. So this
// route does not invert it — it reports `shadowedByEnv` so the response never
// looks like a no-op success.
//
// Auth gate mirrors src/app/api/settings/integrations/standard-api/route.ts
// (itself copied from src/app/api/compliance/mappings/sync/route.ts:18-29).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSecretSource, invalidateSecretCache } from "@/lib/supabase/vault";

export const dynamic = "force-dynamic";

const SECRET_NAME = "STANDARD_GRC_API_KEY";
const KEY_MARKERS = ["standard_live_", "standard_test_"] as const;
const KEY_PREFIX_LENGTH = 12;
// marker (14 chars) + at least 10 chars of key material — matches the
// STANDARD_GRC_API_KEY min-length convention in src/lib/env.ts.
const KEY_MIN_LENGTH = 24;

function validateKeyShape(key: unknown): string | null {
  if (typeof key !== "string") return null;
  if (key.length < KEY_MIN_LENGTH) return null;
  return KEY_MARKERS.find((marker) => key.startsWith(marker)) ?? null;
}

function extractKeyPrefix(key: string, marker: string): string | null {
  const prefix = key.slice(marker.length, marker.length + KEY_PREFIX_LENGTH);
  return prefix || null;
}

export async function POST(request: Request) {
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

  const body = await request.json().catch(() => null);
  const key = body?.key;

  const marker = validateKeyShape(key);
  if (!marker) {
    // Deliberately no submitted value in this error — never echo it back.
    return NextResponse.json(
      { error: "Key must start with standard_live_ or standard_test_ and be a plausible length." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  const { error: rpcError } = await (admin as any).rpc("set_vault_secret", {
    secret_name: SECRET_NAME,
    secret_value: key,
    secret_description: "Standard GRC API key (set via Settings)",
  });

  if (rpcError) {
    return NextResponse.json({ error: "Failed to store key" }, { status: 500 });
  }

  // The in-memory cache would otherwise keep serving the pre-save value (or
  // `null`) until the process restarts — a successful save that looks like it
  // did nothing.
  invalidateSecretCache(SECRET_NAME);

  const keyPrefix = extractKeyPrefix(key, marker);
  const shadowedByEnv = (await getSecretSource(SECRET_NAME)) === "env";

  return NextResponse.json({ ok: true, keyPrefix, shadowedByEnv });
}
