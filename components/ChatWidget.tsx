"use client";

import { MessageCircle } from "lucide-react";

const WHATSAPP_NUMBER = "6285754494990";
const SUPPORT_MESSAGE = "Halo Dokumenku AI, saya butuh bantuan.";

export default function ChatWidget() {
  const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(SUPPORT_MESSAGE)}`;

  return (
    <a
      href={whatsappUrl}
      target="_blank"
      rel="noreferrer"
      aria-label="Chat admin melalui WhatsApp"
      title="Chat WhatsApp"
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 9999,
        minWidth: "56px",
        height: "56px",
        borderRadius: "999px",
        background: "#25D366",
        color: "#FFFFFF",
        boxShadow: "0 6px 20px rgba(37, 211, 102, 0.35)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "0 18px",
        fontSize: "0.82rem",
        fontWeight: 800,
        textDecoration: "none",
        transition: "transform 0.2s ease, box-shadow 0.2s ease",
      }}
      onMouseEnter={(event) => {
        event.currentTarget.style.transform = "scale(1.04)";
        event.currentTarget.style.boxShadow = "0 8px 26px rgba(37, 211, 102, 0.45)";
      }}
      onMouseLeave={(event) => {
        event.currentTarget.style.transform = "scale(1)";
        event.currentTarget.style.boxShadow = "0 6px 20px rgba(37, 211, 102, 0.35)";
      }}
    >
      <MessageCircle size={24} strokeWidth={2.4} aria-hidden="true" />
      <span>WhatsApp</span>
    </a>
  );
}
