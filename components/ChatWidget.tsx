"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MessageCircle, X, Send, Loader2 } from "lucide-react";

type ChatMessage = {
  id: number;
  userName: string;
  message: string;
  adminReply: string | null;
  createdAt: string;
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchMessages = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/history", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && data.messages) {
        setMessages(data.messages);
      }
    } catch {
      // silent
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      fetchMessages().finally(() => setIsLoading(false));

      pollRef.current = setInterval(fetchMessages, 15_000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }

    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [isOpen, fetchMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend() {
    const trimmed = newMessage.trim();
    if (!trimmed || trimmed.length < 3 || isSending) return;

    setIsSending(true);
    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });
      if (res.ok) {
        setNewMessage("");
        await fetchMessages();
      }
    } finally {
      setIsSending(false);
    }
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          aria-label="Buka chat dukungan"
          title="Chat Dukungan"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "var(--cobalt, #2563EB)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 6px 20px rgba(37, 99, 235, 0.35)",
            transition: "transform 0.2s ease, box-shadow 0.2s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.04)";
            e.currentTarget.style.boxShadow = "0 8px 26px rgba(37, 99, 235, 0.45)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(37, 99, 235, 0.35)";
          }}
        >
          <MessageCircle size={24} strokeWidth={2.4} />
        </button>
      )}

      {/* Chat Drawer */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 10000,
            width: "380px",
            maxWidth: "calc(100vw - 48px)",
            height: "520px",
            maxHeight: "calc(100vh - 48px)",
            background: "#fff",
            borderRadius: "16px",
            boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-sans, 'Inter', sans-serif)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              background: "var(--cobalt, #2563EB)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <MessageCircle size={18} />
              <strong style={{ fontSize: "0.9rem" }}>Chat Dukungan</strong>
            </div>
            <button
              onClick={() => setIsOpen(false)}
              aria-label="Tutup chat"
              style={{
                background: "rgba(255,255,255,0.15)",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                borderRadius: "8px",
                width: "32px",
                height: "32px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Messages */}
          <div
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 16px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              background: "#F8FAFC",
            }}
          >
            {isLoading ? (
              <div style={{ textAlign: "center", color: "var(--text-muted, #64748B)", padding: "24px 0" }}>
                <Loader2 size={20} className="animate-spin" style={{ margin: "0 auto 8px" }} />
                <span style={{ fontSize: "0.82rem" }}>Memuat riwayat...</span>
              </div>
            ) : messages.length === 0 ? (
              <div style={{ textAlign: "center", color: "var(--text-muted, #64748B)", padding: "24px 0" }}>
                <MessageCircle size={32} style={{ margin: "0 auto 8px", opacity: 0.4 }} />
                <p style={{ fontSize: "0.82rem", margin: 0 }}>Belum ada pesan. Kirim pesan untuk memulai chat dengan admin.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div key={msg.id} style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                  {/* User message */}
                  <div
                    style={{
                      alignSelf: "flex-end",
                      background: "var(--cobalt, #2563EB)",
                      color: "#fff",
                      padding: "8px 12px",
                      borderRadius: "12px 12px 4px 12px",
                      maxWidth: "85%",
                      fontSize: "0.82rem",
                      lineHeight: 1.45,
                      wordBreak: "break-word",
                    }}
                  >
                    {msg.message}
                  </div>
                  {/* Admin reply */}
                  {msg.adminReply && (
                    <div
                      style={{
                        alignSelf: "flex-start",
                        background: "#E2E8F0",
                        color: "#1E293B",
                        padding: "8px 12px",
                        borderRadius: "12px 12px 12px 4px",
                        maxWidth: "85%",
                        fontSize: "0.82rem",
                        lineHeight: 1.45,
                        wordBreak: "break-word",
                      }}
                    >
                      <span style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--cobalt, #2563EB)", display: "block", marginBottom: "2px" }}>
                        Admin
                      </span>
                      {msg.adminReply}
                    </div>
                  )}
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div
            style={{
              padding: "10px 16px",
              borderTop: "1px solid var(--border, #E2E8F0)",
              display: "flex",
              gap: "8px",
              background: "#fff",
              flexShrink: 0,
            }}
          >
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSend(); }}
              placeholder="Ketik pesan..."
              maxLength={2000}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "8px",
                border: "1px solid var(--border, #E2E8F0)",
                fontSize: "0.82rem",
                outline: "none",
                fontFamily: "inherit",
              }}
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim() || newMessage.trim().length < 3 || isSending}
              aria-label="Kirim pesan"
              style={{
                width: "38px",
                height: "38px",
                borderRadius: "8px",
                border: "none",
                background: newMessage.trim().length >= 3 && !isSending ? "var(--cobalt, #2563EB)" : "#CBD5E1",
                color: "#fff",
                cursor: newMessage.trim().length >= 3 && !isSending ? "pointer" : "not-allowed",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                flexShrink: 0,
              }}
            >
              {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
