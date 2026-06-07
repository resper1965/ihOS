// src/app/api/documents/upload/route.ts
// POST endpoint for document upload with text extraction, chunking, and embedding.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkDocument } from '@/lib/chat/chunker';
import { generateEmbeddings } from '@/lib/chat/embeddings';

export const maxDuration = 120;

// ── Constants ────────────────────────────────────────────────────────────────

const ACCEPTED_TYPES = new Map<string, string>([
  ['application/pdf', 'pdf'],
  ['text/plain', 'txt'],
  ['text/markdown', 'md'],
  ['text/csv', 'csv'],
  // Common MIME aliases
  ['application/x-pdf', 'pdf'],
  ['text/x-markdown', 'md'],
]);

/** File extension fallback when MIME type is generic (e.g. application/octet-stream) */
const EXTENSION_MAP: Record<string, string> = {
  '.pdf': 'pdf',
  '.txt': 'txt',
  '.md': 'md',
  '.csv': 'csv',
};

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB

// ── Helpers ──────────────────────────────────────────────────────────────────

function resolveFileType(file: File): string | null {
  // Try MIME type first
  const fromMime = ACCEPTED_TYPES.get(file.type);
  if (fromMime) return fromMime;

  // Fallback to extension
  const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  return EXTENSION_MAP[ext] ?? null;
}

async function extractText(file: File, fileType: string): Promise<string> {
  if (fileType === 'pdf') {
    const arrayBuf = await file.arrayBuffer();
    const { PDFParse } = await import('pdf-parse');
    const parser = new PDFParse({ data: new Uint8Array(arrayBuf) });
    const result = await parser.getText();
    await parser.destroy();
    return result.text;
  }

  // txt, md, csv — read as UTF-8
  return await file.text();
}

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

    // ── 5. Insert document record (status: processing) ──────────────────
    const { data: docRecord, error: insertError } = await supabase
      .from('compliance_documents')
      .insert({
        filename: file.name,
        filepath: `uploads/${file.name}`,
        doc_type: fileType,
        file_format: fileType,
        file_size_bytes: file.size,
        category: category as 'ISMS_CORE' | 'B2B_GEHC' | 'OPERATIONAL',
        title: file.name,
        total_chunks: 0,
        policy_number: null,
        language: 'pt',
        year: new Date().getFullYear(),
      })
      .select('id')
      .single();

    if (insertError || !docRecord) {
      console.error('[upload] Insert document error:', insertError?.message);
      return NextResponse.json(
        { success: false, error: 'Failed to create document record.' },
        { status: 500 },
      );
    }

    documentId = docRecord.id;

    // ── 6. Chunk text ────────────────────────────────────────────────────
    const chunks = chunkDocument(text);

    if (chunks.length === 0) {
      await supabase
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

    const { error: chunkInsertError } = await supabase
      .from('document_chunks')
      .insert(chunkRows);

    if (chunkInsertError) {
      console.error('[upload] Insert chunks error:', chunkInsertError.message);
      // Mark document as failed
      await supabase
        .from('compliance_documents')
        .update({ total_chunks: 0 })
        .eq('id', documentId);

      return NextResponse.json(
        { success: false, error: 'Failed to store document chunks.' },
        { status: 500 },
      );
    }

    // ── 9. Update document status ────────────────────────────────────────
    await supabase
      .from('compliance_documents')
      .update({ total_chunks: chunks.length })
      .eq('id', documentId);

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
    console.error('[upload] Unexpected error:', message);

    // Best-effort: mark document as errored if we have an ID
    if (documentId) {
      try {
        const sb = await createClient();
        await sb
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
