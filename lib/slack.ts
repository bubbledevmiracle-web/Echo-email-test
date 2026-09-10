// Slack Incoming Webhook notification (Section 12).

import { env } from "./env";

export async function sendSlackNotification(args: {
  conversationId: string;
  senderEmail: string;
  receiverEmail: string;
  body: string;
  isFiltered: boolean;
  /** Why moderation flagged the message (only meaningful when isFiltered). */
  filterReason?: string;
}): Promise<void> {
  if (!env.slackWebhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

  const filteredLine = args.isFiltered
    ? `Filtered: yes (${args.filterReason ?? "flagged"}) — hidden from sender\n`
    : "Filtered: no\n";

  const text =
    `:incoming_envelope: New reply in conversation ${args.conversationId}\n` +
    `From: ${args.receiverEmail} → ${args.senderEmail}\n` +
    filteredLine +
    `Message: ${args.body}`;

  const res = await fetch(env.slackWebhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Slack webhook failed (${res.status}): ${body}`);
  }
}
