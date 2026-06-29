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
      case "SHAREPOINT_ON_ITEM_CREATED": {
        logger.info("SharePoint item created trigger received", {
          context: "webhooks/composio",
          meta: { payload: body.payload }
        });
        break;
      }

      case "SHAREPOINT_ON_ITEM_MODIFIED": {
        logger.info("SharePoint item modified trigger received", {
          context: "webhooks/composio",
          meta: { payload: body.payload }
        });
        break;
      }

      default: {
        logger.info("Unhandled trigger received", {
          context: "webhooks/composio",
          meta: { triggerName }
        });
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
