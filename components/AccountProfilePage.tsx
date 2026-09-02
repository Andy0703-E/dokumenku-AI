"use client";

import { useEffect, useState } from "react";
import {
  Layers,
  User,
  Coins,
  FileText,
  Clock,
  Shield,
  LogOut,
  ArrowRight,
  Plus,
  Loader2,
  Calendar,
  CheckCircle2,
  Tag,
  CheckCircle,
} from "lucide-react";
import { toast } from "sonner";

type GenerationItem = {
  id: string;
  model: string;
  prompt: string | null;
  status: string;
  createdAt: string;
  completedAt: string | null;
};

type TransactionItem = {
  id: number;
  amount: number;
  reason: string;
  createdAt: string;
};

type AccountData = {
  authenticated: boolean;
  email?: string;
  role?: string;
  credits?: number;
  createdAt?: string;
  isPro?: boolean;
  generations?: GenerationItem[];
  transactions?: TransactionItem[];
};

export default function AccountProfilePage() {
  const [data, setData] = useState<AccountData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"projects" | "transactions">("projects");
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function loadAccountData(showLoading = false) {
    if (showLoading) setIsLoading(true);
    try {
      const res = await fetch("/api/account", { cache: "no-store" });
      const payload = (await res.json()) as AccountData;
      setData(payload);
    } catch {
      setData(null);
    } finally {
      if (showLoading) setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadAccountData(true);

    const refreshAccount = () => void loadAccountData();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshAccount();
    };
    const refreshTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") refreshAccount();
    }, 10_000);

    window.addEventListener("focus", refreshAccount);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.clearInterval(refreshTimer);
      window.removeEventListener("focus", refreshAccount);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
      toast.success("Sesi Anda telah berhasil keluar.");
      window.location.assign("/login");
    } catch {
      toast.error("Gagal keluar dari sesi.");
    } finally {
      setIsLoggingOut(false);
    }
  }

  if (isLoading) {
    return (
      <main className="admin-shell" style={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "12px" }}>
          <Loader2 className="animate-spin" size={32} color="var(--cobalt)" />
          <span style={{ fontSize: "0.88rem", color: "var(--text-muted)", fontWeight: 600 }}>
            Memuat profil akun Anda...
          </span>
        </div>
      </main>
    );
  }

  // If not logged in: Prompt to Login
  if (!data?.authenticated) {
    return (
      <main className="studio-viewport-shell" style={{ minHeight: "100vh", background: "var(--bg-app)" }}>
        <header className="studio-top-navbar" aria-label="Navigasi Akun">
          <div className="studio-nav-brand-group">
            <a href="/" className="studio-brand-link">
              <div className="brand-logo-icon sm">
                <Layers size={18} strokeWidth={2.4} />
              </div>
              <div className="brand-title-wrap">
                <span className="studio-brand-badge">PROFIL PENGGUNA</span>
                <strong className="studio-brand-name">Dokumenku AI</strong>
              </div>
            </a>
          </div>

          <div className="studio-navbar-actions">
            <div className="studio-quick-links">
              <a href="/login" className="studio-action-link">
                <User size={14} /> <span>Masuk</span>
              </a>
              <a href="/studio" className="btn-primary" style={{ minHeight: "34px", padding: "0 14px", fontSize: "0.82rem" }}>
                 <FileText size={13} /> Buka Studio
              </a>
            </div>
          </div>
        </header>

        <div style={{ maxWidth: "560px", margin: "64px auto", padding: "0 20px", textAlign: "center" }}>
          <div className="admin-card-surface" style={{ padding: "44px 32px", border: "1.5px solid var(--border-light)", boxShadow: "0 8px 24px rgba(15, 23, 42, 0.05)" }}>
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "50%",
                background: "var(--cobalt-light)",
                color: "var(--cobalt)",
                display: "grid",
                placeItems: "center",
                margin: "0 auto 18px",
              }}
            >
              <User size={30} />
            </div>
            <h1 style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--navy)", margin: "0 0 8px" }}>
              Masuk untuk Melihat Profil
            </h1>
            <p style={{ fontSize: "0.88rem", color: "var(--text-muted)", margin: "0 0 24px", lineHeight: "1.55" }}>
              Masuk ke akun Anda untuk melihat riwayat blueprint 4 dokumen proyek yang telah dibuat, saldo kredit, dan audit transaksi.
            </p>
            <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap" }}>
              <a href="/login" className="btn-primary" style={{ minHeight: "42px", padding: "0 22px", fontSize: "0.88rem" }}>
                Masuk ke Akun Anda
              </a>
              <a href="/studio" className="btn-secondary" style={{ minHeight: "42px", padding: "0 18px", fontSize: "0.88rem" }}>
                Buka Studio
              </a>
            </div>
          </div>
        </div>
      </main>
    );
  }

  const emailInitial = (data.email || "U").slice(0, 1).toUpperCase();
  const joinedDate = data.createdAt
    ? new Date(data.createdAt).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
      })
    : "Pengguna Baru";

  const totalGenerations = data.generations?.length ?? 0;

  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", background: "var(--bg-main)", overflowY: "auto" }}>
      {/* ── Top Navbar ─────────────────────────────────────────── */}
      <header className="studio-top-navbar" aria-label="Navigasi Akun">
        <div className="studio-nav-brand-group">
          <a href="/" className="studio-brand-link">
            <div className="brand-logo-icon sm">
              <Layers size={18} strokeWidth={2.4} />
            </div>
            <div className="brand-title-wrap">
              <span className="studio-brand-badge">PROFIL PENGGUNA</span>
              <strong className="studio-brand-name">Dokumenku AI</strong>
            </div>
          </a>

          <div className="status-pill">
            <span className="status-dot" />
            <span className="status-pill-text">Akun Aktif</span>
          </div>
        </div>

        <div className="studio-navbar-actions">
          <div className="studio-quick-links">
            <a href="/studio" className="studio-action-link" title="Buka Studio Generator">
               <FileText size={14} /> <span>Studio</span>
            </a>

            <a href="/pricing" className="studio-action-link" title="Paket & Harga">
              <Tag size={14} /> <span>Harga</span>
            </a>

            {data.role === "admin" && (
              <a href="/admin" className="studio-action-link" title="Admin Control Panel">
                <Shield size={14} /> <span>Admin</span>
              </a>
            )}

            <button
              type="button"
              className="studio-action-link"
              onClick={handleLogout}
              disabled={isLoggingOut}
              style={{
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "#DC2626",
              }}
              title="Keluar dari akun"
            >
              <LogOut size={14} /> <span>Keluar</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Body Container ─────────────────────────────────────── */}
      <div className="admin-body-container" style={{ maxWidth: "1100px", margin: "32px auto", padding: "0 20px 60px" }}>
        {/* Profile Hero Header Card */}
        <section
          className="admin-card-surface"
          style={{
            padding: "28px 32px",
            background: "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)",
            border: "1.5px solid #E2E8F0",
            boxShadow: "0 4px 14px rgba(15, 23, 42, 0.04)",
            marginBottom: "24px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "20px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "18px" }}>
              <div
                style={{
                  width: "64px",
                  height: "64px",
                  borderRadius: "18px",
                  background: "linear-gradient(135deg, var(--cobalt) 0%, #1D4ED8 100%)",
                  color: "#FFFFFF",
                  display: "grid",
                  placeItems: "center",
                  fontSize: "1.5rem",
                  fontWeight: 800,
                  boxShadow: "0 8px 16px rgba(37, 99, 235, 0.25)",
                }}
              >
                {emailInitial}
              </div>

              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap", marginBottom: "4px" }}>
                  <h1 style={{ margin: 0, fontSize: "1.45rem", fontWeight: 800, color: "var(--navy)" }}>
                    {data.email}
                  </h1>
                  {data.role === "admin" ? (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 750,
                        padding: "2px 8px",
                        borderRadius: "8px",
                        background: "#FEF3C7",
                        color: "#92400E",
                        border: "1px solid #FCD34D",
                      }}
                    >
                      👑 Administrator
                    </span>
                  ) : data.isPro ? (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 750,
                        padding: "2px 8px",
                        borderRadius: "8px",
                        background: "#EEF2FF",
                        color: "var(--cobalt)",
                        border: "1px solid #C7D2FE",
                      }}
                    >
                      ⭐ Pro Studio
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 750,
                        padding: "2px 8px",
                        borderRadius: "8px",
                        background: "#F0FDF4",
                        color: "#166534",
                        border: "1px solid #BBF7D0",
                      }}
                    >
                      🌱 Akun Gratis
                    </span>
                  )}
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  <Calendar size={14} />
                  <span>Bergabung sejak {joinedDate}</span>
                </div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <a
                href="/pricing"
                className="btn-primary"
                style={{ minHeight: "40px", padding: "0 18px", fontSize: "0.86rem" }}
              >
                <Plus size={15} /> Beli Kredit Tambahan
              </a>
            </div>
          </div>
        </section>

        {/* 3 Metric Cards */}
        <section className="admin-kpi-3col-grid" style={{ marginBottom: "28px" }}>
          {/* Saldo Kredit */}
          <article className="admin-kpi-box green">
            <div className="admin-kpi-icon-wrap green">
              <Coins size={24} />
            </div>
            <div>
              <span className="kpi-label">Saldo Kredit Aktif</span>
              <strong>{data.credits?.toLocaleString("id-ID") ?? 0} Kredit</strong>
              <span className="kpi-sub">• 1 Kredit = 4 Dokumen Lengkap</span>
            </div>
          </article>

          {/* Total Proyek Blueprint */}
          <article className="admin-kpi-box">
            <div className="admin-kpi-icon-wrap">
              <FileText size={24} />
            </div>
            <div>
              <span className="kpi-label">Paket Blueprint Dibuat</span>
              <strong>{totalGenerations.toLocaleString("id-ID")} Proyek</strong>
              <span className="kpi-sub">• {totalGenerations * 4} File Dokumen</span>
            </div>
          </article>

          {/* Model AI Access */}
          <article className="admin-kpi-box purple">
            <div className="admin-kpi-icon-wrap purple">
               <CheckCircle size={24} />
            </div>
            <div>
              <span className="kpi-label">Akses Engine Model AI</span>
              <strong style={{ fontSize: "1.25rem", color: "#6D28D9" }}>
                {data.isPro || data.role === "admin" ? "Semua Model (Pro)" : "Model Starter"}
              </strong>
              <span className="kpi-sub" style={{ color: "var(--cobalt)" }}>
                • {data.isPro || data.role === "admin" ? "Flagship + Starter Aktif" : "DeepSeek, GLM, Hy3, Auto"}
              </span>
            </div>
          </article>
        </section>

        {/* Tabs: Riwayat Dokumen vs Riwayat Transaksi */}
        <div style={{ display: "flex", gap: "8px", borderBottom: "1.5px solid var(--border-light)", marginBottom: "20px" }}>
          <button
            type="button"
            onClick={() => setActiveTab("projects")}
            style={{
              padding: "10px 18px",
              border: 0,
              background: "transparent",
              borderBottom: activeTab === "projects" ? "3px solid var(--cobalt)" : "3px solid transparent",
              color: activeTab === "projects" ? "var(--cobalt)" : "var(--text-muted)",
              fontWeight: 750,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <FileText size={16} />
            Riwayat Proyek Blueprint ({data.generations?.length ?? 0})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("transactions")}
            style={{
              padding: "10px 18px",
              border: 0,
              background: "transparent",
              borderBottom: activeTab === "transactions" ? "3px solid var(--cobalt)" : "3px solid transparent",
              color: activeTab === "transactions" ? "var(--cobalt)" : "var(--text-muted)",
              fontWeight: 750,
              fontSize: "0.9rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <Clock size={16} />
            Audit Transaksi Kredit ({data.transactions?.length ?? 0})
          </button>
        </div>

        {/* Tab 1: Riwayat Proyek */}
        {activeTab === "projects" && (
          <section className="admin-card-surface" style={{ padding: "20px 24px" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <h2 style={{ margin: "0 0 2px", fontSize: "1.1rem", fontWeight: 800, color: "var(--navy)" }}>
                  Daftar Blueprint Proyek Anda
                </h2>
                <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                  Setiap proyek mencakup 4 file: PRD.md, TECH-STACK.md, UI-UX.md, dan SCHEMA.md.
                </span>
              </div>
            </div>

            {data.generations && data.generations.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                {data.generations.map((gen) => {
                  const dateStr = new Date(gen.createdAt).toLocaleString("id-ID", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  return (
                    <div
                      key={gen.id}
                      style={{
                        padding: "14px 18px",
                        borderRadius: "12px",
                        border: "1px solid var(--border)",
                        background: "#FAFCFE",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "14px",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: "260px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                          <span
                            style={{
                              fontSize: "0.72rem",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "6px",
                              background: "#ECFDF5",
                              color: "#065F46",
                              border: "1px solid #A7F3D0",
                            }}
                          >
                            <CheckCircle2 size={11} style={{ display: "inline", marginRight: "3px" }} />
                            4 Dokumen Selesai
                          </span>
                          <span style={{ fontSize: "0.74rem", fontWeight: 650, color: "var(--cobalt)" }}>
                            Engine: {gen.model}
                          </span>
                          <span style={{ fontSize: "0.72rem", color: "var(--text-faint)" }}>
                            • {dateStr}
                          </span>
                        </div>

                        <p
                          style={{
                            margin: 0,
                            fontSize: "0.84rem",
                            color: "var(--navy)",
                            fontWeight: 600,
                            lineHeight: "1.45",
                          }}
                        >
                          {gen.prompt || "Paket Blueprint Rekayasa Perangkat Lunak 4 Dokumen"}
                        </p>
                      </div>

                      <div>
                        <a
                          href="/studio"
                          className="btn-primary"
                          style={{ minHeight: "34px", padding: "0 14px", fontSize: "0.78rem" }}
                        >
                          Buka di Studio <ArrowRight size={13} />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ padding: "48px 20px", textAlign: "center" }}>
                <FileText size={40} color="var(--border)" style={{ margin: "0 auto 12px" }} />
                <strong style={{ fontSize: "1rem", color: "var(--navy)", display: "block", marginBottom: "4px" }}>
                  Belum Ada Proyek Dokumen
                </strong>
                <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", margin: "0 0 16px" }}>
                  Anda belum membuat blueprint proyek. Mulai susun 4 dokumen pertama Anda sekarang!
                </p>
                <a href="/studio" className="btn-primary" style={{ minHeight: "40px", padding: "0 20px", fontSize: "0.86rem" }}>
                  Mulai Susun 4 Dokumen
                </a>
              </div>
            )}
          </section>
        )}

        {/* Tab 2: Riwayat Transaksi Kredit */}
        {activeTab === "transactions" && (
          <section className="admin-card-surface" style={{ padding: "20px 24px" }}>
            <div style={{ marginBottom: "16px" }}>
              <h2 style={{ margin: "0 0 2px", fontSize: "1.1rem", fontWeight: 800, color: "var(--navy)" }}>
                Riwayat Transaksi Kredit Akun
              </h2>
              <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                Audit seluruh penambahan dan pemotongan kredit pada akun Anda.
              </span>
            </div>

            {data.transactions && data.transactions.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table className="admin-data-table" style={{ width: "100%" }}>
                  <thead>
                    <tr>
                      <th style={{ width: "20%" }}>Waktu</th>
                      <th style={{ width: "20%" }}>Jumlah</th>
                      <th style={{ width: "60%" }}>Keterangan Transaksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((tx) => {
                      const isPositive = tx.amount > 0;
                      const dateStr = new Date(tx.createdAt).toLocaleString("id-ID", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      });

                      return (
                        <tr key={tx.id}>
                          <td style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>{dateStr}</td>
                          <td>
                            <span
                              style={{
                                fontSize: "0.82rem",
                                fontWeight: 800,
                                padding: "2px 8px",
                                borderRadius: "6px",
                                background: isPositive ? "#ECFDF5" : "#FEF2F2",
                                color: isPositive ? "#047857" : "#B91C1C",
                              }}
                            >
                              {isPositive ? `+${tx.amount}` : tx.amount} Kredit
                            </span>
                          </td>
                          <td style={{ fontSize: "0.84rem", fontWeight: 600, color: "var(--navy)" }}>
                            {tx.reason}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)" }}>
                Belum ada catatan transaksi kredit.
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
