// src/app/api/documents/upload/route.ts
// POST endpoint for document upload with text extraction, chunking, and embedding.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkDocument } from '@/lib/chat/chunker';
import { generateEmbeddings } from '@/lib/chat/embeddings';
import { resolveFileType, extractText } from '@/lib/chat/document-extractor';
import { verifyClarity } from '@/lib/chat/clarity-gate';
import { extractDeltasFromDocument, persistDeltas } from '@/lib/assessment/delta-extractor';
import { logger } from '@/lib/logger';
import { triggerGrcRecalibration } from '@/lib/assessment/grc-trigger';
import { createAdminClient } from '@/lib/supabase/admin';
import { DOCUMENT_TYPES } from '@/lib/supabase/types-custom';

export const maxDuration = 120;

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  let documentId: number | null = null;
  let supabase: Awaited<ReturnType<typeof createClient>>;

  try {
    supabase = await createClient();

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
    const category = (formData.get('category') as string) || 'ISMS_CORE';
    const docTypeRaw = (formData.get('docType') as string) || 'UNCLASSIFIED';
    const docType = docTypeRaw in DOCUMENT_TYPES ? docTypeRaw : 'UNCLASSIFIED';
    const productVersionId = formData.get('productVersionId') as string | null;
    const version = (formData.get('version') as string) || '1.0';
    const status = (formData.get('status') as string) || 'published';
    const expiresAt = formData.get('expiresAt') as string | null;
    const forceIndex = formData.get('forceIndex') === 'true';

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
          error: `Unsupported file type "${file.type || 'unknown'}". Accepted: pdf, txt, md, csv, docx.`,
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


    if (!forceIndex) {
      const clarityReport = await verifyClarity(text);
      if (clarityReport.clarityStatus === 'UNCLEAR') {
        return NextResponse.json(
          {
            success: false,
            error: 'Document fails Clarity Gate quality check.',
            clarityReport,
          },
          { status: 422 },
        );
      }
    }

    const adminSupabase = createAdminClient();
    
    // ── 4c. Upload file to Supabase Storage ──────────────────────────────
    const fileBytes = await file.arrayBuffer();
    const buffer = Buffer.from(fileBytes);
    
    const uniqueFilename = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')}`;
    const storagePath = `${category}/${uniqueFilename}`;

    const { error: storageError } = await adminSupabase.storage
      .from('compliance_documents')
      .upload(storagePath, buffer, {
        contentType: file.type || 'application/octet-stream',
        upsert: true,
      });

    if (storageError) {
      logger.error('Storage upload failed', { context: 'documents/upload', meta: { error: storageError.message } });
      return NextResponse.json(
        { success: false, error: `Failed to upload document to storage: ${storageError.message}` },
        { status: 500 },
      );
    }

    // ── 5. Insert document record (status: processing) ──────────────────
    const { data: docRecord, error: insertError } = await adminSupabase
      .from('compliance_documents')
      .insert({
        filename: file.name,
        filepath: storagePath,
        doc_type: docType,
        file_format: fileType,
        file_size_bytes: file.size,
        category: category as 'ISMS_CORE' | 'B2B_GEHC' | 'B2B_DIRECT' | 'OPERATIONAL',
        title: file.name,
        total_chunks: 0,
        policy_number: null,
        language: 'pt',
        year: new Date().getFullYear(),
        product_version_id: productVersionId || null,
        version: version,
        status: status as 'draft' | 'published' | 'superseded' | 'expired',
        expires_at: expiresAt || null,
        clarity_report: formData.get("clarityReport") ? JSON.parse(formData.get("clarityReport") as string) : null,
      } as any)
      .select('id')
      .single();

    if (insertError || !docRecord) {
      logger.error('Insert document record failed', { context: 'documents/upload', meta: { error: insertError?.message } });
      return NextResponse.json(
        { success: false, error: `Failed to create document record: ${insertError?.message || 'No docRecord returned'}` },
        { status: 500 },
      );
    }

    documentId = docRecord.id;

    // ── 6. Chunk text ────────────────────────────────────────────────────
    const chunks = chunkDocument(text);

    if (chunks.length === 0) {
      await adminSupabase
        .from('compliance_documents')
        .update({ total_chunks: 0 })
        .eq('id', documentId);

      return NextResponse.json(
        {
          success: true,
          data: { documentId, chunkCount: 0, status: 'indexed' },
        },
        { status: 200 },
      );
    }

    // ── 7. Generate embeddings for all chunks ────────────────────────────
    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(chunkTexts);

    // ── 8. Insert chunks into document_chunks ────────────────────────────
    const chunkRows = chunks.map((chunk, idx) => ({
      document_id: documentId!,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[idx]),
      section_title: chunk.metadata.sectionTitle ?? null,
      chunk_index: chunk.index,
      char_count: chunk.content.length,
      nist_families: null,
      iso_controls: null,
      content_en: null,
      scf_controls: null,
    }));

    const { error: chunkInsertError } = await adminSupabase
      .from('document_chunks')
      .insert(chunkRows);

    if (chunkInsertError) {
      logger.error('Insert chunks failed', { context: 'documents/upload', meta: { error: chunkInsertError.message } });
      // Mark document as failed
      await adminSupabase
        .from('compliance_documents')
        .update({ total_chunks: 0 })
        .eq('id', documentId);

      return NextResponse.json(
        { success: false, error: 'Failed to store document chunks.' },
        { status: 500 },
      );
    }

    // ── 9. Update document status ────────────────────────────────────────
    await adminSupabase
      .from('compliance_documents')
      .update({ total_chunks: chunks.length })
      .eq('id', documentId);

    // ── 10. Background Recalibration & Delta Extraction ───────────────────
    if (productVersionId) {
      (async () => {
        try {
          console.log(`[Background Pipeline] Extracting deltas for doc ${documentId}...`);
          const extractedDeltas = await extractDeltasFromDocument(text);
          if (extractedDeltas && extractedDeltas.length > 0) {
            console.log(`[Background Pipeline] Found ${extractedDeltas.length} deltas. Upserting...`);
            const { error: deltaError, degraded } = await persistDeltas(
              createAdminClient(),
              productVersionId,
              extractedDeltas,
              documentId,
            );
            if (deltaError) {
              logger.warn('Failed to upsert deltas', { context: 'documents/upload', meta: { error: deltaError } });
            } else if (degraded) {
              logger.warn('Persisted deltas without confidence columns (apply 20260702000002_version_baseline_lineage.sql)', { context: 'documents/upload' });
            }
          }

          await triggerGrcRecalibration(productVersionId, user.id);
        } catch (bgErr) {
          logger.error('Background pipeline failed', { context: 'documents/upload', error: bgErr });
        }
      })();
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          documentId,
          chunkCount: chunks.length,
          status: 'indexed',
        },
      },
      { status: 200 },
    );
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Document upload failed.';
    logger.error(message, { context: 'documents/upload', error: err });

    // Best-effort: mark document as errored if we have an ID
    if (documentId) {
      try {
        const adminSb = createAdminClient();
        await adminSb
          .from('compliance_documents')
          .update({ total_chunks: 0 })
          .eq('id', documentId);
      } catch {
        // Swallow — already handling an error
      }
    }

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
