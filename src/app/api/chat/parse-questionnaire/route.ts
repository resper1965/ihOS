// src/app/api/chat/parse-questionnaire/route.ts
// Accepts a questionnaire file upload (multipart/form-data) and extracts questions

import { logger } from '@/lib/logger';
import { NextResponse } from 'next/server';
import { parseQuestionnaire } from '@/lib/chat/parser';
import { createClient } from '@/lib/supabase/server';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: 'Authentication required.' },
        { status: 401 }
      );
    }

    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json(
        { success: false, error: 'Missing or invalid "file" field in form data.' },
        { status: 400 },
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = file.name || 'unknown';

    const result = await parseQuestionnaire(buffer, fileName);

    return NextResponse.json(
      { success: true, data: result },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to parse questionnaire file.';
    logger.error("Parse questionnaire failed", { context: "chat/parse-questionnaire", meta: { error: message } });

    const status = message.includes('Unsupported file type') ? 422 : 500;

    return NextResponse.json(
      { success: false, error: message },
      { status },
    );
  }
}
