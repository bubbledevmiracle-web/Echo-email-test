// POST /api/send — FR-1: compose & send (Section 6).

import { NextRequest, NextResponse } from "next/server";
import { createConversation, addMessage, getVisibleMessages } from "@/lib/store";
import { sendRelayEmail } from "@/lib/email";
import { toPublicConversation } from "@/lib/serialize";
import { env } from "@/lib/env";

export const runtime = "nodejs";

function isEmail(value: unknown): value is string {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { senderEmail, receiverEmail, message } = (payload ?? {}) as Record<
    string,
    unknown
  >;
  const notifyEmailInput = (payload as Record<string, unknown>)?.notifyEmail;

  if (!isEmail(senderEmail)) {
    return NextResponse.json(
      { error: "A valid sender email is required" },
      { status: 400 },
    );
  }
  if (!isEmail(receiverEmail)) {
    return NextResponse.json(
      { error: "A valid recipient email is required" },
      { status: 400 },
    );
  }
  if (typeof message !== "string" || !message.trim()) {
    return NextResponse.json(
      { error: "A message body is required" },
      { status: 400 },
    );
  }

  // Notify email: optional field, falls back to DEFAULT_NOTIFY_EMAIL (Section 8).
  let notifyEmail = "";
  if (isEmail(notifyEmailInput)) {
    notifyEmail = notifyEmailInput;
  } else if (isEmail(env.defaultNotifyEmail)) {
    notifyEmail = env.defaultNotifyEmail;
  }

  const conversation = await createConversation({
    senderEmail,
    receiverEmail,
    notifyEmail,
  });

  // Record the outbound message immediately so the UI can render it.
  await addMessage({
    conversationId: conversation.id,
    direction: "outbound",
    body: message.trim(),
    isFiltered: false,
  });

  try {
    await sendRelayEmail({
      to: receiverEmail,
      conversationId: conversation.id,
      body: message.trim(),
      fromLabel: senderEmail,
    });
  } catch (err) {
    console.error("[send] Resend send failed:", err);
    return NextResponse.json(
      {
        error:
          "Failed to send the email via Resend. Check RESEND_API_KEY and the sender identity (RESEND_FROM_ADDRESS).",
        conversationId: conversation.id,
      },
      { status: 502 },
    );
  }

  const publicConversation = toPublicConversation(
    conversation,
    await getVisibleMessages(conversation.id),
  );

  return NextResponse.json(
    { conversation: publicConversation },
    { status: 201 },
  );
}
