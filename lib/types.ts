// Shared data-model types (Section 9 of the requirements).

export type Conversation = {
  id: string; // UUID, also embedded in the Postmark inbound tag
  senderEmail: string;
  receiverEmail: string;
  notifyEmail: string;
  createdAt: string;
};

export type MessageDirection = "outbound" | "inbound";

export type Message = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string; // full, unfiltered text — always stored
  isFiltered: boolean; // true if profanity/abuse detected
  visibleToSender: boolean; // false when isFiltered === true
  createdAt: string;
};

// Shape returned to the browser. Note it intentionally omits any way to
// recover hidden text — the server only ever serialises visible messages.
export type PublicMessage = {
  id: string;
  conversationId: string;
  direction: MessageDirection;
  body: string;
  createdAt: string;
};

export type PublicConversation = {
  id: string;
  senderEmail: string;
  receiverEmail: string;
  notifyEmail: string;
  createdAt: string;
  messages: PublicMessage[];
};
