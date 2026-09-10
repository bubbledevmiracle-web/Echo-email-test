// Persistent data store — Upstash Redis (Section 9).
//
// Replaces the previous in-memory store. On a serverless host (Vercel) each
// lambda instance had its own copy of the old in-memory arrays, so a reply
// arriving at /api/inbound-email could not see the conversation created by
// /api/send. Redis is a single shared store all instances read/write, so the
// send and inbound paths now agree on the same data.
//
// The module boundary is unchanged — the same helper names are exported — but
// every function is now async because Redis I/O is async. All callers await.
//
// Key layout:
//   conv:<id>            -> Conversation (JSON)
//   conversations        -> sorted set of conversation ids, scored by createdAt
//   msgs:<conversationId> -> list of Message (JSON), in insertion order
//
// @upstash/redis serialises objects to JSON on write and parses them back on
// read automatically, so we store/read plain objects.

import { randomUUID } from "crypto";
import { Redis } from "@upstash/redis";
import type { Conversation, Message, MessageDirection } from "./types";

// Reads UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN from the env.
const redis = Redis.fromEnv();

const convKey = (id: string) => `conv:${id}`;
const msgsKey = (conversationId: string) => `msgs:${conversationId}`;
const CONVERSATIONS_INDEX = "conversations";

export async function createConversation(input: {
  senderEmail: string;
  receiverEmail: string;
  notifyEmail: string;
}): Promise<Conversation> {
  const conversation: Conversation = {
    id: randomUUID(),
    senderEmail: input.senderEmail,
    receiverEmail: input.receiverEmail,
    notifyEmail: input.notifyEmail,
    createdAt: new Date().toISOString(),
  };
  await redis.set(convKey(conversation.id), conversation);
  // Score by creation time so listConversations can return newest-first.
  await redis.zadd(CONVERSATIONS_INDEX, {
    score: Date.parse(conversation.createdAt),
    member: conversation.id,
  });
  return conversation;
}

export async function getConversation(
  id: string,
): Promise<Conversation | undefined> {
  const conversation = await redis.get<Conversation>(convKey(id));
  return conversation ?? undefined;
}

export async function listConversations(): Promise<Conversation[]> {
  // Newest first (highest score first).
  const ids = await redis.zrange<string[]>(CONVERSATIONS_INDEX, 0, -1, {
    rev: true,
  });
  if (ids.length === 0) return [];
  const conversations = await Promise.all(ids.map((id) => getConversation(id)));
  return conversations.filter((c): c is Conversation => c !== undefined);
}

export async function addMessage(input: {
  conversationId: string;
  direction: MessageDirection;
  body: string;
  isFiltered: boolean;
}): Promise<Message> {
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
  await redis.rpush(msgsKey(input.conversationId), message);
  return message;
}

// Returns ALL messages for a conversation (visible + hidden). Server-side only.
export async function getAllMessages(
  conversationId: string,
): Promise<Message[]> {
  const messages = await redis.lrange<Message>(msgsKey(conversationId), 0, -1);
  return messages.sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
}

// Returns only what the sender's UI is allowed to see: all outbound messages
// plus inbound messages that passed the profanity filter.
export async function getVisibleMessages(
  conversationId: string,
): Promise<Message[]> {
  const all = await getAllMessages(conversationId);
  return all.filter((m) => m.visibleToSender);
}
