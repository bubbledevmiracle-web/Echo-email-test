// Shared inbound-reply processing (Sections 5, 11, 12).
//
// Used by both the real Postmark webhook route and the local "simulate reply"
// route so the moderation + notification behaviour is identical on both paths.

import { addMessage, getConversation } from "./store";
import { moderateReply } from "./moderation";
import { sendSlackNotification } from "./slack";
import { sendNotifyEmail } from "./email";

export type ProcessResult =
  | { ok: true; conversationId: string; isFiltered: boolean }
  | { ok: false; reason: "unknown-conversation" | "empty-body" };

/**
 * Store an inbound reply, apply the profanity filter, and fire notifications.
 * Notifications always fire (filtered or not). Notification failures are logged
 * but never thrown — they must not turn a webhook into a non-2xx retry storm.
 */
export async function processInboundReply(input: {
  conversationId: string;
  strippedText: string;
}): Promise<ProcessResult> {
  const conversation = await getConversation(input.conversationId);
  if (!conversation) {
    return { ok: false, reason: "unknown-conversation" };
  }

  const body = (input.strippedText ?? "").trim();
  if (!body) {
    return { ok: false, reason: "empty-body" };
  }

  const moderation = await moderateReply(body);
  const isFiltered = moderation.isAbusive;

  // Always store the full, unfiltered text. visibleToSender is derived from
  // isFiltered inside the store.
  await addMessage({
    conversationId: conversation.id,
    direction: "inbound",
    body,
    isFiltered,
  });

  // Fire Slack + notify email in parallel; both always fire.
  const notifyTo = conversation.notifyEmail;
  await Promise.allSettled([
    sendSlackNotification({
      conversationId: conversation.id,
      senderEmail: conversation.senderEmail,
      receiverEmail: conversation.receiverEmail,
      body,
      isFiltered,
      filterReason: moderation.reason,
    }).catch((err) => {
      console.error("[inbound] Slack notification failed:", err);
      throw err;
    }),
    notifyTo
      ? sendNotifyEmail({
          to: notifyTo,
          conversationId: conversation.id,
          senderEmail: conversation.senderEmail,
          receiverEmail: conversation.receiverEmail,
          body,
          isFiltered,
          filterReason: moderation.reason,
        }).catch((err) => {
          console.error("[inbound] Notify email failed:", err);
          throw err;
        })
      : Promise.resolve(),
  ]);

  return { ok: true, conversationId: conversation.id, isFiltered };
}
