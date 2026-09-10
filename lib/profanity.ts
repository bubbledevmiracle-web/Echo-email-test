// Content moderation (Sections 11). Dictionary-based, offline, synchronous.
//
// The check runs on the stripped reply text only (the caller is responsible for
// passing already-stripped text). Filtering is binary: if a listed term is
// present, the message is flagged and hidden from the sender.

import leoProfanity from "leo-profanity";

// Client-specific slang/slurs would be added here. Section 11 says to ship a
// small default extra-terms list covering common abusive slang. Extend at will.
const EXTRA_TERMS: string[] = ["scumbag", "dirtbag", "lowlife"];

let initialised = false;

function ensureInit(): void {
  if (initialised) return;
  leoProfanity.loadDictionary("en");
  leoProfanity.add(EXTRA_TERMS);
  initialised = true;
}

/** True when the text contains a flagged profanity/slang term. */
export function isProfane(text: string): boolean {
  ensureInit();
  return leoProfanity.check(text ?? "");
}
