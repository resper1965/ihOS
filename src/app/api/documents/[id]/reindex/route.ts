import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { chunkDocument } from '@/lib/chat/chunker';
import { generateEmbeddings } from '@/lib/chat/embeddings';
import { extractText } from '@/lib/chat/document-extractor';

export const maxDuration = 120; // 2 minutes max

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
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

    // Verify role (optional, but good practice for an admin route)
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    if (profile?.role !== 'admin' && profile?.role !== 'ionic_user') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized to perform re-indexing.' },
        { status: 403 },
      );
    }

    // Resolve params.id since params is a Promise in Next.js 15
    const { id } = await params;
    const documentId = parseInt(id, 10);

    if (isNaN(documentId)) {
      return NextResponse.json(
        { success: false, error: 'Invalid document ID.' },
        { status: 400 },
      );
    }

    // ── 2. Fetch Document ────────────────────────────────────────────────
    const { data: doc, error: docError } = await supabase
      .from('compliance_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (docError || !doc) {
      return NextResponse.json(
        { success: false, error: 'Document not found.' },
        { status: 404 },
      );
    }

    if (!doc.filepath) {
      return NextResponse.json(
        { success: false, error: 'Document does not have an associated file path in storage.' },
        { status: 400 },
      );
    }

    // ── 3. Download File from Storage ────────────────────────────────────
    const { data: fileData, error: downloadError } = await supabase.storage
      .from('compliance_documents')
      .download(doc.filepath);

    if (downloadError || !fileData) {
      console.error('[reindex] Storage download error:', downloadError?.message);
      return NextResponse.json(
        { success: false, error: `Failed to download file from storage: ${downloadError?.message}` },
        { status: 500 },
      );
    }

    // Convert Blob to File object for the extractor
    const arrayBuffer = await fileData.arrayBuffer();
    const mimeType = doc.file_format === 'pdf' ? 'application/pdf' : 'text/plain';
    const file = new File([arrayBuffer], doc.filename, { type: mimeType });

    // ── 4. Text Extraction ───────────────────────────────────────────────
    const text = await extractText(file, doc.file_format || 'txt');
    if (!text.trim()) {
      return NextResponse.json(
        { success: false, error: 'No text content could be extracted from the file.' },
        { status: 400 },
      );
    }

    // ── 5. Chunking ──────────────────────────────────────────────────────
    const chunks = chunkDocument(text);

    // ── 6. Delete old chunks ─────────────────────────────────────────────
    const { error: deleteError } = await supabase
      .from('document_chunks')
      .delete()
      .eq('document_id', documentId);

    if (deleteError) {
      console.error('[reindex] Failed to delete old chunks:', deleteError.message);
      return NextResponse.json(
        { success: false, error: 'Failed to delete previous document chunks.' },
        { status: 500 },
      );
    }

    if (chunks.length === 0) {
      await supabase
        .from('compliance_documents')
        .update({ total_chunks: 0 })
        .eq('id', documentId);

      return NextResponse.json(
        { success: true, data: { documentId, chunkCount: 0, status: 'reindexed' } },
        { status: 200 },
      );
    }

    // ── 7. Generate Embeddings ───────────────────────────────────────────
    const chunkTexts = chunks.map((c) => c.content);
    const embeddings = await generateEmbeddings(chunkTexts);

    // ── 8. Insert new chunks ─────────────────────────────────────────────
    const chunkRows = chunks.map((chunk, idx) => ({
      document_id: documentId,
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
      console.error('[reindex] Insert chunks error:', chunkInsertError.message);
      
      await supabase
        .from('compliance_documents')
        .update({ total_chunks: 0 })
        .eq('id', documentId);

      return NextResponse.json(
        { success: false, error: 'Failed to store new document chunks.' },
        { status: 500 },
      );
    }

    // ── 9. Update Document metadata ──────────────────────────────────────
    await supabase
      .from('compliance_documents')
      .update({ total_chunks: chunks.length })
      .eq('id', documentId);

    return NextResponse.json(
      { success: true, data: { documentId, chunkCount: chunks.length, status: 'reindexed' } },
      { status: 200 },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Document re-indexing failed.';
    console.error('[reindex] Unexpected error:', message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
