// src/lib/env.ts
// Validates all required environment variables at import time.
// Uses Zod v4 API (no required_error — use .error() or message param).

import { z } from 'zod';

/**
 * Zod v4 schema for server-side environment variables.
 */
const serverEnvSchema = z.object({
  // ── Supabase ──────────────────────────────────────────────────────────
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url('NEXT_PUBLIC_SUPABASE_URL must be a valid URL'),

  NEXT_PUBLIC_SUPABASE_ANON_KEY: z
    .string()
    .min(20, 'NEXT_PUBLIC_SUPABASE_ANON_KEY looks too short'),

  SUPABASE_SERVICE_ROLE_KEY: z
    .string()
    .min(20, 'SUPABASE_SERVICE_ROLE_KEY looks too short'),

  // ── OpenAI ────────────────────────────────────────────────────────────
  OPENAI_API_KEY: z
    .string()
    .refine(
      (val) => val.startsWith('sk-') || val.startsWith('vck_'),
      'OPENAI_API_KEY must start with "sk-" or "vck_"'
    )
    .optional(),

  OPENAI_BASE_URL: z
    .string()
    .url('OPENAI_BASE_URL must be a valid URL')
    .optional(),

  // ── Standard GRC API ──────────────────────────────────────────────────
  STANDARD_GRC_API_URL: z
    .string()
    .url('STANDARD_GRC_API_URL must be a valid URL'),

  STANDARD_GRC_API_KEY: z
    .string()
    .min(10, 'STANDARD_GRC_API_KEY looks too short')
    .optional(),


  STANDARD_GRC_TENANT_ID: z
    .string()
    .optional(),

  // ── CRON ──────────────────────────────────────────────────────────────
  CRON_SECRET: z
    .string()
    .min(32, 'CRON_SECRET must be at least 32 characters')
    .optional()
    .refine((val) => {
      if (process.env.NODE_ENV === 'production') return !!val;
      return true;
    }, 'CRON_SECRET is required in production environment'),

  // ── Composio ────────────────────────────────────────────────────────────
  COMPOSIO_API_KEY: z
    .string()
    .min(10, 'COMPOSIO_API_KEY looks too short')
    .optional(),

  // ── DefectDojo ─────────────────────────────────────────────────────────
  DEFECTDOJO_BASE_URL: z
    .string()
    .url('DEFECTDOJO_BASE_URL must be a valid URL')
    .optional(),

  DEFECTDOJO_API_KEY: z
    .string()
    .min(10, 'DEFECTDOJO_API_KEY looks too short')
    .optional(),

  DEFECTDOJO_PRODUCT_ID: z
    .coerce.number()
    .optional(),

  // ── Node ──────────────────────────────────────────────────────────────
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
});

// ── Parse & Export ────────────────────────────────────────────────────────────

function validateEnv() {
  const result = serverEnvSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.issues
      .map((issue) => `  ✗ ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    console.error(
      `\n╔══════════════════════════════════════════════════════╗\n` +
      `║  ❌ Environment Variable Validation Failed           ║\n` +
      `╚══════════════════════════════════════════════════════╝\n\n` +
      `${formatted}\n\n` +
      `Create a .env.local file with the required variables.\n` +
      `See .env.example for reference.\n`
    );

    // In production, crash hard. In dev, warn but continue.
    if (process.env.NODE_ENV === 'production') {
      throw new Error('Missing required environment variables in production');
    }
  }

  return result.success ? result.data : (process.env as unknown as z.infer<typeof serverEnvSchema>);
}

/**
 * Validated environment variables.
 * Import as: `import { env } from '@/lib/env'`
 */
export const env = validateEnv();

export type Env = z.infer<typeof serverEnvSchema>;
