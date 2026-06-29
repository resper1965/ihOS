// src/app/api/chat/download-filled/route.ts
// Receives the original questionnaire (base64) and approved answers,
// writes answers into the spreadsheet cells, and returns the filled file.

import { logger } from '@/lib/logger';
import * as XLSX from 'xlsx';
import type { DownloadPayload } from '@/lib/chat/questionnaire-types';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    // Auth check
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } },
      );
    }

    const body = (await req.json()) as DownloadPayload;
    const { originalFileBase64, fileName, answers } = body;

    if (!originalFileBase64 || !fileName) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Request body must include "originalFileBase64" and "fileName".',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Request body must include a non-empty "answers" array.',
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } },
      );
    }

    // Decode the original file
    const fileBuffer = Buffer.from(originalFileBase64, 'base64');
    const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellDates: true });

    // Write each answer to the specified cell
    for (const entry of answers) {
      const { cellCoords, sheetName, rowIndex, answerColumnIndex, answer } = entry;

      // Determine which sheet to write to
      const targetSheetName = sheetName ?? workbook.SheetNames[0];
      const sheet = workbook.Sheets[targetSheetName];
      if (!sheet) {
        logger.warn("Sheet not found during questionnaire download", {
          context: "chat/download-filled",
          meta: { sheetName: targetSheetName }
        });
        continue;
      }

      if (cellCoords) {
        // Write directly to the cell reference (e.g. "C5")
        sheet[cellCoords] = { t: 's', v: answer };
      } else if (
        rowIndex !== undefined &&
        rowIndex !== null &&
        answerColumnIndex !== undefined &&
        answerColumnIndex !== null
      ) {
        // Compute cell reference from row + column indices
        const cellRef = XLSX.utils.encode_cell({
          r: rowIndex,
          c: answerColumnIndex,
        });
        sheet[cellRef] = { t: 's', v: answer };
      } else {
        logger.warn("Answer entry missing cell coordinates during questionnaire download", {
          context: "chat/download-filled"
        });
      }

      // Update the sheet range so xlsx includes the new cells when writing
      if (sheet['!ref']) {
        const range = XLSX.utils.decode_range(sheet['!ref']);
        // Expand range if needed
        if (cellCoords) {
          const decoded = XLSX.utils.decode_cell(cellCoords);
          if (decoded.r > range.e.r) range.e.r = decoded.r;
          if (decoded.c > range.e.c) range.e.c = decoded.c;
        } else if (rowIndex !== undefined && answerColumnIndex !== undefined) {
          if (rowIndex > range.e.r) range.e.r = rowIndex;
          if (answerColumnIndex > range.e.c) range.e.c = answerColumnIndex;
        }
        sheet['!ref'] = XLSX.utils.encode_range(range);
      }
    }

    // Write the modified workbook to a buffer
    const outputBuffer = XLSX.write(workbook, {
      bookType: 'xlsx',
      type: 'buffer',
    }) as Buffer;

    // Sanitise filename for Content-Disposition
    const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const downloadName = safeName.replace(/\.(xlsx|xls|csv)$/i, '') + '_filled.xlsx';

    return new Response(new Uint8Array(outputBuffer), {
      status: 200,
      headers: {
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${downloadName}"`,
        'Content-Length': String(outputBuffer.length),
      },
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Failed to generate filled file.';
    logger.error("Download filled questionnaire failed", { context: "chat/download-filled", meta: { error: message } });

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } },
    );
  }
}
