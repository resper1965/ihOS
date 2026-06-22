import { createAdminClient } from "@/lib/supabase/admin";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationSeverity =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "info";

export interface ComplianceNotification {
  userId: string;
  type: string;
  title: string;
  content: string;
  severity: NotificationSeverity;
  metadata?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Severity helpers
// ---------------------------------------------------------------------------

const SEVERITY_COLORS: Record<NotificationSeverity, string> = {
  critical: "FF0000",
  high: "FF8800",
  medium: "FFD700",
  low: "00AA00",
  info: "0078D4",
};

const SEVERITY_EMOJI: Record<NotificationSeverity, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
  info: "ℹ️",
};

// ---------------------------------------------------------------------------
// Teams message builder
// ---------------------------------------------------------------------------

function buildTeamsMessageCard(notification: ComplianceNotification) {
  const emoji = SEVERITY_EMOJI[notification.severity];
  const color = SEVERITY_COLORS[notification.severity];

  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: color,
    summary: `${emoji} ${notification.title}`,
    sections: [
      {
        activityTitle: `${emoji} ${notification.title}`,
        activitySubtitle: `ihOS Compliance Alert • ${notification.type}`,
        text: notification.content,
        markdown: true,
      },
    ],
    potentialAction: [
      {
        "@type": "OpenUri",
        name: "Open ihOS Dashboard",
        targets: [
          {
            os: "default",
            uri: process.env.NEXT_PUBLIC_APP_URL ?? "https://ihos.app",
          },
        ],
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Channel dispatchers
// ---------------------------------------------------------------------------

async function sendTeamsWebhook(
  webhookUrl: string,
  notification: ComplianceNotification,
): Promise<void> {
  const card = buildTeamsMessageCard(notification);

  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(card),
  });

  if (!res.ok) {
    throw new Error(
      `Teams webhook failed (${res.status}): ${await res.text()}`,
    );
  }
}

async function sendEmail(
  _config: Record<string, unknown>,
  notification: ComplianceNotification,
): Promise<void> {
  // TODO: Integrate with email provider (SendGrid / Resend / SES)
  console.log(
    `[notification-router] Email placeholder for "${notification.title}" — not yet implemented`,
  );
}

// ---------------------------------------------------------------------------
// Main router
// ---------------------------------------------------------------------------

export async function routeNotification(
  notification: ComplianceNotification,
): Promise<void> {
  const supabase = createAdminClient() as any;

  // 1. Always persist to agent_notifications --------------------------------
  const { error: insertError } = await supabase
    .from("agent_notifications")
    .insert({
      user_id: notification.userId,
      type: notification.type,
      title: notification.title,
      content: notification.content,
      severity: notification.severity,
      metadata: notification.metadata ?? {},
    });

  if (insertError) {
    console.error(
      "[notification-router] Failed to insert notification:",
      insertError,
    );
  }

  // 2. Look up the user's external channels ---------------------------------
  const { data: channels, error: channelError } = await supabase
    .from("notification_channels")
    .select("*")
    .eq("user_id", notification.userId)
    .eq("is_active", true);

  if (channelError) {
    console.error(
      "[notification-router] Failed to fetch channels:",
      channelError,
    );
    return;
  }

  if (!channels || channels.length === 0) return;

  // 3. Dispatch to each matching channel ------------------------------------
  for (const channel of channels) {
    // Skip if the channel's severity filter doesn't include this severity
    const filter: string[] = channel.severity_filter ?? ["critical", "high"];
    if (!filter.includes(notification.severity)) continue;

    try {
      switch (channel.channel_type) {
        case "teams": {
          const webhookUrl = channel.config?.webhook_url as string | undefined;
          if (webhookUrl) {
            await sendTeamsWebhook(webhookUrl, notification);
          } else {
            console.warn(
              "[notification-router] Teams channel missing webhook_url",
            );
          }
          break;
        }

        case "email": {
          await sendEmail(channel.config ?? {}, notification);
          break;
        }

        default:
          // in_app — already handled by the DB insert above
          break;
      }
    } catch (err) {
      // Non-blocking: log but don't throw so other channels still fire
      console.error(
        `[notification-router] Failed to send via ${channel.channel_type}:`,
        err,
      );
    }
  }
}
