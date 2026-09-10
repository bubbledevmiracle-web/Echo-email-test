// Serialisers that convert internal records into the browser-safe shapes.
// Hidden text never leaves the server: getVisibleMessages already excludes
// filtered messages, and PublicMessage carries no isFiltered/visibleToSender.

import type {
  Conversation,
  Message,
  PublicConversation,
  PublicMessage,
} from "./types";

export function toPublicMessage(m: Message): PublicMessage {
  return {
    id: m.id,
    conversationId: m.conversationId,
    direction: m.direction,
    body: m.body,
    createdAt: m.createdAt,
  };
}

export function toPublicConversation(
  c: Conversation,
  visibleMessages: Message[],
): PublicConversation {
  return {
    id: c.id,
    senderEmail: c.senderEmail,
    receiverEmail: c.receiverEmail,
    notifyEmail: c.notifyEmail,
    createdAt: c.createdAt,
    messages: visibleMessages.map(toPublicMessage),
  };
}
