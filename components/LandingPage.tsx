"use client";

import { useEffect, useState } from "react";
import {
  FileText,
  Clock,
  Radio,
  FolderArchive,
  Layers,
  Layout,
  Database,
  Lightbulb,
  Cpu,
  Download,
  Check,
  ChevronDown,
  HelpCircle,
  Edit3,
  ArrowRight,
  User,
} from "lucide-react";

type LandingPageProps = {
  onStart: (initialPrompt?: string) => void;
};

const DOCUMENTS = [
  {
    code: "01",
    file: "PRD.md",
    title: "Product Requirement Document",
    pills: ["Tujuan", "Fitur", "KPI"],
    icon: FileText,
    color: "blue",
  },
  {
    code: "02",
    file: "TECH-STACK.md",
    title: "Arsitektur & Tech Stack",
    pills: ["Arsitektur", "Teknologi", "Deployment"],
    icon: Layers,
    color: "green",
  },
  {
    code: "03",
    file: "UI-UX.md",
    title: "Desain UI/UX & Flow",
    pills: ["Wireframe", "Flow", "Komponen"],
    icon: Layout,
    color: "purple",
  },
  {
    code: "04",
    file: "SCHEMA.md",
    title: "Database Schema & Entity",
    pills: ["ERD", "Tabel", "Relasi"],
    icon: Database,
    color: "amber",
  },
];

const WORKFLOW_STEPS = [
  {
    num: "01",
    title: "Tuliskan Ide Proyek",
    desc: "Ceritakan ide, target pengguna, dan masalah yang ingin dipecahkan.",
    icon: Lightbulb,
    color: "blue",
  },
  {
    num: "02",
    title: "Pilih Engine AI",
    desc: "Pilih provider AI terbaik sesuai kebutuhan proyek Anda.",
    icon: Cpu,
    color: "green",
  },
  {
    num: "03",
    title: "Live Streaming 4 File",
    desc: "AI menyusun 4 dokumen secara real-time dalam hitungan menit.",
    icon: Radio,
    color: "blue",
  },
  {
    num: "04",
    title: "Ekspor & Mulai Koding",
    desc: "Ekspor ZIP & MD lalu langsung masuk ke codebase Anda.",
    icon: Download,
    color: "green",
  },
];

const PLANS = [
  {
    name: "Pro Studio",
    price: "Rp 20.000",
    period: "sekali beli",
    desc: "Sekali bayar, pakai selamanya",
    features: [
      "100 Kredit (100 set 4 dokumen)",
      "Semua model AI (Starter & Flagship)",
      "Ekspor ZIP & MD",
      "Dukungan prioritas",
    ],
    cta: "Beli Sekarang",
    popular: true,
  },
  {
    name: "Enterprise",
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
    popular: false,
  },
];

const FAQS = [
  {
    icon: HelpCircle,
    q: "Apa itu Dokumenku AI dan bagaimana cara kerjanya?",
    a: "Dokumenku AI adalah generator arsitektur produk perangkat lunak otomatis. Dari satu brief yang Anda berikan, AI menyusun 4 dokumen rekayasa standar industri (PRD, Tech Stack, UI/UX, dan Database Schema) secara simultan melalui real-time streaming.",
  },
  {
    icon: FileText,
    q: "Dokumen apa saja yang dihasilkan?",
    a: "Setiap proses menghasilkan 4 file lengkap: PRD.md (Product Requirement Document), TECH-STACK.md (Arsitektur & Pilihan Teknologi), UI-UX.md (Panduan Desain & Wireframe flow), dan SCHEMA.md (Skema Tabel & Relasi Database ERD).",
  },
  {
    icon: Clock,
    q: "Berapa harga paket Dokumenku AI?",
    a: "Paket Pro Studio seharga Rp 20.000 untuk 100 kredit (100 set 4 dokumen). Sekali bayar, pakai selamanya. Untuk paket Enterprise, silakan hubungi kami via WhatsApp.",
  },
  {
    icon: Edit3,
    q: "Apakah dokumen bisa diekspor dan diedit?",
    a: "Ya, Anda bisa menyalin teks ke clipboard, mengunduh file Markdown (.md) individual, atau langsung mengunduh seluruh 4 dokumen dalam satu arsip ZIP siap pakai ke codebase.",
  },
];

