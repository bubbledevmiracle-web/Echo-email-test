// GET /api/conversations — list all conversations (most recent first).
// Returns each conversation with only its visible messages.

import { NextResponse } from "next/server";
import { listConversations, getVisibleMessages } from "@/lib/store";
import { toPublicConversation } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET() {
  const conversations = listConversations().map((c) =>
    toPublicConversation(c, getVisibleMessages(c.id)),
  );
  return NextResponse.json({ conversations });
}
