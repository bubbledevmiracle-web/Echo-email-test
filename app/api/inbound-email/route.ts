// POST /api/inbound-email — Resend inbound webhook (Sections 5, 10).
//
// Resend fires an `email.received` event with metadata only (no body). We:
//   1. Recover the conversation id from the `to` address (the local part is the
//      conversation id — see taggedReplyTo in lib/env.ts).
//   2. Fetch the full body via the receiving API (metadata-only webhook).
//   3. Strip quoted history, run moderation, store, and notify.
//
// Always returns 200 (even on malformed input) so Resend does not retry a bad
// one-off payload into a retry storm (Section 10.4).

import { NextRequest, NextResponse } from "next/server";
import { processInboundReply } from "@/lib/inbound";
import { fetchInboundEmailBody } from "@/lib/email";
import { stripQuotedReply } from "@/lib/strip-reply";

export const runtime = "nodejs";

// Resend inbound webhook payload (only the fields we use).
type ResendInbound = {
  type?: string; // "email.received"
  data?: {
    email_id?: string;
    to?: string[]; // recipient addresses (array even for one)
    from?: string;
    subject?: string;
  };
};

/** Recover the conversation id from the recipient address. We encode it as the
 * local part (`<conversationId>@<id>.resend.app`), and also accept a `+tag`
 * form defensively. */
function extractConversationId(to: string[] | undefined): string | null {
  if (!to || to.length === 0) return null;
  for (const addr of to) {
    const local = addr.split("@")[0]?.trim();
    if (!local) continue;
    // Support both "<id>@..." and "anything+<id>@..." shapes.
    const plusIdx = local.indexOf("+");
    const candidate = plusIdx >= 0 ? local.slice(plusIdx + 1) : local;
    if (candidate) return candidate;
  }
  return null;
}

export async function POST(req: NextRequest) {
  let payload: ResendInbound;
  try {
    payload = (await req.json()) as ResendInbound;
  } catch {
    console.error("[inbound-email] Body was not valid JSON");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  // Minimum shape validation (Section 13): looks like a Resend inbound event.
  const looksLikeResend =
    payload &&
    typeof payload === "object" &&
    payload.data !== undefined &&
    (payload.type === "email.received" || "email_id" in (payload.data ?? {}));

  if (!looksLikeResend) {
    console.error("[inbound-email] Payload did not match Resend shape");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const conversationId = extractConversationId(payload.data?.to);
  if (!conversationId) {
    console.error(
      "[inbound-email] Could not extract conversation id from `to`",
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  const emailId = payload.data?.email_id;
  if (!emailId) {
    console.error("[inbound-email] Missing email_id; cannot fetch body");
    return NextResponse.json({ ok: true }, { status: 200 });
  }

  try {
    const rawBody = await fetchInboundEmailBody(emailId);
    const strippedText = stripQuotedReply(rawBody);
    const result = await processInboundReply({ conversationId, strippedText });
    if (!result.ok) {
      console.error(
        `[inbound-email] Reply not stored (${result.reason}) for conversation ${conversationId}`,
      );
    }
  } catch (err) {
    console.error("[inbound-email] Processing error:", err);
  }

  // Always 200 so Resend treats delivery as successful.
  return NextResponse.json({ ok: true }, { status: 200 });
}
