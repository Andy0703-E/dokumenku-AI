"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { MessageCircle, X, Send, Loader2, CheckCircle, LogIn } from "lucide-react";

type ChatMessage = {
  id?: number;
  role: "user" | "bot" | "admin";
  text: string;
};

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(null);
  const [userName, setUserName] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState("");
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    fetch("/api/account")
      .then((r) => r.json())
      .then((p: { authenticated?: boolean; name?: string; email?: string }) => {
        setIsAuthed(Boolean(p.authenticated));
        if (p.email) setUserName(p.email.split("@")[0]);
      })
      .catch(() => setIsAuthed(false));
  }, []);

  const loadHistory = useCallback(async () => {
    if (!isAuthed) return;
    try {
      const res = await fetch("/api/chat/history");
      const payload = (await res.json()) as {
        ok?: boolean;
        messages?: Array<{
          id: number;
          message: string;
          adminReply: string | null;
          createdAt: string;
        }>;
      };
      if (payload.ok && payload.messages) {
        const history: ChatMessage[] = [];
        for (const msg of payload.messages) {
          history.push({ id: msg.id, role: "user", text: msg.message });
          if (msg.adminReply) {
            history.push({ role: "admin", text: msg.adminReply });
          }
        }
        setChatHistory(history);
      }
    } catch {
      // ignore
    }
  }, [isAuthed]);

  useEffect(() => {
    if (isOpen && isAuthed) {
      loadHistory();
    }
  }, [isOpen, isAuthed, loadHistory]);

  useEffect(() => {
    if (isOpen && isAuthed) {
      pollingRef.current = setInterval(loadHistory, 10000);
    }
    return () => {
      if (pollingRef.current) clearInterval(pollingRef.current);
    };
  }, [isOpen, isAuthed, loadHistory]);

  useEffect(() => {
    scrollToBottom();
  }, [chatHistory, scrollToBottom]);

  useEffect(() => {
    if (isOpen && isAuthed) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen, isAuthed]);

  async function handleSend() {
    const trimmedMsg = message.trim();
    const trimmedName = userName.trim();
    if (!trimmedMsg || trimmedMsg.length < 3) {
      setError("Pesan minimal 3 karakter.");
      return;
    }
    if (!trimmedName) {
      setError("Nama wajib diisi.");
      return;
    }

    setError("");
    setIsSending(true);

    setChatHistory((prev) => [...prev, { role: "user", text: trimmedMsg }]);
    setMessage("");

    try {
      const res = await fetch("/api/chat/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmedName, message: trimmedMsg }),
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string; error?: string };

      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Gagal mengirim pesan.");
      }

      setChatHistory((prev) => [
        ...prev,
        { role: "bot", text: payload.message || "Pesan terkirim! Admin akan merespons via WhatsApp." },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pesan.");
      setChatHistory((prev) => [
        ...prev,
        { role: "bot", text: "Maaf, terjadi kesalahan. Silakan coba lagi." },
      ]);
    } finally {
      setIsSending(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <>
      {/* Floating Button */}
      {!isOpen && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          aria-label="Buka chat"
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 9999,
            width: "56px",
            height: "56px",
            borderRadius: "50%",
            background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
            color: "#fff",
            border: "none",
            cursor: "pointer",
            boxShadow: "0 4px 20px rgba(37,99,235,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transition: "transform 0.2s, box-shadow 0.2s",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.08)";
            e.currentTarget.style.boxShadow = "0 6px 28px rgba(37,99,235,0.55)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 4px 20px rgba(37,99,235,0.4)";
          }}
        >
          <MessageCircle size={26} />
        </button>
      )}

      {/* Chat Panel */}
      {isOpen && (
        <div
          style={{
            position: "fixed",
            bottom: "24px",
            right: "24px",
            zIndex: 10000,
            width: "380px",
            maxWidth: "calc(100vw - 32px)",
            height: "520px",
            maxHeight: "calc(100vh - 48px)",
            borderRadius: "16px",
            background: "#FFFFFF",
            border: "1px solid #E5E7EB",
            boxShadow: "0 12px 48px rgba(0,0,0,0.18)",
            display: "flex",
            flexDirection: "column",
            overflow: "hidden",
            fontFamily: "var(--font-sans, system-ui, sans-serif)",
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: "14px 16px",
              background: "linear-gradient(135deg, #2563EB, #1D4ED8)",
              color: "#fff",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <div
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  background: "rgba(255,255,255,0.2)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <MessageCircle size={18} />
              </div>
              <div>
                <strong style={{ fontSize: "0.92rem", display: "block" }}>Dokumenku AI Support</strong>
                <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>
                  {isAuthed ? "Online • Balasan via WhatsApp" : "Masuk untuk chat"}
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Tutup chat"
              style={{
                background: "rgba(255,255,255,0.2)",
                border: "none",
                borderRadius: "50%",
                width: "32px",
                height: "32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: "#fff",
              }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Content */}
          {isAuthed === null ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Loader2 size={24} className="animate-spin" style={{ color: "#6B7280" }} />
            </div>
          ) : !isAuthed ? (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "32px", textAlign: "center" }}>
              <LogIn size={40} style={{ color: "#2563EB", marginBottom: "16px" }} />
              <h3 style={{ fontSize: "1rem", fontWeight: 700, color: "#1F2937", margin: "0 0 8px" }}>
                Masuk untuk Chat
              </h3>
              <p style={{ fontSize: "0.82rem", color: "#6B7280", margin: "0 0 20px", lineHeight: "1.5" }}>
                Anda harus masuk terlebih dahulu untuk mengirim pesan ke admin.
              </p>
              <a
                href="/login"
                className="btn-primary"
                style={{ padding: "10px 24px", fontSize: "0.85rem", textDecoration: "none", borderRadius: "10px" }}
              >
                Masuk Sekarang
              </a>
            </div>
          ) : (
            <>
              {/* Messages */}
              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  padding: "16px",
                  display: "flex",
                  flexDirection: "column",
                  gap: "12px",
                  background: "#F9FAFB",
                }}
              >
                {chatHistory.length === 0 && (
                  <div style={{ textAlign: "center", padding: "24px 16px" }}>
                    <MessageCircle size={32} style={{ color: "#D1D5DB", marginBottom: "8px" }} />
                    <p style={{ fontSize: "0.82rem", color: "#9CA3AF", margin: 0 }}>
                      Kirim pesan untuk memulai chat dengan admin.
                    </p>
                  </div>
                )}
                {chatHistory.map((msg, i) => (
                  <div
                    key={msg.id ? `msg-${msg.id}-${msg.role}` : `local-${i}`}
                    style={{
                      display: "flex",
                      justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                    }}
                  >
                    <div
                      style={{
                        maxWidth: "80%",
                        padding: "10px 14px",
                        borderRadius:
                          msg.role === "user"
                            ? "14px 14px 4px 14px"
                            : msg.role === "admin"
                              ? "14px 14px 14px 4px"
                              : "14px 14px 14px 4px",
                        background:
                          msg.role === "user"
                            ? "#2563EB"
                            : msg.role === "admin"
                              ? "#ECFDF5"
                              : "#FFFFFF",
                        color:
                          msg.role === "user"
                            ? "#fff"
                            : msg.role === "admin"
                              ? "#065F46"
                              : "#1F2937",
                        fontSize: "0.84rem",
                        lineHeight: "1.5",
                        border:
                          msg.role === "user"
                            ? "none"
                            : msg.role === "admin"
                              ? "1px solid #A7F3D0"
                              : "1px solid #E5E7EB",
                        boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                      }}
                    >
                      {msg.role === "admin" && (
                        <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "#059669", marginBottom: "4px" }}>
                          💬 Balasan Admin
                        </div>
                      )}
                      {msg.text}
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              <div
                style={{
                  padding: "12px 16px",
                  borderTop: "1px solid #E5E7EB",
                  background: "#FFFFFF",
                  flexShrink: 0,
                }}
              >
                <div style={{ display: "flex", alignItems: "flex-end", gap: "8px" }}>
                  <textarea
                    ref={inputRef}
                    value={message}
                    onChange={(e) => { setMessage(e.target.value); if (error) setError(""); }}
                    onKeyDown={handleKeyDown}
                    placeholder="Ketik pesan Anda..."
                    rows={2}
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "10px",
                      fontSize: "0.84rem",
                      outline: "none",
                      resize: "none",
                      lineHeight: "1.4",
                      background: "#F9FAFB",
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleSend}
                    disabled={isSending || !message.trim()}
                    style={{
                      width: "40px",
                      height: "40px",
                      borderRadius: "50%",
                      background: isSending || !message.trim() ? "#D1D5DB" : "#2563EB",
                      color: "#fff",
                      border: "none",
                      cursor: isSending || !message.trim() ? "not-allowed" : "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      transition: "background 0.2s",
                    }}
                  >
                    {isSending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>

                {error && (
                  <div style={{ marginTop: "6px", fontSize: "0.76rem", color: "#DC2626", fontWeight: 500 }}>
                    {error}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
