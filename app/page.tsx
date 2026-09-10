"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

type PublicMessage = {
  id: string;
  conversationId: string;
  direction: "outbound" | "inbound";
  body: string;
  createdAt: string;
};

type PublicConversation = {
  id: string;
  senderEmail: string;
  receiverEmail: string;
  notifyEmail: string;
  createdAt: string;
  messages: PublicMessage[];
};

const POLL_INTERVAL_MS = 4000;

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function Home() {
  // Compose form
  const [senderEmail, setSenderEmail] = useState("");
  const [receiverEmail, setReceiverEmail] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Conversations
  const [conversations, setConversations] = useState<PublicConversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Simulate-reply (local testing helper)
  const [simulateText, setSimulateText] = useState("");
  const [simulating, setSimulating] = useState(false);

  const threadRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/conversations", { cache: "no-store" });
      if (!res.ok) return;
      const data = (await res.json()) as { conversations: PublicConversation[] };
      setConversations(data.conversations);
    } catch {
      // Network hiccup during polling — ignore, next tick will retry.
    }
  }, []);

  // Initial load + polling (FR-4).
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [refresh]);

  const activeConversation = useMemo(
    () => conversations.find((c) => c.id === selectedId) ?? null,
    [conversations, selectedId],
  );

  // Auto-scroll thread to the newest message.
  useEffect(() => {
    if (threadRef.current) {
      threadRef.current.scrollTop = threadRef.current.scrollHeight;
    }
  }, [activeConversation?.messages.length, selectedId]);

  const waitingForReply = useMemo(() => {
    if (!activeConversation) return false;
    const msgs = activeConversation.messages;
    if (msgs.length === 0) return false;
    return msgs[msgs.length - 1].direction === "outbound";
  }, [activeConversation]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);
    try {
      const res = await fetch("/api/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderEmail,
          receiverEmail,
          notifyEmail: notifyEmail || undefined,
          message,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? "Failed to send.");
        // If a conversation was created but sending failed, still select it.
        if (data?.conversationId) setSelectedId(data.conversationId);
        await refresh();
        return;
      }
      const conv: PublicConversation = data.conversation;
      setMessage("");
      setSelectedId(conv.id);
      await refresh();
    } catch {
      setError("Network error while sending.");
    } finally {
      setSending(false);
    }
  }

  async function handleSimulate(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !simulateText.trim()) return;
    setSimulating(true);
    try {
      await fetch("/api/simulate-reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, body: simulateText }),
      });
      setSimulateText("");
      await refresh();
    } catch {
      // ignore
    } finally {
      setSimulating(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          EchoMail
        </h1>
        <span className="text-sm text-slate-500">
          Two-way email relay with moderation
        </span>
      </header>

      <div className="grid flex-1 grid-cols-1 gap-6 lg:grid-cols-[320px_1fr]">
        {/* LEFT PANEL — New Conversation */}
        <section className="flex flex-col gap-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wide text-slate-500">
              New conversation
            </h2>
            <form onSubmit={handleSend} className="flex flex-col gap-3">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Your email</span>
                <input
                  type="email"
                  required
                  value={senderEmail}
                  onChange={(e) => setSenderEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  Recipient email
                </span>
                <input
                  type="email"
                  required
                  value={receiverEmail}
                  onChange={(e) => setReceiverEmail(e.target.value)}
                  placeholder="them@example.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">
                  Notify email{" "}
                  <span className="font-normal text-slate-400">
                    (for reply alerts, optional)
                  </span>
                </span>
                <input
                  type="email"
                  value={notifyEmail}
                  onChange={(e) => setNotifyEmail(e.target.value)}
                  placeholder="team@example.com"
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-slate-700">Message</span>
                <textarea
                  required
                  rows={4}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Type your message…"
                  className="resize-none rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100"
                />
              </label>
              <button
                type="submit"
                disabled={sending}
                className="mt-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {sending ? "Sending…" : "Send"}
              </button>
              {error && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                  {error}
                </p>
              )}
            </form>
          </div>

          {/* Conversation switcher (supports FR-7: multiple concurrent threads) */}
          {conversations.length > 0 && (
            <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
              <h3 className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-400">
                Conversations
              </h3>
              <ul className="flex flex-col gap-1">
                {conversations.map((c) => {
                  const active = c.id === selectedId;
                  return (
                    <li key={c.id}>
                      <button
                        onClick={() => setSelectedId(c.id)}
                        className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
                          active
                            ? "bg-indigo-50 text-indigo-700"
                            : "text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        <span className="block truncate font-medium">
                          {c.receiverEmail}
                        </span>
                        <span className="block truncate text-xs text-slate-400">
                          {c.messages.length} message
                          {c.messages.length === 1 ? "" : "s"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>

        {/* RIGHT PANEL — Conversation view */}
        <section className="flex min-h-[520px] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
          {!activeConversation ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
              <div className="mb-3 text-4xl">✉️</div>
              <p className="max-w-sm text-sm text-slate-500">
                Send a message below — your recipient can reply directly from
                their inbox, and it&apos;ll show up here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-800">
                    {activeConversation.receiverEmail}
                  </p>
                  <p className="text-xs text-slate-400">
                    from {activeConversation.senderEmail}
                  </p>
                </div>
                <span className="text-xs text-slate-400">
                  {activeConversation.notifyEmail
                    ? `notify → ${activeConversation.notifyEmail}`
                    : "no notify address"}
                </span>
              </div>

              <div
                ref={threadRef}
                className="flex flex-1 flex-col gap-3 overflow-y-auto px-5 py-4"
              >
                {activeConversation.messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
                ))}
                {waitingForReply && (
                  <div className="flex items-center gap-2 self-start rounded-full bg-slate-100 px-3 py-1.5 text-xs text-slate-500">
                    <span className="h-1.5 w-1.5 animate-pulseDot rounded-full bg-slate-400" />
                    waiting for reply…
                  </div>
                )}
              </div>

              {/* Simulate reply — local testing helper (FR-3). */}
              <form
                onSubmit={handleSimulate}
                className="flex items-center gap-2 border-t border-slate-100 px-5 py-3"
              >
                <input
                  value={simulateText}
                  onChange={(e) => setSimulateText(e.target.value)}
                  placeholder="Simulate a reply (local testing)…"
                  className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm outline-none focus:border-indigo-400 focus:bg-white focus:ring-2 focus:ring-indigo-100"
                />
                <button
                  type="submit"
                  disabled={simulating || !simulateText.trim()}
                  className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  {simulating ? "…" : "Reply"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function MessageBubble({ message }: { message: PublicMessage }) {
  const outbound = message.direction === "outbound";
  return (
    <div
      className={`flex flex-col ${outbound ? "items-end" : "items-start"}`}
    >
      <div
        className={`max-w-[75%] whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm ${
          outbound
            ? "rounded-br-md bg-indigo-600 text-white"
            : "rounded-bl-md bg-slate-100 text-slate-800"
        }`}
      >
        {!outbound && (
          <span className="mr-1 select-none" title="Arrived via email reply">
            ✉️
          </span>
        )}
        {message.body}
      </div>
      <span className="mt-1 px-1 text-[11px] text-slate-400">
        {formatTime(message.createdAt)}
      </span>
    </div>
  );
}
