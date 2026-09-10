// Quoted-history stripping (Section 10).
//
// Postmark provided a `StrippedTextReply`; Resend does not, so we do it here.
// The goal is to keep only what the recipient actually typed and drop the
// quoted original thread most clients append below a reply. This is heuristic —
// good enough for the assessment scope — not a full RFC email parser.

const QUOTE_MARKERS: RegExp[] = [
  // Gmail / Apple Mail: "On Mon, Jan 1, 2026 at 9:00 AM Foo <a@b> wrote:"
  /^\s*On .+ wrote:\s*$/m,
  // Outlook / other clients
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^_{5,}\s*$/m,
  // Header block that Outlook inserts above a quote
  /^\s*From:\s.+$/m,
  // Generic "sent from my device" style separators are left alone (they're
  // part of the reply), we only cut at explicit quote boundaries above.
];

export function stripQuotedReply(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n/g, "\n");

  // Cut at the earliest recognised quote marker.
  let cutIndex = text.length;
  for (const marker of QUOTE_MARKERS) {
    const match = marker.exec(text);
    if (match && match.index < cutIndex) {
      cutIndex = match.index;
    }
  }
  text = text.slice(0, cutIndex);

  // Drop trailing quoted lines (those beginning with ">").
  const lines = text.split("\n");
  while (lines.length && lines[lines.length - 1].trimStart().startsWith(">")) {
    lines.pop();
  }

  return lines.join("\n").trim();
}
