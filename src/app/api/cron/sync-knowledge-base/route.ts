// src/app/api/cron/sync-knowledge-base/route.ts
// Cron endpoint to process unindexed or untagged documents in the Knowledge Base.
// Runs the post-ingest pipeline (SCF tagging + provenance) for documents that missed it.

import { NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { createAdminClient } from '@/lib/supabase/admin';
import { runPostIngestPipeline } from '@/lib/chat/post-ingest-pipeline';

export const maxDuration = 300;

export async function POST(req: Request) {
  try {
    // ── Auth via CRON_SECRET ────────────────────────────────────────────────
    const authHeader = req.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;
    const isProduction = process.env.NODE_ENV === 'production';

    if (isProduction && !cronSecret) {
      return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 });
    }

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createAdminClient();

    // 1. Find documents that have chunks but might be missing SCF tags
    // We look for documents updated recently or marked as 'indexed' but where 
    // we want to ensure the pipeline has run.
    const { data: docs, error: docsError } = await admin
      .from('compliance_documents')
      .select('id, product_version_id, filename')
      .order('created_at', { ascending: false })
      .limit(5); // Process in small batches to stay within timeout

    if (docsError) throw docsError;

    const results = [];

    for (const doc of docs || []) {
      // Fetch chunks for this document
      const { data: chunks, error: chunksError } = await admin
        .from('document_chunks')
        .select('content, chunk_index, embedding')
        .eq('document_id', doc.id);

      if (chunksError || !chunks || chunks.length === 0) {
        results.push({ id: doc.id, filename: doc.filename, status: 'no_chunks' });
        continue;
      }

      // Check if already tagged (optional optimization, but runPostIngestPipeline handles it)
      // For cron, we force a run to ensure maximum metadata enrichment
      
      logger.info('Processing KB document in cron', { 
        context: 'cron/sync-knowledge-base', 
        meta: { documentId: doc.id, filename: doc.filename } 
      });

      const ingestChunks = chunks.map(c => ({
        content: c.content,
        chunk_index: c.chunk_index,
        embedding: typeof c.embedding === 'string' ? c.embedding : JSON.stringify(c.embedding)
      }));

      const pipelineResult = await runPostIngestPipeline(
        admin,
        doc.id,
        doc.product_version_id,
        ingestChunks
      );

      results.push({
        id: doc.id,
        filename: doc.filename,
        tagged: pipelineResult.tagged,
        provenance: pipelineResult.provenance
      });
    }

    return NextResponse.json({
      success: true,
      processed: results.length,
      details: results
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Cron KB sync failed';
    logger.error(message, { context: 'cron/sync-knowledge-base', error: err });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
