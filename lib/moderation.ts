// AI-assisted content moderation (Section 11).
//
// The client requirement: a reply that contains curse words, abusive/harassing
// language, hate speech, threats, or offensive slang must be filtered so the
// sender never sees it (the full text still reaches the moderation team via
// Slack + the notify email).
//
// Strategy — cheap-first, fail-safe:
//   1. Offline dictionary pre-check (lib/profanity.ts). Obvious hits are caught
//      instantly with zero API cost/latency and short-circuit.
//   2. Otherwise ask OpenAI to classify. This catches slang, obfuscation, and
//      context the static dictionary misses ("act as client requirement").
//   3. If OpenAI is unconfigured or errors, we fall back to the dictionary
//      result so moderation degrades gracefully instead of throwing.

import { env } from "./env";
import { isProfane } from "./profanity";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

const SYSTEM_PROMPT = [
  "You are a strict content-moderation classifier for an email relay.",
  "Decide whether a single inbound reply message should be HIDDEN from the",
  "original sender because it contains any of the following:",
  "- curse words / profanity (including deliberately obfuscated forms like",
  "  f*ck, sh1t, a$$hole),",
  "- abusive, harassing, demeaning, or threatening language,",
  "- hate speech or slurs targeting a person or group,",
  "- offensive or derogatory slang.",
  "",
  "Normal criticism, complaints, or negative-but-civil business language is NOT",
  "abusive and must NOT be hidden. Only flag genuinely offensive content.",
  "",
  'Respond with ONLY a JSON object: {"abusive": boolean, "reason": string}.',
  "Keep reason under 100 characters, naming the category when abusive, or",
  '"clean" when not.',
].join("\n");

export type ModerationResult = {
  isAbusive: boolean;
  /** Short human-readable explanation, surfaced in moderation notifications. */
  reason: string;
  /** Which layer produced the verdict — useful for logs/debugging. */
  source: "dictionary" | "openai" | "fallback";
};

export async function moderateReply(text: string): Promise<ModerationResult> {
  const clean = (text ?? "").trim();
  if (!clean) {
    return { isAbusive: false, reason: "empty", source: "dictionary" };
  }

  // 1. Offline dictionary pre-check — instant, no API cost.
  if (isProfane(clean)) {
    return {
      isAbusive: true,
      reason: "matched local profanity dictionary",
      source: "dictionary",
    };
  }

  // 2. No key configured -> stop at the (clean) dictionary result.
  if (!env.openaiApiKey) {
    return {
      isAbusive: false,
      reason: "openai not configured; dictionary clean",
      source: "dictionary",
    };
  }

  // 3. AI classification for slang/obfuscation the dictionary misses.
  try {
    const res = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.openaiApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: env.openaiModerationModel,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: clean },
        ],
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`OpenAI moderation failed (${res.status}): ${body}`);
    }

    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const content = data.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(content) as {
      abusive?: boolean;
      reason?: string;
    };

    return {
      isAbusive: Boolean(parsed.abusive),
      reason: (parsed.reason ?? "openai classification").slice(0, 100),
      source: "openai",
    };
  } catch (err) {
    // Fail-safe: never let a moderation outage break the inbound flow. The
    // dictionary already cleared this text above, so treat it as not abusive.
    console.error(
      "[moderation] OpenAI check failed; falling back to dictionary result:",
      err,
    );
    return {
      isAbusive: false,
      reason: "openai error; dictionary clean",
      source: "fallback",
    };
  }
}
