// src/app/api/documents/validate-clarity/route.ts
// POST endpoint for analyzing document quality against Clarity Gate requirements.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { resolveFileType, extractText } from '@/lib/chat/document-extractor';
import { verifyClarity } from '@/lib/chat/clarity-gate';
import { logger } from '@/lib/logger';

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

export async function POST(req: Request) {
  try {
    const supabase = await createClient();

    // ── 1. Auth check ────────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 },
      );
    }

    // ── 2. Parse multipart form ──────────────────────────────────────────
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'A "file" field is required.' },
        { status: 400 },
      );
    }

    // ── 3. File validation ───────────────────────────────────────────────
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        {
          success: false,
          error: `File exceeds maximum size of ${MAX_FILE_SIZE / (1024 * 1024)}MB.`,
        },
        { status: 400 },
      );
    }

    const fileType = resolveFileType(file);
    if (!fileType) {
      return NextResponse.json(
        {
          success: false,
          error: `Unsupported file type "${file.type || 'unknown'}". Accepted: pdf, txt, md, csv.`,
        },
        { status: 400 },
      );
    }

    // ── 4. Text extraction ───────────────────────────────────────────────
    const text = await extractText(file, fileType);
    if (!text.trim()) {
      return NextResponse.json(
        { success: false, error: 'No text content could be extracted from the file.' },
        { status: 400 },
      );
    }

    // ── 5. Run Clarity Gate analysis ────────────────────────────────────
    const analysisReport = await verifyClarity(text);

    return NextResponse.json({
      success: true,
      data: analysisReport,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Clarity validation failed.';
    logger.error(message, { context: 'documents/validate-clarity', error: err });
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
