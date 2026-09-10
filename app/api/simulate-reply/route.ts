// POST /api/simulate-reply — local-testing convenience only (FR-3).
//
// The real inbound path is /api/inbound-email driven by Postmark. This endpoint
// exists ADDITIONALLY so the full moderation + notification flow can be
// exercised without waiting on a real email round-trip. It runs the exact same
// processInboundReply logic.

import { NextRequest, NextResponse } from "next/server";
import { processInboundReply } from "@/lib/inbound";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { conversationId, body } = (payload ?? {}) as Record<string, unknown>;

  if (typeof conversationId !== "string" || !conversationId.trim()) {
    return NextResponse.json(
      { error: "conversationId is required" },
      { status: 400 },
    );
  }
  if (typeof body !== "string" || !body.trim()) {
    return NextResponse.json(
      { error: "A reply body is required" },
      { status: 400 },
    );
  }

  const result = await processInboundReply({
    conversationId: conversationId.trim(),
    strippedText: body,
  });

  if (!result.ok) {
    const status = result.reason === "unknown-conversation" ? 404 : 400;
    return NextResponse.json({ error: result.reason }, { status });
  }

  // We intentionally do NOT tell the client whether the reply was filtered —
  // that mirrors the sender's real experience (they never learn a reply was
  // dropped). The filter status is visible to the team via Slack/email only.
  return NextResponse.json({ ok: true });
}
