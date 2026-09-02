"use client";

import { useEffect, useState } from "react";
import {
  Layers,
  Check,
  ChevronDown,
  HelpCircle,
  CreditCard,
  RotateCcw,
  MessageCircle,
  Coins,
  Mail,
  ArrowUpRight,
  User,
  FileText,
  ArrowRight,
  Loader2,
  CheckCircle2,
  QrCode,
  ShieldCheck,
  Copy,
  Download,
} from "lucide-react";
import { toast } from "sonner";

const plans = [
  {
    name: "Pro Studio",
    badge: "Populer",
    price: "Rp 20.000",
    period: "sekali beli",
    desc: "Paket standar untuk developer",
    features: [
      "100 Kredit (100 set 4 dokumen)",
      "Semua model AI (Starter & Flagship)",
      "Priority Processing",
      "Ekspor ZIP & MD",
      "Dukungan prioritas",
    ],
    cta: "Beli Sekarang",
    ctaHref: "/login",
    popular: false,
  },
  {
    name: "Pro Max",
    badge: "Best Value",
    price: "Rp 75.000",
    period: "sekali beli",
    desc: "Hemat 25% — untuk tim & project besar",
    features: [
      "500 Kredit (500 set 4 dokumen)",
      "Semua model AI (Starter & Flagship)",
      "Priority Processing",
      "Ekspor ZIP & MD",
      "Dukungan prioritas",
    ],
    cta: "Beli Pro Max",
    ctaHref: "/login",
    popular: true,
  },
  {
    name: "Enterprise",
    badge: "Bisnis",
    price: "Custom",
    period: "hubungi kami",
    desc: "Untuk tim dan organisasi",
    features: [
      "Kredit & fitur kustom",
      "Integrasi & SSO",
      "SLA & dukungan khusus",
      "Onboarding & training",
    ],
    cta: "Hubungi via WhatsApp",
    ctaHref: "https://wa.me/6285754494990?text=Halo%20Dokumenku%20AI%2C%20saya%20tertarik%20dengan%20paket%20Enterprise.",
    popular: false,
  },
];

const matrixFeatures = [
  { feature: "Harga", pro: "Rp 20.000", proMax: "Rp 75.000", enterprise: "Custom" },
  { feature: "Jumlah Kredit", pro: "100", proMax: "500", enterprise: "Kustom" },
  { feature: "Harga per Kredit", pro: "Rp 200", proMax: "Rp 150", enterprise: "Kustom" },
  { feature: "Jumlah Dokumen per Kredit", pro: "4 Dokumen", proMax: "4 Dokumen", enterprise: "4 Dokumen" },
  { feature: "PRD.md & User Stories", pro: "✓", proMax: "✓", enterprise: "✓" },
  { feature: "TECH-STACK.md Arsitektur", pro: "✓", proMax: "✓", enterprise: "✓" },
  { feature: "UI-UX.md & User Flow", pro: "✓", proMax: "✓", enterprise: "✓" },
  { feature: "SCHEMA.md ERD & SQL", pro: "✓", proMax: "✓", enterprise: "✓" },
  { feature: "Multi-Model AI Engine", pro: "✓", proMax: "✓", enterprise: "✓" },
  { feature: "Ekspor Single Markdown (.md)", pro: "✓", proMax: "✓", enterprise: "✓" },
  { feature: "Ekspor Bundel Arsip (.ZIP)", pro: "✓", proMax: "✓", enterprise: "✓" },
  { feature: "Kecepatan Generasi", pro: "Prioritas Cepat", proMax: "Ultra Prioritas", enterprise: "Ultra Prioritas" },
  { feature: "Dukungan Pelanggan", pro: "Email 24 Jam", proMax: "Email 24 Jam", enterprise: "Dedicated Manager" },
];

