// In-memory data store (Section 9).
//
// Structured as a single module exporting arrays + helper functions so it can
// later be swapped for Prisma + SQLite/Postgres with minimal churn: replace the
// bodies of these helpers, keep the signatures.
//
// State is hung off `globalThis` so it survives Next.js hot-module reloads in
// dev. Known limitation (Section 17): it does NOT survive a server restart, and
// on a serverless host each cold lambda gets its own copy.

import { randomUUID } from "crypto";
import type { Conversation, Message, MessageDirection } from "./types";

type StoreShape = {
  conversations: Conversation[];
  messages: Message[];
};

const globalForStore = globalThis as unknown as {
  __echomailStore?: StoreShape;
};

const store: StoreShape =
  globalForStore.__echomailStore ??
  (globalForStore.__echomailStore = { conversations: [], messages: [] });

export function createConversation(input: {
  senderEmail: string;
  receiverEmail: string;
  notifyEmail: string;
}): Conversation {
  const conversation: Conversation = {
    id: randomUUID(),
    senderEmail: input.senderEmail,
    receiverEmail: input.receiverEmail,
    notifyEmail: input.notifyEmail,
    createdAt: new Date().toISOString(),
  };
  store.conversations.push(conversation);
  return conversation;
}

export function getConversation(id: string): Conversation | undefined {
  return store.conversations.find((c) => c.id === id);
}

export function listConversations(): Conversation[] {
  return [...store.conversations].sort((a, b) =>
    a.createdAt < b.createdAt ? 1 : -1,
  );
}

export function addMessage(input: {
  conversationId: string;
  direction: MessageDirection;
  body: string;
  isFiltered: boolean;
}): Message {
  const message: Message = {
    id: randomUUID(),
    conversationId: input.conversationId,
    direction: input.direction,
    body: input.body,
    isFiltered: input.isFiltered,
    // The filtering guarantee lives here on the server: a filtered message is
    // never visible to the sender.
    visibleToSender: !input.isFiltered,
    createdAt: new Date().toISOString(),
  };
  store.messages.push(message);
  return message;
}

// Returns ALL messages for a conversation (visible + hidden). Server-side only.
export function getAllMessages(conversationId: string): Message[] {
  return store.messages
    .filter((m) => m.conversationId === conversationId)
    .sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// Returns only what the sender's UI is allowed to see: all outbound messages
// plus inbound messages that passed the profanity filter.
export function getVisibleMessages(conversationId: string): Message[] {
  return getAllMessages(conversationId).filter((m) => m.visibleToSender);
}
