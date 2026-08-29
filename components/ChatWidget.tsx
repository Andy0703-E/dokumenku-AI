"use client";

import { useState, useRef, useEffect } from "react";
import { MessageCircle, X, Send, Loader2, CheckCircle, User } from "lucide-react";

export default function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [chatHistory, setChatHistory] = useState<Array<{ role: "user" | "bot"; text: string }>>([
    { role: "bot", text: "Halo! 👋 Ada yang bisa kami bantu? Kirim pesan dan admin akan segera merespons via WhatsApp." },
  ]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 300);
    }
  }, [isOpen]);

  async function handleSend() {
    const trimmedMsg = message.trim();
    const trimmedName = name.trim();
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
        { role: "bot", text: payload.message || "Pesan terkirim! Admin akan segera merespons via WhatsApp." },
      ]);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gagal mengirim pesan.");
      setChatHistory((prev) => [
        ...prev,
        { role: "bot", text: "Maaf, terjadi kesalahan. Silakan coba lagi atau hubungi admin via WhatsApp." },
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
                <span style={{ fontSize: "0.72rem", opacity: 0.85 }}>Online • Balasan via WhatsApp</span>
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
            {chatHistory.map((msg, i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  justifyContent: msg.role === "user" ? "flex-end" : "flex-start",
                }}
              >
                <div
                  style={{
                    maxWidth: "80%",
                    padding: "10px 14px",
                    borderRadius: msg.role === "user" ? "14px 14px 4px 14px" : "14px 14px 14px 4px",
                    background: msg.role === "user" ? "#2563EB" : "#FFFFFF",
                    color: msg.role === "user" ? "#fff" : "#1F2937",
                    fontSize: "0.84rem",
                    lineHeight: "1.5",
                    border: msg.role === "user" ? "none" : "1px solid #E5E7EB",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          {/* Input Area */}
          <div
            style={{
              padding: "12px 16px",
              borderTop: "1px solid #E5E7EB",
              background: "#FFFFFF",
              flexShrink: 0,
            }}
          >
            {!sent ? (
              <>
                {/* Name Input */}
                <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "8px" }}>
                  <User size={14} style={{ color: "#9CA3AF", flexShrink: 0 }} />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); if (error) setError(""); }}
                    placeholder="Nama Anda"
                    style={{
                      flex: 1,
                      padding: "8px 10px",
                      border: "1px solid #D1D5DB",
                      borderRadius: "8px",
                      fontSize: "0.82rem",
                      outline: "none",
                      background: "#F9FAFB",
                    }}
                  />
                </div>

                {/* Message Input */}
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
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "12px 0" }}>
                <CheckCircle size={32} style={{ color: "#10B981", marginBottom: "8px" }} />
                <p style={{ fontSize: "0.85rem", color: "#374151", margin: 0, fontWeight: 600 }}>
                  Pesan Terkirim!
                </p>
                <p style={{ fontSize: "0.78rem", color: "#6B7280", margin: "4px 0 0" }}>
                  Admin akan membalas via WhatsApp Anda.
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
