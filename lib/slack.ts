// Slack Incoming Webhook notification (Section 12).

import { env } from "./env";

export async function sendSlackNotification(args: {
  conversationId: string;
  senderEmail: string;
  receiverEmail: string;
  body: string;
  isFiltered: boolean;
}): Promise<void> {
  if (!env.slackWebhookUrl) {
    throw new Error("SLACK_WEBHOOK_URL is not configured");
  }

  const text =
    `:incoming_envelope: New reply in conversation ${args.conversationId}\n` +
    `From: ${args.receiverEmail} → ${args.senderEmail}\n` +
    `Filtered: ${args.isFiltered ? "yes" : "no"}\n` +
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
