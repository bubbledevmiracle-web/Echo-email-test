// Centralised env access. Keeps API keys out of client code (they're only ever
// read inside server modules / API routes).
//
// Provider: Resend (free tier — 3,000 emails/month — with an instant, no-DNS
// inbound address at <id>.resend.app that accepts any alias).

export const env = {
  resendApiKey: process.env.RESEND_API_KEY ?? "",
  // The receiving subdomain Resend gives you, e.g. "abc123.resend.app".
  // Replies are addressed to <conversationId>@<this domain> for threading.
  resendInboundDomain: process.env.RESEND_INBOUND_DOMAIN ?? "",
  // The verified identity outbound mail is sent FROM. On the free tier without
  // a verified domain, only onboarding@resend.dev works (and only to your own
  // account email) — verify a domain to send to arbitrary recipients.
  resendFromAddress: process.env.RESEND_FROM_ADDRESS ?? "onboarding@resend.dev",
  slackWebhookUrl: process.env.SLACK_WEBHOOK_URL ?? "",
  appBaseUrl: process.env.APP_BASE_URL ?? "",
  defaultNotifyEmail: process.env.DEFAULT_NOTIFY_EMAIL ?? "",
};

/**
 * Normalise the configured inbound domain to a bare host. Tolerates common
 * copy/paste mistakes from the Resend dashboard, e.g.
 *   "<anything>@aldiodoree.resend.app"  ->  "aldiodoree.resend.app"
 *   "test@aldiodoree.resend.app"        ->  "aldiodoree.resend.app"
 *   "<aldiodoree.resend.app>"           ->  "aldiodoree.resend.app"
 */
export function inboundDomain(): string {
  let raw = env.resendInboundDomain.trim().replace(/^<|>$/g, "");
  if (raw.includes("@")) {
    raw = raw.split("@").pop() ?? raw; // keep only the host part
  }
  return raw.trim();
}

/**
 * Build the Reply-To address for a conversation (Section 10). Resend's inbound
 * subdomain accepts any alias, so we encode the conversation id directly as the
 * local part: `<conversationId>@<id>.resend.app`. When the reply arrives, the
 * webhook's `to` field carries this address and we recover the id from it — no
 * header parsing needed.
 */
export function taggedReplyTo(conversationId: string): string {
  return `${conversationId}@${inboundDomain()}`;
}