const faqItems = [
  {
    icon: Coins,
    q: "Bagaimana cara kerja sistem kredit Dokumenku AI?",
    a: "1 kredit digunakan untuk menghasilkan 1 set lengkap berisi 4 file rekayasa (PRD.md, TECH-STACK.md, UI-UX.md, SCHEMA.md). Kredit tidak memiliki masa kedaluwarsa.",
  },
  {
    icon: CreditCard,
    q: "Apakah ada biaya langganan bulanan tersembunyi?",
    a: "Tidak ada langganan. Model kami adalah bayar sekali (pay-as-you-go). Anda hanya membeli paket kredit saat membutuhkannya.",
  },
  {
    icon: RotateCcw,
    q: "Bagaimana jika pembuatan dokumen gagal?",
    a: "Sistem kami memiliki proteksi atomic balance. Jika generasi gagal sebelum menghasilkan dokumen, kredit Anda tidak akan terpotong atau dikembalikan secara otomatis.",
  },
  {
    icon: MessageCircle,
    q: "Bagaimana cara melakukan pembelian paket Pro?",
    a: "Pilih paket, bayar melalui QRIS, lalu kirim bukti pembayaran langsung ke WhatsApp admin. Setelah itu, tandai invoice sudah dikirim. Kredit hanya ditambahkan setelah admin memeriksa dan menyetujui pembayaran.",
  },
];

const WHATSAPP_NUMBER = "6285754494990";

type OrderData = {
  id: string;
  userEmail: string;
  planName: string;
  amount: number;
  credits: number;
  paymentMethod: string;
  status: string;
  createdAt: string;
};

