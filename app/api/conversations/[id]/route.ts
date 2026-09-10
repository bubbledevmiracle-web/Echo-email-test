// GET /api/conversations/:id — FR-4/FR-5 (Section 9).
//
// Returns ONLY messages where visibleToSender === true (all outbound + clean
// inbound). Filtered inbound text is never present in this JSON payload — the
// filtering guarantee lives on the server.

import { NextResponse } from "next/server";
import { getConversation, getVisibleMessages } from "@/lib/store";
import { toPublicConversation } from "@/lib/serialize";

export const runtime = "nodejs";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  const conversation = await getConversation(params.id);
  if (!conversation) {
    return NextResponse.json(
      { error: "Conversation not found" },
      { status: 404 },
    );
  }

  const publicConversation = toPublicConversation(
    conversation,
    await getVisibleMessages(conversation.id),
  );

  return NextResponse.json({ conversation: publicConversation });
}
