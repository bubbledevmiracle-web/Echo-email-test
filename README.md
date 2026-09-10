# EchoMail

Two-way email relay with moderation and notifications. Send an email from the
web UI, let the recipient reply normally from their own inbox, and see that
reply appear back in the UI — while abusive replies are silently filtered from
the sender and the team is notified (Slack + email) on every reply.

Built per the requirements document, Sections 5–13: Next.js 14 (App Router,
TypeScript, Tailwind), **Resend** for outbound + inbound email, `leo-profanity`
for filtering, a Slack Incoming Webhook for notifications, and an in-memory
store.

## Why Resend (free) instead of Postmark

The requirements picked Postmark for its instant, no-DNS inbound address — but
Postmark's inbound email is **not on the free plan** (it needs the $15/mo Basic
tier). Resend keeps the same key property for free:

- Free tier: **3,000 emails/month** (100/day).
- Managed inbound address at `<id>.resend.app` — works instantly, **no DNS**,
  and accepts **any alias**, so we encode the conversation id directly in the
  reply-to local part (`<conversationId>@<id>.resend.app`) for threading.

## Setup

1. **Pre-work:** create a free Resend account, copy an API key (`re_…`), and
   note your receiving subdomain (`<id>.resend.app`). Create a Slack Incoming
   Webhook and copy its URL.
2. `npm install`
3. `cp .env.local.example .env.local` and fill in the values.
4. `npm run dev` → http://localhost:3000
5. Deploy to Vercel, set the same env vars in the dashboard, then point Resend's
   inbound webhook (the `email.received` event) at
   `https://<your-app>/api/inbound-email`.

## Environment variables

| Var | Purpose |
|---|---|
| `RESEND_API_KEY` | Resend API key (outbound + notify send, inbound body fetch) |
| `RESEND_INBOUND_DOMAIN` | Receiving subdomain, e.g. `abc123.resend.app` |
| `RESEND_FROM_ADDRESS` | Identity mail is sent from (`onboarding@resend.dev` on free tier, or a verified domain) |
| `SLACK_WEBHOOK_URL` | Slack Incoming Webhook |
| `APP_BASE_URL` | Deployed base URL |
| `DEFAULT_NOTIFY_EMAIL` | Fallback notify address if compose form is blank |

## How it works

- **Threading (Section 10):** each conversation gets a UUID. Outbound mail sets
  `reply_to` to `<conversationId>@<id>.resend.app`. When the recipient replies,
  Resend's `email.received` webhook carries that address in `to`, from which we
  recover the conversation — no header parsing.
- **Inbound body:** Resend's webhook is metadata-only, so the route fetches the
  full message via `GET /emails/receiving/{id}` and then strips quoted history
  ([lib/strip-reply.ts](lib/strip-reply.ts)) — Resend has no `StrippedTextReply`
  equivalent.
- **Moderation (Section 11):** the stripped reply is checked with
  `leo-profanity` (extended with a small extra-terms list). A flagged message is
  stored in full server-side but `visibleToSender=false`, so it is never
  included in the JSON the browser receives.
- **Notifications (Section 12):** every inbound reply fires a Slack message and
  a notify email in parallel — filtered or not — each carrying the full,
  unfiltered text and the filter status.

## API routes

| Route | Purpose |
|---|---|
| `POST /api/send` | Create a conversation + send the outbound email (FR-1) |
| `POST /api/inbound-email` | Resend inbound webhook; always returns 200 |
| `GET /api/conversations` | List conversations (visible messages only) |
| `GET /api/conversations/:id` | One conversation (visible messages only) |
| `POST /api/simulate-reply` | Local-testing helper; same logic as the webhook |

## Testing without a real round-trip

The UI includes a "Simulate a reply" box that posts to `/api/simulate-reply`,
running the identical moderation + notification path as the real webhook (it
skips only the Resend body-fetch, since you supply the text directly). Try a
clean reply (appears in the thread) and one containing a curse word (never
appears for the sender, but still fires Slack + notify email).

## Provider is swappable

All provider-specific code lives in [lib/email.ts](lib/email.ts) (send + notify
+ inbound body fetch) and [lib/env.ts](lib/env.ts) (the reply-to builder).
Swapping to another provider is contained to those two files plus the webhook
payload shape in [app/api/inbound-email/route.ts](app/api/inbound-email/route.ts).

## Known limitations (Section 17)

- **In-memory store** — conversation history is cleared on server restart, and
  on a serverless host each cold instance has its own copy. First thing to swap
  for a real product: Prisma + SQLite/Postgres (the `lib/store.ts` helpers are
  shaped for a drop-in replacement).
- **Dictionary-based filtering** — not context-aware; won't catch obfuscated
  abuse and may occasionally over-block borderline words.
- **Quoted-history stripping is heuristic** — Resend gives no stripped-reply
  field, so [lib/strip-reply.ts](lib/strip-reply.ts) cuts at common reply
  markers; unusual clients may slip some quoting through.
- **Sending identity** — on the free tier `onboarding@resend.dev` only delivers
  to your own account email; verify a domain in Resend to send to arbitrary
  recipients and improve deliverability.