export default function PricingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [isCreatingOrder, setIsCreatingOrder] = useState(false);
  const [currentOrder, setCurrentOrder] = useState<OrderData | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Pengguna mengirim foto bukti langsung ke WhatsApp admin. Sistem hanya
  // mencatat bahwa invoice sudah siap diperiksa, tanpa bot atau OCR.
  const [isSubmittingProof, setIsSubmittingProof] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentSubmitted, setPaymentSubmitted] = useState(false);

  useEffect(() => {
    fetch("/api/session")
      .then((res) => res.json())
      .then((payload: { authenticated?: boolean }) => {
        setIsAuthenticated(Boolean(payload.authenticated));
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
  }, []);

  async function handleSelectPlan(planName: string) {
    if (planName === "Pro Studio" || planName === "Pro Max") {
      if (!isAuthenticated) {
        toast.info("Silakan masuk atau daftar akun terlebih dahulu untuk membeli paket.");
        window.location.assign("/login");
        return;
      }

      setIsCreatingOrder(true);
      try {
        const planKey = planName === "Pro Max" ? "pro-max" : "pro";
        const res = await fetch("/api/checkout/create-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan: planKey, paymentMethod: "QRIS" }),
        });
        const payload = (await res.json()) as { ok?: boolean; order?: OrderData; error?: string };
        if (!res.ok || !payload.order) {
          throw new Error(payload.error || "Gagal membuat tagihan invoice.");
        }
        setCurrentOrder(payload.order);
        setPaymentError(null);
        setPaymentSuccess(false);
        setPaymentSubmitted(false);
        setShowCheckoutModal(true);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Gagal memproses pesanan.");
      } finally {
        setIsCreatingOrder(false);
      }
    } else if (planName === "Enterprise") {
      window.location.assign("https://wa.me/6285754494990?text=Halo%20Dokumenku%20AI%2C%20saya%20tertarik%20dengan%20paket%20Enterprise.");
    }
  }

  function getWhatsAppProofUrl(order: OrderData) {
    const message = [
      "Halo Admin Dokumenku AI, saya sudah membayar QRIS.",
      "",
      `Invoice: ${order.id}`,
      `Paket: ${order.planName}`,
      `Nominal: Rp ${order.amount.toLocaleString("id-ID")}`,
      "",
      "Saya lampirkan bukti pembayaran di pesan ini.",
    ].join("\n");
    return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(message)}`;
  }

  async function handleMarkProofSent() {
    if (!currentOrder) return;
    setIsSubmittingProof(true);
    setPaymentError(null);
    try {
      const res = await fetch("/api/checkout/submit-whatsapp-proof", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: currentOrder.id,
        }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        error?: string;
        data?: {
          isPendingReview?: boolean;
          message?: string;
        };
      };
      if (res.ok && payload.data?.isPendingReview) {
        setPaymentSubmitted(true);
        toast.success(payload.data.message || "Invoice sedang menunggu persetujuan admin.");
      } else {
        const errMsg = payload.error || "Invoice belum dapat dikirim ke antrean pemeriksaan admin.";
        setPaymentError(errMsg);
        toast.error(`Pembayaran belum diproses: ${errMsg}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengirim invoice ke antrean pemeriksaan.";
      setPaymentError(msg);
      toast.error(msg);
    } finally {
      setIsSubmittingProof(false);
    }
  }

  function handleCopy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopiedField(label);
    toast.success(`${label} berhasil disalin!`);
    setTimeout(() => setCopiedField(null), 2000);
  }

  return (
    <main className="landing-shell">
      {/* ── Top Header Bar ─────────────────────────────────────── */}
      <header className="landing-nav" aria-label="Navigasi Harga">
        <a href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div className="brand-logo-icon">
            <Layers size={20} strokeWidth={2.4} />
          </div>
          <div className="brand-title-wrap">
            <strong style={{ fontSize: "1.15rem" }}>Dokumenku AI</strong>
          </div>
        </a>

        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          {isAuthenticated ? (
            <a
              href="/account"
              className="btn-secondary"
              style={{
                minHeight: "38px",
                padding: "0 16px",
                fontSize: "0.86rem",
                fontWeight: 700,
                color: "var(--cobalt)",
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                textDecoration: "none",
              }}
            >
              <User size={15} /> Akun Saya
            </a>
          ) : (
            <a
              href="/login"
              className="btn-primary"
              style={{ minHeight: "38px", padding: "0 20px", fontSize: "0.88rem", textDecoration: "none" }}
            >
              Masuk
            </a>
          )}
          <a
            href="/studio"
            className="btn-primary"
            style={{ minHeight: "38px", padding: "0 18px", fontSize: "0.88rem" }}
          >
            Mulai Studio
          </a>
        </div>
      </header>

      {/* ── Pricing Hero Section ─────────────────────────────────── */}
      <div className="section-shell" style={{ maxWidth: "1200px", margin: "0 auto" }}>
        <div className="section-title-wrap" style={{ marginBottom: "40px" }}>
          <div className="eyebrow-badge center">PILIHAN PAKET</div>
          <h2>Investasi Sederhana Tanpa Langganan</h2>
          <p>
            Satu kredit membuka empat dokumen teknis lengkap. Beli saat butuh, gunakan kapan saja tanpa langganan mengikat.
          </p>
        </div>

        {/* ── Pricing 3 Cards Grid ─────────────────────────────────── */}
        <div className="landing-pricing-grid" style={{ marginBottom: "64px" }}>
          {plans.map((plan) => (
            <article key={plan.name} className={`landing-plan-card ${plan.popular ? "popular" : ""}`}>
              {plan.popular && <span className="popular-ribbon">Paling Populer</span>}
              <h3>{plan.name}</h3>

              <div className="plan-price-row">
                <strong>{plan.price}</strong>
                <span>/ {plan.period}</span>
              </div>
              <span className="plan-desc-text">{plan.desc}</span>

              <ul className="plan-feature-items">
                {plan.features.map((feat) => (
                  <li key={feat}>
                    <Check size={16} strokeWidth={2.5} />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>

              <button
                type="button"
                onClick={() => handleSelectPlan(plan.name)}
                className={plan.popular ? "btn-primary" : "btn-secondary"}
                style={{ width: "100%", minHeight: "44px", justifyContent: "center" }}
              >
                {plan.cta}
                {plan.popular ? null : <ArrowUpRight size={14} />}
              </button>
            </article>
          ))}
        </div>

        {/* ── Detail Comparison Matrix ─────────────────────────────── */}
        <section
          style={{
            background: "#FFFFFF",
            border: "1px solid var(--border)",
            borderRadius: "20px",
            padding: "32px 28px",
            boxShadow: "var(--shadow-sm)",
            marginBottom: "64px",
            overflowX: "auto",
          }}
          aria-labelledby="matrix-heading"
        >
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <h2 id="matrix-heading" style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "var(--navy)" }}>
              Perbandingan Detail Fitur Paket
            </h2>
          </div>

          <table className="admin-custom-table">
            <thead>
              <tr>
                <th>Fitur & Kapabilitas</th>
                <th style={{ color: "var(--cobalt)", fontWeight: 800 }}>Pro Studio</th>
                <th style={{ color: "#DC2626", fontWeight: 800 }}>Pro Max</th>
                <th>Enterprise</th>
              </tr>
            </thead>
            <tbody>
              {matrixFeatures.map((row) => (
                <tr key={row.feature}>
                  <td style={{ fontWeight: 650 }}>{row.feature}</td>
                  <td style={{ color: "var(--cobalt)", fontWeight: 800 }}>{row.pro}</td>
                  <td style={{ color: "#DC2626", fontWeight: 800 }}>{row.proMax}</td>
                  <td style={{ color: "var(--text-muted)" }}>{row.enterprise}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        {/* ── FAQ Section ─────────────────────────────────────────── */}
        <section style={{ marginBottom: "64px" }}>
          <div className="section-title-wrap" style={{ marginBottom: "32px" }}>
            <div className="eyebrow-badge center">
              <HelpCircle size={14} />
              <span>FAQ HARGA</span>
            </div>
            <h2>Pertanyaan Seputar Kredit & Pembayaran</h2>
          </div>

          <div className="faq-accordion-container">
            {faqItems.map((item, index) => {
              const isOpen = openFaq === index;
              const Icon = item.icon;
              return (
                <div key={item.q} className="faq-row-item">
                  <button
                    type="button"
                    className="faq-trigger-btn"
                    onClick={() => setOpenFaq(isOpen ? null : index)}
                    aria-expanded={isOpen}
                  >
                    <span className="faq-left">
                      <span className="faq-icon-box">
                        <Icon size={16} />
                      </span>
                      <span>{item.q}</span>
                    </span>
                    <ChevronDown
                      size={18}
                      style={{
                        transform: isOpen ? "rotate(180deg)" : "rotate(0)",
                        transition: "transform 0.15s ease",
                        color: "var(--text-muted)",
                        flexShrink: 0,
                      }}
                    />
                  </button>
                  {isOpen && <div className="faq-body-content">{item.a}</div>}
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Contact Support Note ─────────────────────────────────── */}
        <footer style={{ textAlign: "center", padding: "28px 0", borderTop: "1px solid var(--border-light)" }}>
          <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>
            Butuh bantuan atau ingin custom paket untuk institusi?{" "}
            <a href="mailto:dadung2707@gmail.com" style={{ color: "var(--cobalt)", fontWeight: 750 }}>
              <Mail size={14} style={{ display: "inline", verticalAlign: "-2px" }} /> dadung2707@gmail.com
            </a>
          </p>
        </footer>
      </div>

      {/* ── Modal Checkout & Tagihan Invoice Pembayaran ─────────── */}
      {showCheckoutModal && currentOrder && (
        <div
          className="studio-modal-backdrop"
          onClick={() => !isSubmittingProof && setShowCheckoutModal(false)}
        >
          <div
            className="studio-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="checkout-title"
            style={{ maxWidth: "760px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
          >
            {paymentSuccess ? (
              <div style={{ padding: "36px 24px", textAlign: "center" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    background: "#ECFDF5",
                    color: "#059669",
                    display: "grid",
                    placeItems: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <CheckCircle2 size={34} />
                </div>
                <span
                  style={{
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    color: "#059669",
                    background: "#D1FAE5",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    display: "inline-block",
                    marginBottom: "8px",
                  }}
                >
                  STATUS: LUNAS (PAID)
                </span>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--navy)", margin: "0 0 8px" }}>
                  Pembayaran Terverifikasi!
                </h3>
                <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: "0 0 24px", lineHeight: "1.55" }}>
                  Tagihan <strong>{currentOrder.id}</strong> telah berhasil dilunasi. <strong>{currentOrder.credits} Kredit {currentOrder.planName}</strong> telah aktif pada akun Anda dan siap digunakan.
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                  <a
                    href="/studio"
                    className="btn-primary"
                    style={{ minHeight: "42px", padding: "0 22px", fontSize: "0.9rem" }}
                  >
                     <FileText size={15} /> Mulai Bikin Dokumen di Studio
                  </a>
                  <a
                    href="/account"
                    className="btn-secondary"
                    style={{ minHeight: "42px", padding: "0 18px", fontSize: "0.9rem" }}
                  >
                    <User size={14} /> Lihat Profil & Saldo
                  </a>
                </div>
              </div>
            ) : paymentSubmitted ? (
              <div style={{ padding: "36px 24px", textAlign: "center" }}>
                <div
                  style={{
                    width: "64px",
                    height: "64px",
                    borderRadius: "50%",
                    background: "#FEF3C7",
                    color: "#D97706",
                    display: "grid",
                    placeItems: "center",
                    margin: "0 auto 16px",
                  }}
                >
                  <MessageCircle size={32} />
                </div>
                <span
                  style={{
                    fontSize: "0.74rem",
                    fontWeight: 800,
                    color: "#92400E",
                    background: "#FDE68A",
                    padding: "3px 10px",
                    borderRadius: "20px",
                    display: "inline-block",
                    marginBottom: "8px",
                  }}
                >
                  MENUNGGU PERSETUJUAN ADMIN
                </span>
                <h3 style={{ fontSize: "1.4rem", fontWeight: 800, color: "var(--navy)", margin: "0 0 8px" }}>
                  Menunggu Pemeriksaan Admin
                </h3>
                <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: "0 0 24px", lineHeight: "1.55" }}>
                  Bukti pembayaran untuk tagihan <strong>{currentOrder.id}</strong> sudah Anda kirim melalui WhatsApp. Kredit akan masuk setelah pembayaran diperiksa dan disetujui administrator.
                </p>
                <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
                  <a href="/account" className="btn-primary" style={{ minHeight: "42px", padding: "0 22px", fontSize: "0.9rem" }}>
                    <User size={15} /> Lihat Status Pembayaran
                  </a>
                  <button type="button" className="btn-secondary" onClick={() => setShowCheckoutModal(false)}>
                    Tutup
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Modal Header */}
                <div className="studio-modal-header" style={{ padding: "14px 20px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <div
                      style={{
                        width: "34px",
                        height: "34px",
                        borderRadius: "10px",
                        background: "#EEF2FF",
                        color: "var(--cobalt)",
                        display: "grid",
                        placeItems: "center",
                        flexShrink: 0,
                      }}
                    >
                      <QrCode size={18} />
                    </div>
                    <div>
                      <strong id="checkout-title" style={{ fontSize: "1.05rem", color: "var(--navy)", display: "block" }}>
                        Pembayaran QRIS {currentOrder.planName}
                      </strong>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        Invoice: <strong>{currentOrder.id}</strong> • {currentOrder.credits} Kredit Blueprint
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="studio-modal-close"
                    onClick={() => setShowCheckoutModal(false)}
                    disabled={isSubmittingProof}
                  >
                    ✕
                  </button>
                </div>

                <div className="studio-modal-body" style={{ padding: "16px 20px", overflowY: "auto" }}>
                  {/* Top Payment Notice */}
                  <div
                    style={{
                      background: "#F8FAFC",
                      borderRadius: "10px",
                      padding: "10px 14px",
                      border: "1px solid var(--border-light)",
                      marginBottom: "14px",
                      fontSize: "0.76rem",
                      color: "var(--text-body)",
                      lineHeight: "1.45",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "4px" }}>
                      <span>Total Tagihan: <strong style={{ color: "var(--cobalt)" }}>Rp {currentOrder.amount.toLocaleString("id-ID")}</strong></span>
                      <span>Kredit Diperoleh: <strong style={{ color: "#059669" }}>+{currentOrder.credits} Kredit {currentOrder.planName}</strong></span>
                    </div>
                  </div>

                  {/* 2-Column Responsive Layout */}
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                      gap: "16px",
                      alignItems: "start",
                    }}
                  >
                    {/* Left Column: QRIS Card */}
                    <div
                      style={{
                        background: "#FFFFFF",
                        border: "1.5px solid var(--border)",
                        borderRadius: "12px",
                        padding: "14px",
                        textAlign: "center",
                      }}
                    >
                      {/* Price Header */}
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "10px" }}>
                        <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)" }}>
                          Nominal QRIS:
                        </span>
                        <strong style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--cobalt)" }}>
                          Rp {currentOrder.amount.toLocaleString("id-ID")}
                        </strong>
                      </div>

                      {/* QRIS Official Image Preview */}
                      <div
                        style={{
                          background: "#FFFFFF",
                          padding: "6px",
                          borderRadius: "10px",
                          border: "1px solid var(--border-light)",
                          maxWidth: "180px",
                          margin: "0 auto 10px",
                        }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={currentOrder.amount === 75000 ? "/75k.jpeg" : "/20k.jpeg"}
                          alt={`QRIS Pembayaran ${currentOrder.planName}`}
                          style={{
                            width: "100%",
                            maxHeight: "220px",
                            objectFit: "contain",
                            display: "block",
                            borderRadius: "6px",
                          }}
                        />
                      </div>

                      <div style={{ marginBottom: "10px" }}>
                        <strong style={{ fontSize: "0.84rem", color: "var(--navy)", display: "block" }}>
                          Dokumenku AI
                        </strong>
                        <code style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>
                          NMID: ID1026479441309 • A01
                        </code>
                      </div>

                      <a
                        href={currentOrder.amount === 75000 ? "/75k.jpeg" : "/20k.jpeg"}
                        download={`QRIS-${currentOrder.amount.toLocaleString("id-ID")}.jpeg`}
                        className="btn-secondary"
                        style={{ minHeight: "30px", padding: "0 12px", fontSize: "0.74rem", width: "100%", justifyContent: "center" }}
                      >
                        <Download size={13} /> Unduh Gambar QRIS
                      </a>
                    </div>

                    {/* Right Column: proof is sent manually through WhatsApp */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                      <div
                        style={{
                          padding: "16px",
                          borderRadius: "12px",
                          border: "1px solid #BBF7D0",
                          background: "#F0FDF4",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: "9px", marginBottom: "10px" }}>
                          <div
                            style={{
                              width: "36px",
                              height: "36px",
                              borderRadius: "50%",
                              display: "grid",
                              placeItems: "center",
                              background: "#25D366",
                              color: "#FFFFFF",
                            }}
                          >
                            <MessageCircle size={19} strokeWidth={2.4} />
                          </div>
                          <div>
                            <strong style={{ fontSize: "0.86rem", color: "#065F46", display: "block" }}>
                              Kirim bukti langsung ke WhatsApp admin
                            </strong>
                            <span style={{ fontSize: "0.72rem", color: "#047857" }}>Tidak ada unggahan ke sistem, bot, atau OCR.</span>
                          </div>
                        </div>

                        <ol style={{ margin: "0 0 14px", paddingLeft: "19px", color: "#166534", fontSize: "0.76rem", lineHeight: "1.65" }}>
                          <li>Selesaikan pembayaran QRIS sesuai nominal.</li>
                          <li>Kirim foto atau screenshot bukti pembayaran di WhatsApp.</li>
                          <li>Klik tombol konfirmasi setelah pesan berhasil dikirim.</li>
                        </ol>

                        <a
                          href={getWhatsAppProofUrl(currentOrder)}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            minHeight: "40px",
                            width: "100%",
                            borderRadius: "9px",
                            background: "#25D366",
                            color: "#FFFFFF",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            textDecoration: "none",
                            fontSize: "0.8rem",
                            fontWeight: 800,
                          }}
                        >
                          <MessageCircle size={16} /> Kirim Bukti ke WhatsApp
                        </a>
                      </div>

                      {paymentError && (
                        <div
                          style={{
                            padding: "8px 10px",
                            borderRadius: "8px",
                            background: "#FEF2F2",
                            border: "1px solid #FECACA",
                            color: "#991B1B",
                            fontSize: "0.72rem",
                            display: "flex",
                            gap: "6px",
                            lineHeight: "1.35",
                          }}
                        >
                          <span aria-hidden="true" style={{ fontWeight: 900 }}>!</span>
                          <div>
                            <strong>Pembayaran belum diproses:</strong> {paymentError}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Modal Footer */}
                <div className="studio-modal-footer" style={{ padding: "12px 20px" }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowCheckoutModal(false)}
                    disabled={isSubmittingProof}
                    style={{ minHeight: "36px", fontSize: "0.82rem" }}
                  >
                    Tutup / Bayar Nanti
                  </button>

                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleMarkProofSent}
                    disabled={isSubmittingProof}
                    style={{ minWidth: "190px", minHeight: "36px", fontSize: "0.82rem" }}
                  >
                    {isSubmittingProof ? (
                      <>
                        <Loader2 className="animate-spin" size={14} /> Memproses...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={14} /> Saya Sudah Kirim Bukti
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