export default function LandingPage({ onStart }: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [stats, setStats] = useState<{ totalCredits: number; completedDocuments: number; totalUsers: number } | null>(null);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then((payload: { authenticated?: boolean }) => {
        setIsAuthenticated(Boolean(payload.authenticated));
      })
      .catch(() => {
        setIsAuthenticated(false);
      });
    fetch("/api/stats")
      .then((res) => res.json())
      .then((payload: { totalCredits?: number; completedDocuments?: number; totalUsers?: number }) => {
        setStats({
          totalCredits: payload.totalCredits ?? 0,
          completedDocuments: payload.completedDocuments ?? 0,
          totalUsers: payload.totalUsers ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  function handleStartAction(prompt?: string) {
    if (isAuthenticated) {
      onStart(prompt);
    } else {
      window.location.assign("/login");
    }
  }

  return (
    <main className="landing-shell">
      {/* ── 1. Top Navbar ──────────────────────────────────────── */}
      <header className="landing-nav" aria-label="Navigasi Utama">
        <a href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
          <div className="brand-logo-icon">
            <Layers size={20} strokeWidth={2.4} />
          </div>
          <div className="brand-title-wrap">
            <strong style={{ fontSize: "1.15rem" }}>Dokumenku AI</strong>
          </div>
        </a>

        <nav className="landing-nav-links" aria-label="Menu navigasi">
          <a href="#dokumen">4 Dokumen</a>
          <a href="#cara-kerja">Cara Kerja</a>
          <a href="#harga">Harga</a>
          <a href="#faq">FAQ</a>
        </nav>

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
        </div>
      </header>

      {/* ── 2. Hero 2-Column Section ─────────────────────────────── */}
      <section className="landing-hero-grid" aria-labelledby="hero-main-title">
        {/* Left Hero Column */}
        <div className="landing-hero-left">
          <h1 id="hero-main-title">
            Ubah ide produk menjadi<br />
            Panduan Desain siap bangun.
          </h1>

          <p className="hero-desc">
            Jawab brief proyek Anda satu kali. AI menyusun PRD, Arsitektur Tech Stack,
            Panduan Desain UI/UX, dan Schema Database secara real-time streaming.
          </p>

          <div className="landing-hero-actions">
            <button
              type="button"
              className="btn-primary"
              style={{ minHeight: "48px", padding: "0 24px", fontSize: "0.95rem" }}
              onClick={() => handleStartAction()}
            >
              Mulai Susun Dokumen Sekarang
            </button>
            <a
              href="#harga"
              className="btn-secondary"
              style={{ minHeight: "48px", padding: "0 20px", fontSize: "0.92rem", color: "var(--cobalt)" }}
            >
              Lihat Paket & Harga
            </a>
          </div>

          <div className="trust-points-row">
            <span className="trust-check">
              <Check size={16} strokeWidth={3} /> 1 Kredit Gratis Saat Daftar
            </span>
            <span style={{ color: "var(--text-faint)" }}>•</span>
            <span>Tanpa Langganan</span>
            <span style={{ color: "var(--text-faint)" }}>•</span>
            <span>Pakai Selamanya</span>
          </div>

          {stats && (
            <div style={{ display: "flex", gap: "24px", marginTop: "16px", flexWrap: "wrap" }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cobalt)" }}>{stats.totalCredits.toLocaleString("id-ID")}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Kredit Beredar</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cobalt)" }}>{stats.completedDocuments.toLocaleString("id-ID")}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Dokumen Selesai</div>
              </div>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--cobalt)" }}>{stats.totalUsers.toLocaleString("id-ID")}</div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total User</div>
              </div>
            </div>
          )}
        </div>

        {/* Right Hero Column: Interactive Studio Preview Mockup */}
        <div className="hero-studio-mockup" aria-label="Preview Studio Generator">
          <div className="mockup-header-row">
            <div className="mockup-header-left">
              <strong>Studio Generator</strong>
              <span>Menyusun 4 dokumen Anda...</span>
            </div>
            <div className="mockup-provider-badge">
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)", fontWeight: 600 }}>Provider AI</span>
              <span>Claude fable ▾</span>
            </div>
          </div>

          <div className="mockup-2x2-grid">
            {/* PRD.md Mock */}
            <div className="mockup-doc-card">
              <div className="mockup-doc-top">
                <span>📄 PRD.md</span>
                <span className="mockup-stream-tag">
                  <span className="status-dot" /> Streaming...
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>
                72%
              </div>
              <div className="mockup-progress-bar">
                <div className="mockup-progress-fill" style={{ width: "72%" }} />
              </div>
              <div className="mockup-code-preview">
                <strong>## 1. Ringkasan Produk</strong><br />
                Platform manajemen proyek untuk...<br />
                <strong>## 2. Masalah</strong><br />
                Tim kesulitan dalam...
              </div>
            </div>

            {/* TECH-STACK.md Mock */}
            <div className="mockup-doc-card">
              <div className="mockup-doc-top">
                <span>📄 TECH-STACK.md</span>
                <span className="mockup-stream-tag">
                  <span className="status-dot" /> Streaming...
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>
                65%
              </div>
              <div className="mockup-progress-bar">
                <div className="mockup-progress-fill" style={{ width: "65%" }} />
              </div>
              <div className="mockup-code-preview">
                <strong>## Frontend</strong><br />
                - Next.js 14 (App Router)<br />
                - TypeScript & Tailwind CSS<br />
                <strong>## Backend</strong><br />
                - Node.js (RESTful API)
              </div>
            </div>

            {/* UI-UX.md Mock */}
            <div className="mockup-doc-card">
              <div className="mockup-doc-top">
                <span>📄 UI-UX.md</span>
                <span className="mockup-stream-tag">
                  <span className="status-dot" /> Streaming...
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>
                58%
              </div>
              <div className="mockup-progress-bar">
                <div className="mockup-progress-fill" style={{ width: "58%" }} />
              </div>
              <div className="mockup-code-preview" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 700 }}>## User Flow</span>
                <div className="mockup-flow-boxes">
                  <span className="mockup-flow-box">Login</span>
                  <span style={{ fontSize: "0.68rem" }}>→</span>
                  <span className="mockup-flow-box">Dashboard</span>
                  <span style={{ fontSize: "0.68rem" }}>→</span>
                  <span className="mockup-flow-box">Buat Proyek</span>
                </div>
              </div>
            </div>

            {/* SCHEMA.md Mock */}
            <div className="mockup-doc-card">
              <div className="mockup-doc-top">
                <span>📄 SCHEMA.md</span>
                <span className="mockup-stream-tag">
                  <span className="status-dot" /> Streaming...
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "flex-end", fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)" }}>
                61%
              </div>
              <div className="mockup-progress-bar">
                <div className="mockup-progress-fill" style={{ width: "61%" }} />
              </div>
              <div className="mockup-code-preview" style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}>
                <span style={{ fontSize: "0.68rem", fontWeight: 700 }}>## ERD Overview</span>
                <div className="mockup-flow-boxes">
                  <span className="mockup-flow-box" style={{ background: "#E8F8F3", color: "#0A8F68" }}>users</span>
                  <span style={{ fontSize: "0.68rem" }}>→</span>
                  <span className="mockup-flow-box" style={{ background: "#E8F8F3", color: "#0A8F68" }}>projects</span>
                  <span style={{ fontSize: "0.68rem" }}>→</span>
                  <span className="mockup-flow-box" style={{ background: "#E8F8F3", color: "#0A8F68" }}>tasks</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mockup-footer-row">
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Clock size={15} color="var(--text-muted)" />
              <span>Waktu berjalan: 01:24</span>
            </div>
            <button
              type="button"
              className="btn-secondary"
              style={{ minHeight: "32px", padding: "0 12px", fontSize: "0.74rem", color: "var(--cobalt)", borderColor: "var(--border)" }}
              onClick={() => onStart()}
            >
              <Download size={13} /> Ekspor ZIP & MD
            </button>
          </div>
        </div>
      </section>

      {/* ── 3. Four Stats Bar ───────────────────────────────────── */}
      <section className="stats-bar-grid" aria-label="Statistik Layanan">
        <div className="stat-item-card">
          <div className="stat-item-icon">
            <Clock size={20} />
          </div>
          <div>
            <strong>~2 Menit</strong>
            <span>Per set 4 dokumen</span>
          </div>
        </div>

        <div className="stat-item-card">
          <div className="stat-item-icon green">
            <FileText size={20} />
          </div>
          <div>
            <strong>4 Dokumen</strong>
            <span>Output standar industri</span>
          </div>
        </div>

        <div className="stat-item-card">
          <div className="stat-item-icon">
            <Radio size={20} />
          </div>
          <div>
            <strong>Live Stream</strong>
            <span>Streaming Markdown real-time</span>
          </div>
        </div>

        <div className="stat-item-card">
          <div className="stat-item-icon">
            <FolderArchive size={20} />
          </div>
          <div>
            <strong>Format ZIP & MD</strong>
            <span>Siap masuk ke codebase</span>
          </div>
        </div>
      </section>

      {/* ── 4. Empat Pilar Blueprint Section ─────────────────────── */}
      <section id="dokumen" className="section-shell">
        <div className="section-title-wrap">
          <div className="eyebrow-badge center">
            EMPAT PILAR BLUEPRINT
          </div>
          <h2>Arsitektur Rekayasa Lengkap</h2>
          <p>
            Semua yang dibutuhkan developer, designer, dan product manager untuk mengeksekusi ide tanpa salah paham.
          </p>
        </div>

        <div className="four-pillars-grid">
          {DOCUMENTS.map((doc) => {
            const Icon = doc.icon;
            return (
              <article key={doc.file} className="pillar-card">
                <div className="pillar-top-row">
                  <span className={`pillar-num ${doc.color}`}>{doc.code}</span>
                  <div className={`pillar-icon-box ${doc.color}`}>
                    <Icon size={24} />
                  </div>
                </div>

                <h3>{doc.file}</h3>
                <strong className="pillar-sub">{doc.title}</strong>

                <div className="pillar-pills-row">
                  {doc.pills.map((pill) => (
                    <span key={pill} className={`pillar-pill ${doc.color}`}>
                      {pill}
                    </span>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── 5. Alur Kerja 4 Langkah Section ─────────────────────── */}
      <section id="cara-kerja" className="section-shell" style={{ backgroundColor: "#F0F4FA", borderRadius: "24px" }}>
        <div className="section-title-wrap">
          <div className="eyebrow-badge center">
            ALUR KERJA
          </div>
          <h2>Dari Ide Menjadi Blueprint dalam 4 Langkah</h2>
          <p>
            Proses otomatis yang intuitif untuk menghasilkan dokumentasi teknis berstandar enterprise.
          </p>
        </div>

        <div className="workflow-row-grid">
          {WORKFLOW_STEPS.map((step) => {
            const Icon = step.icon;
            return (
              <article key={step.num} className="workflow-step-card">
                <div className="workflow-top-badge">
                  <span className={`workflow-step-num ${step.color}`}>{step.num}</span>
                  <div className={`workflow-icon-circle ${step.color}`}>
                    <Icon size={18} />
                  </div>
                </div>
                <h3>{step.title}</h3>
                <p>{step.desc}</p>
              </article>
            );
          })}
        </div>
      </section>

      {/* ── 6. Pilihan Paket Section ────────────────────────────── */}
      <section id="harga" className="section-shell">
        <div className="section-title-wrap">
          <div className="eyebrow-badge center">
            PILIHAN PAKET
          </div>
          <h2>Investasi Sederhana Tanpa Langganan</h2>
          <p>
            Gunakan kredit saat butuh. Setiap kredit membuka 4 dokumen teknis sekaligus tanpa masa kedaluwarsa.
          </p>
        </div>

        <div className="landing-pricing-grid">
          {PLANS.map((plan) => (
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
                className={plan.popular ? "btn-primary" : "btn-secondary"}
                style={{ width: "100%", minHeight: "44px" }}
                onClick={() => {
                  if (plan.name === "Pro Studio") {
                    window.location.assign("/pricing");
                  } else if (plan.name === "Enterprise") {
                    window.location.assign("https://wa.me/6285754494990?text=Halo%20Dokumenku%20AI%2C%20saya%20tertarik%20dengan%20paket%20Enterprise.");
                  }
                }}
              >
                {plan.cta}
              </button>
            </article>
          ))}
        </div>
      </section>

      {/* ── 7. FAQ Accordion Section ───────────────────────────── */}
      <section id="faq" className="section-shell">
        <div className="section-title-wrap">
          <div className="eyebrow-badge center">
            PERTANYAAN UMUM
          </div>
          <h2>Pertanyaan yang Sering Diajukan</h2>
          <p>Jawaban lengkap seputar cara kerja, format dokumen, dan sistem kredit Dokumenku AI.</p>
        </div>

        <div className="faq-accordion-container">
          {FAQS.map((item, index) => {
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

        {/* ── 8. Final Dark Navy CTA Banner ───────────────────────── */}
        <div className="landing-cta-dark">
          <h2>Siap Menyusun Blueprint Proyek Anda?</h2>
          <p>
            Hemat waktu, bangun lebih cepat dengan blueprint teknis yang lengkap, jelas, dan siap dieksekusi.
          </p>
          <button
            type="button"
            className="btn-primary"
            style={{ minHeight: "48px", padding: "0 28px", fontSize: "0.95rem" }}
            onClick={() => handleStartAction()}
          >
            Buka Studio Generator Sekarang
          </button>
        </div>
      </section>

      {/* ── 9. Modern Footer ────────────────────────────────────── */}
      <footer className="landing-footer-shell">
        <div className="footer-inner-wrap">
          <div className="footer-top-row">
            <a href="/" style={{ display: "flex", alignItems: "center", gap: "10px", textDecoration: "none" }}>
              <div className="brand-logo-icon sm">
                <Layers size={17} strokeWidth={2.4} />
              </div>
              <div className="brand-title-wrap">
                <strong style={{ fontSize: "1.05rem" }}>Dokumenku AI</strong>
              </div>
            </a>

            <div className="footer-links-list">
              <a href="#dokumen">4 Dokumen</a>
              <a href="#cara-kerja">Cara Kerja</a>
              <a href="#harga">Harga</a>
              <a href="#faq">FAQ</a>
            </div>
          </div>

          <div className="footer-bottom-row">
            <span>&copy; {new Date().getFullYear()} Dokumenku AI. Hak cipta dilindungi.</span>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <span className="status-dot" />
              <span>Sistem AI Operasional (99.9% Uptime)</span>
            </div>
          </div>
        </div>
      </footer>
    </main>
  );
}
