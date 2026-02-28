"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  appendChatMessage,
  chat,
  createChatSession,
  listChatSessions,
} from "@/lib/api/client";
import type { ChatMessage, ChatSession } from "@/lib/types";

function createLocalMessage(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${role}_${Date.now()}`,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

export function ChatWindow() {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const activeSession = useMemo(
    () => sessions.find((session) => session.id === activeSessionId) ?? null,
    [activeSessionId, sessions],
  );

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      setLoading(true);
      const existing = await listChatSessions();
      if (!mounted) {
        return;
      }
      if (existing.length > 0) {
        setSessions(existing);
        setActiveSessionId(existing[0].id);
      } else {
        const first = await createChatSession();
        if (!mounted) {
          return;
        }
        setSessions([first]);
        setActiveSessionId(first.id);
      }
      setLoading(false);
    };

    void init();
    return () => {
      mounted = false;
    };
  }, []);

  const upsertSession = (session: ChatSession) => {
    setSessions((prev) => {
      const rest = prev.filter((item) => item.id !== session.id);
      return [session, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  };

  const handleNewChat = async () => {
    const created = await createChatSession();
    setActiveSessionId(created.id);
    upsertSession(created);
  };

  const handleSend = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!activeSessionId || !draft.trim() || sending) {
      return;
    }

    setSending(true);
    const userMessage = createLocalMessage("user", draft.trim());
    setDraft("");

    const sessionAfterUser = await appendChatMessage(activeSessionId, userMessage);
    if (!sessionAfterUser) {
      setSending(false);
      return;
    }
    upsertSession(sessionAfterUser);

    const response = await chat(sessionAfterUser.messages);
    const sessionAfterAssistant = await appendChatMessage(activeSessionId, response.message);
    if (sessionAfterAssistant) {
      upsertSession(sessionAfterAssistant);
    }
    setSending(false);
  };

  if (loading) {
    return (
      <div className="read-box rounded-none p-8 text-sm shadow-panel">Loading chat...</div>
    );
  }

  if (!activeSession) {
    return (
      <div className="read-box rounded-none p-8 text-sm shadow-panel">
        No chat session available.
      </div>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[240px_1fr]">
      <aside className="rounded-none border border-zinc-500 bg-panelSoft p-4 shadow-panel">
        <button
          className="mb-4 w-full rounded-none bg-accent px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-accentDeep"
          onClick={() => {
            void handleNewChat();
          }}
          type="button"
        >
          New chat
        </button>
        <div className="space-y-2">
          {sessions.map((session) => (
            <button
              className={`w-full rounded-none px-3 py-2 text-left text-sm ${
                session.id === activeSessionId
                  ? "bg-accent/20 text-orange-300"
                  : "bg-zinc-700 text-zinc-300 hover:bg-zinc-600"
              }`}
              key={session.id}
              onClick={() => setActiveSessionId(session.id)}
              type="button"
            >
              {session.title}
            </button>
          ))}
        </div>
      </aside>

      <div className="rounded-none border border-zinc-500 bg-panelSoft p-4 shadow-panel">
        <div className="h-[430px] space-y-3 overflow-y-auto rounded-none border border-zinc-800 bg-zinc-700 p-4">
          {activeSession.messages.map((message) => (
            <div
              className={`max-w-[85%] rounded-none px-4 py-3 text-sm leading-relaxed ${
                message.role === "user"
                  ? "ml-auto bg-accent text-zinc-950"
                  : "mr-auto border border-zinc-500 bg-zinc-600 text-zinc-100"
              }`}
              key={message.id}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              {message.citations && message.citations.length > 0 ? (
                <p className="mt-2 text-xs opacity-80">
                  Citations:{" "}
                  {message.citations
                    .map((citation) => `${citation.tripTitle} (${citation.score.toFixed(2)})`)
                    .join(", ")}
                </p>
              ) : null}
            </div>
          ))}
        </div>

        <form className="mt-3 flex gap-2" onSubmit={handleSend}>
          <input
            className="flex-1 rounded-none border border-zinc-500 bg-zinc-700 px-3 py-2 text-sm outline-none ring-orange-500 focus:ring-2"
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask about your next trip..."
            value={draft}
          />
          <button
            className="rounded-none border border-accent bg-accent px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-accentDeep disabled:cursor-not-allowed disabled:opacity-60"
            disabled={sending}
            type="submit"
          >
            {sending ? "Thinking..." : "Send"}
          </button>
        </form>
      </div>
    </section>
  );
}


