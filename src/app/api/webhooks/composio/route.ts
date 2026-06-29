import { logger } from '@/lib/logger';
import { NextRequest, NextResponse } from "next/server";

/**
 * POST /api/webhooks/composio
 *
 * Receives trigger events from Composio connected integrations.
 * Currently handles SharePoint triggers with placeholder logic;
 * full processing will be implemented in a future phase.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const triggerName: string | undefined = body.triggerName;

    if (!triggerName) {
      return NextResponse.json(
        { error: "Missing triggerName in payload" },
        { status: 400 },
      );
    }

    switch (triggerName) {
      // -----------------------------------------------------------------
      // SharePoint: new document uploaded
      // -----------------------------------------------------------------
      case "SHAREPOINT_ON_ITEM_CREATED": {
        // TODO: Parse item metadata from body.payload
        // TODO: Auto-classify document against compliance framework
        // TODO: Route notification to document owner
        // TODO: Trigger document ingestion pipeline if applicable
        console.log(
          "[composio-webhook] SharePoint item created:",
          JSON.stringify(body.payload ?? {}).slice(0, 500),
        );
        break;
      }

      // -----------------------------------------------------------------
      // SharePoint: existing document modified
      // -----------------------------------------------------------------
      case "SHAREPOINT_ON_ITEM_MODIFIED": {
        // TODO: Diff against previous version for compliance impact
        // TODO: Update document_versions tracking table
        // TODO: Re-run compliance checks if document is in scope
        // TODO: Notify reviewers of modification
        console.log(
          "[composio-webhook] SharePoint item modified:",
          JSON.stringify(body.payload ?? {}).slice(0, 500),
        );
        break;
      }

      default: {
        console.log(
          `[composio-webhook] Unhandled trigger: ${triggerName}`,
        );
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (err) {
    logger.error("Error processing Composio webhook", { context: "webhooks/composio", error: err });
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
