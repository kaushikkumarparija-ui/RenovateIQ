"use client";

import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatINR } from "@/lib/format";
import type { Message, Role } from "@/lib/types";

export function ChatThread({
  projectId,
  myId,
  role,
  otherName,
  projectLabel,
  pdfUrl,
  ceiling,
  initialMessages,
}: {
  projectId: string;
  myId: string;
  role: Role;
  otherName: string;
  projectLabel: string;
  pdfUrl: string | null;
  ceiling: number | null;
  initialMessages: Message[];
}) {
  const supabase = createSupabaseBrowserClient();
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const channel = supabase
      .channel(`messages:${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `project_id=eq.${projectId}`,
        },
        (payload) => {
          const m = payload.new as Message;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if ((!text.trim() && !file) || sending) return;
    setSending(true);
    setError(null);
    try {
      let fileUrl: string | null = null;
      if (file) {
        const path = `chat/${projectId}/${Date.now()}-${file.name}`;
        const { error: upErr } = await supabase.storage
          .from("project-files")
          .upload(path, file, { upsert: true });
        if (upErr) throw upErr;
        fileUrl = supabase.storage.from("project-files").getPublicUrl(path).data.publicUrl;
      }
      const { data, error: insErr } = await supabase
        .from("messages")
        .insert({
          project_id: projectId,
          sender_id: myId,
          sender_role: role,
          content: text.trim() || null,
          file_url: fileUrl,
        })
        .select("*")
        .single();
      if (insErr) throw insErr;
      if (data) {
        setMessages((prev) =>
          prev.some((x) => x.id === data.id) ? prev : [...prev, data as Message],
        );
      }
      setText("");
      setFile(null);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 py-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-navy">{otherName}</h1>
          <p className="text-xs text-muted">{projectLabel}</p>
        </div>
      </div>

      {/* Pinned scope PDF */}
      {pdfUrl && (
        <a
          href={pdfUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-3 flex items-center gap-2 rounded-lg border border-teal bg-teal-soft px-3 py-2 text-sm font-semibold text-teal-dark"
        >
          📎 Locked scope PDF — pinned · tap to open
        </a>
      )}

      {/* Non-removable ceiling banner */}
      {ceiling != null && (
        <div className="mt-2 rounded-lg border-2 border-amber bg-amber-soft px-3 py-2 text-sm font-semibold text-amber-dark">
          Agreed budget ceiling: {formatINR(ceiling)}. No requests beyond this amount are
          permitted.
        </div>
      )}

      {/* Messages */}
      <div className="mt-3 flex-1 space-y-2 overflow-y-auto rounded-lg bg-white p-3 ring-1 ring-line">
        {messages.length === 0 && (
          <p className="py-10 text-center text-sm text-muted">
            No messages yet — say hello.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.sender_id === myId;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-sm ${
                  mine ? "bg-teal text-white" : "bg-canvas text-ink"
                }`}
              >
                {m.content && <p className="whitespace-pre-wrap">{m.content}</p>}
                {m.file_url && (
                  <a
                    href={m.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className={`text-xs underline ${mine ? "text-white" : "text-teal"}`}
                  >
                    📎 Attachment
                  </a>
                )}
                <div className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-muted"}`}>
                  {new Date(m.created_at).toLocaleTimeString("en-IN", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {error && <p className="mt-2 text-sm text-danger">{error}</p>}

      {/* Composer */}
      <form onSubmit={send} className="mt-3 flex items-center gap-2">
        <label className="btn-ghost cursor-pointer px-3" title="Attach file">
          📎
          <input
            type="file"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <input
          className="input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={file ? `Attached: ${file.name}` : "Type a message…"}
        />
        <button className="btn-teal shrink-0" disabled={sending}>
          {sending ? "…" : "Send"}
        </button>
      </form>
    </div>
  );
}
