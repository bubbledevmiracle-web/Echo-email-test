// Email provider adapter — Resend (Sections 6, 10, 12).
//
// Kept behind this module boundary so the provider can be swapped without
// touching the routes: the rest of the app only imports sendRelayEmail,
// sendNotifyEmail, and fetchInboundEmailBody.

import { env, taggedReplyTo } from "./env";

const RESEND_SEND_URL = "https://api.resend.com/emails";
const RESEND_RECEIVING_URL = "https://api.resend.com/emails/receiving";

type SendArgs = {
  to: string;
  subject: string;
  text: string;
  /** When set, Reply-To is the tagged inbound address for this conversation. */
  replyToConversationId?: string;
};

async function resendSend(args: SendArgs): Promise<void> {
  if (!env.resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const payload: Record<string, unknown> = {
    from: env.resendFromAddress,
    to: args.to,
    subject: args.subject,
    text: args.text,
  };
  if (args.replyToConversationId) {
    payload.reply_to = taggedReplyTo(args.replyToConversationId);
  }

  const res = await fetch(RESEND_SEND_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${text}`);
  }
}

/** Send the outbound relay email to the recipient, tagged for threading. */
export async function sendRelayEmail(args: {
  to: string;
  conversationId: string;
  body: string;
  fromLabel: string; // the human sender email, shown in the subject
}): Promise<void> {
  await resendSend({
    to: args.to,
    subject: `New message from ${args.fromLabel}`,
    text: args.body,
    replyToConversationId: args.conversationId,
  });
}

/** Send the team notification email to the separate notify address. */
export async function sendNotifyEmail(args: {
  to: string;
  conversationId: string;
  senderEmail: string;
  receiverEmail: string;
  body: string;
  isFiltered: boolean;
}): Promise<void> {
  const lines = [
    `A new reply was received (conversation ${args.conversationId}).`,
    "",
    `Sender:   ${args.senderEmail}`,
    `Receiver: ${args.receiverEmail}`,
    `Filtered: ${args.isFiltered ? "yes" : "no"}`,
    "",
    "Full reply text:",
    args.body,
  ];
  await resendSend({
    to: args.to,
    subject: `New reply received (conversation ${args.conversationId})`,
    text: lines.join("\n"),
  });
}

type ReceivedEmail = {
  text?: string | null;
  html?: string | null;
};

/**
 * Resend's `email.received` webhook is metadata-only. To get the reply body we
 * fetch the stored message by id. Returns the best available plain-text body
 * (falling back to a crude HTML->text strip when `text` is absent).
 */
export async function fetchInboundEmailBody(emailId: string): Promise<string> {
  if (!env.resendApiKey) {
    throw new Error("RESEND_API_KEY is not configured");
  }

  const res = await fetch(`${RESEND_RECEIVING_URL}/${emailId}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${env.resendApiKey}` },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend receive fetch failed (${res.status}): ${text}`);
  }

  const data = (await res.json()) as ReceivedEmail;
  if (data.text && data.text.trim()) return data.text;
  if (data.html && data.html.trim()) return htmlToText(data.html);
  return "";
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}
