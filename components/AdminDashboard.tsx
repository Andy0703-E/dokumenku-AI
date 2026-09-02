"use client";

import { useEffect, useState, useMemo } from "react";
import {
  Layers,
  LogOut,
  Shield,
  ShieldAlert,
  User,
  Coins,
  FileText,
  Mail,
  MessageSquare,
  Search,
  Plus,
  Minus,
  Lock,
  Eye,
  EyeOff,
  Clock,
  LogIn,
  Loader2,
  Info,
  ChevronDown,
  Cpu,
  CheckCircle,
  Receipt,
  QrCode,
  Check,
  X,
  Smartphone,
  Send,
  RefreshCw,
  Copy,
  CheckCircle2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

type ProviderQuota = {
  provider: string;
  ok: boolean;
  quota?: {
    limit: number;
    usage: number;
    remaining: number;
    resetAt?: string;
    formattedRemaining?: string;
    planName?: string;
    activeUntil?: string;
    daysUntilExpiry?: number;
    isActive?: boolean;
    rateLimitRpm?: number;
    rateLimitRemaining?: number;
  };
  error?: string;
};

type Overview = {
  summary: { users: number; credits: number; completedDocuments: number };
  providerInfo?: {
    status: string;
    providerName: string;
    providerUrl: string;
    apiKeyMasked: string;
    modelCount: number;
    balanceText: string;
    estimatedTokensUsed: number;
    estimatedCostUsd: string;
    avgTokensPerBlueprint: string;
    models: Array<{
      id: string;
      name: string;
      isFlagship: boolean;
      tier: string;
      healthStatus?: string;
      availabilityLabel?: string;
      statusSource?: "provider" | "admin";
      providerGrade?: string;
    }>;
  };
  providerQuota?: ProviderQuota[];
  users: Array<{ email: string; credits: number; updatedAt: string }>;
  transactions: Array<{
    id: number;
    userEmail: string;
    amount: number;
    reason: string;
    createdAt: string;
  }>;
  orders?: Array<{
    id: string;
    userEmail: string;
    planName: string;
    amount: number;
    credits: number;
    paymentMethod: string;
    status: string;
    hasProof?: boolean;
    aiStatus?: string;
    aiAnalysis?: string;
    ocrMerchant?: string;
    ocrNmid?: string;
    ocrAmount?: string;
    ocrTransactionId?: string;
    ocrDate?: string;
    ocrStatus?: string;
    createdAt: string;
    paidAt?: string;
  }>;
};

export default function AdminDashboard() {
  const [data, setData] = useState<Overview | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdminAuthenticated, setIsAdminAuthenticated] = useState<boolean | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Top up form
  const [email, setEmail] = useState("");
  const [creditAmount, setCreditAmount] = useState<number>(10);
  const [reason, setReason] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [processingOrderId, setProcessingOrderId] = useState<string | null>(null);
  const [deletingTarget, setDeletingTarget] = useState<string | null>(null);
  const [inspectProofImage, setInspectProofImage] = useState<{
    url: string;
    orderId: string;
    analysis?: string;
    userEmail?: string;
    status?: string;
    ocrMerchant?: string;
    ocrNmid?: string;
    ocrAmount?: string;
    ocrTransactionId?: string;
    ocrDate?: string;
  } | null>(null);

  const [searchUser, setSearchUser] = useState("");
  const [txFilter, setTxFilter] = useState("all");
  const [showModelsModal, setShowModelsModal] = useState(false);
  const [confirmApproveOrder, setConfirmApproveOrder] = useState<NonNullable<Overview["orders"]>[number] | null>(null);
  const [rejectOrderModal, setRejectOrderModal] = useState<{
    order: NonNullable<Overview["orders"]>[number];
    reasonCode: string;
    reasonNote: string;
  } | null>(null);

  // Admin Login State
  const [adminEmail, setAdminEmail] = useState("dadung2707@gmail.com");
  const [adminPassword, setAdminPassword] = useState("");
  const [showAdminPassword, setShowAdminPassword] = useState(false);
  const [isAdminLoggingIn, setIsAdminLoggingIn] = useState(false);

  // WhatsApp Bot Live Integration State
  const [showWaModal, setShowWaModal] = useState(false);
  const [waStatus, setWaStatus] = useState<{
    online: boolean;
    ready: boolean;
    authenticated: boolean;
    mode?: "gateway" | "local_bot";
    gatewayTokenConfigured?: boolean;
    adminPhone: string;
    webhookUrl?: string;
    qrCode: string | null;
    message?: string;
  } | null>(null);
  const [isTestingWa, setIsTestingWa] = useState(false);
  const [hasCopiedCommand, setHasCopiedCommand] = useState(false);

  async function checkWaStatus() {
    try {
      const res = await fetch("/api/admin/whatsapp");
      if (res.ok) {
        const payload = (await res.json()) as {
          online: boolean;
          ready: boolean;
          authenticated: boolean;
          mode?: "gateway" | "local_bot";
          gatewayTokenConfigured?: boolean;
          adminPhone: string;
          webhookUrl?: string;
          qrCode: string | null;
          message?: string;
        };
        setWaStatus(payload);
      }
    } catch {
      // ignore
    }
  }

  async function handleTestWa() {
    setIsTestingWa(true);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "test-ping" }),
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Gagal mengirim notifikasi tes.");
      }
      toast.success(payload.message || "Notifikasi tes berhasil dikirim ke WhatsApp Anda.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal tes notifikasi.");
    } finally {
      setIsTestingWa(false);
    }
  }

  const [isDisconnectingWa, setIsDisconnectingWa] = useState(false);

  // ── Pagination State ────────────────────────────────────────────
  const PAGE_SIZE = 10;
  const [usersPage, setUsersPage] = useState(1);
  const [ordersPage, setOrdersPage] = useState(1);
  const [auditPage, setAuditPage] = useState(1);

  async function handleDisconnectWa() {
    if (!window.confirm("Yakin ingin memutus sesi bot WhatsApp ini? Anda harus scan QR code ulang setelah ini.")) {
      return;
    }
    setIsDisconnectingWa(true);
    try {
      const res = await fetch("/api/admin/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "logout" }),
      });
      const payload = (await res.json()) as { ok?: boolean; message?: string; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Gagal memutus sesi WhatsApp.");
      }
      toast.success(payload.message || "Sesi berhasil diputus.");
      await checkWaStatus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal memutus sesi.");
    } finally {
      setIsDisconnectingWa(false);
    }
  }

  async function handleAdminLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!adminPassword) {
      toast.error("Kata sandi admin wajib diisi.");
      return;
    }
    setIsAdminLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: adminEmail.trim().toLowerCase(),
          password: adminPassword,
        }),
      });
      const payload = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Kata sandi admin salah.");
      }
      toast.success("Berhasil masuk ke Panel Admin.");
      setAdminPassword("");
      setIsAdminAuthenticated(true);
      await loadOverview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Gagal masuk admin.");
    } finally {
      setIsAdminLoggingIn(false);
    }
  }

  async function handleOrderAction(
    orderId: string,
    action: "approve" | "cancel",
    reasonCode?: string,
    reasonNote?: string
  ) {
    setProcessingOrderId(orderId);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action, reasonCode, reasonNote }),
      });
      const payload = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
        data?: { message?: string };
      };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Gagal memproses pesanan.");
      }
      toast.success(payload.message || payload.data?.message || "Aksi berhasil diproses.");
      await loadOverview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Terjadi kesalahan.");
    } finally {
      setProcessingOrderId(null);
    }
  }

  async function handleDeleteUser(userEmail: string) {
    const confirmed = window.confirm(
      `Hapus pengguna ${userEmail}? Seluruh data akun, dokumen, invoice, dan saldo pengguna akan dihapus. Tindakan ini tidak dapat dibatalkan.`,
    );
    if (!confirmed) return;

    setDeletingTarget(`user:${userEmail}`);
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userEmail)}`, { method: "DELETE" });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; data?: { message?: string } };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Gagal menghapus pengguna.");
      }
      toast.success(payload.message || payload.data?.message || "Pengguna berhasil dihapus.");
      await loadOverview();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus pengguna.");
    } finally {
      setDeletingTarget(null);
    }
  }

  async function handleDeleteOrder(orderId: string) {
    const confirmed = window.confirm(
      `Hapus invoice ${orderId}? Invoice yang sudah membagikan kredit tidak dapat dihapus agar saldo pengguna tetap aman.`,
    );
    if (!confirmed) return;

    setDeletingTarget(`order:${orderId}`);
    try {
      const res = await fetch("/api/admin/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId, action: "delete" }),
      });
      const payload = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; message?: string; data?: { message?: string } };
      if (!res.ok || !payload.ok) {
        throw new Error(payload.error || "Gagal menghapus invoice.");
      }
      toast.success(payload.message || payload.data?.message || "Invoice berhasil dihapus.");
      await loadOverview();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menghapus invoice.");
    } finally {
      setDeletingTarget(null);
    }
  }

  async function loadOverview() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/admin/overview", { cache: "no-store" });
      const payload = (await response.json().catch(() => ({}))) as Overview & { error?: string };
      if (response.status === 401 || response.status === 403) {
        setData(null);
        setIsAdminAuthenticated(false);
        setOverviewError(null);
      } else if (!response.ok) {
        // A data/provider problem must not be rendered as an admin logout.
        setOverviewError(payload.error || "Data dashboard belum dapat dimuat. Coba muat ulang beberapa saat lagi.");
      } else {
        setData(payload);
        setIsAdminAuthenticated(true);
        setOverviewError(null);
      }
    } catch {
      setOverviewError("Koneksi ke dashboard admin sedang terganggu. Sesi Anda tetap tersimpan.");
    } finally {
      setIsLoading(false);
    }
  }

  async function initializeAdmin() {
    setIsLoading(true);
    try {
      const response = await fetch("/api/session", { cache: "no-store" });
      const session = (await response.json().catch(() => ({}))) as { authenticated?: boolean; role?: string };
      const isAdmin = response.ok && session.authenticated === true && session.role === "admin";
      setIsAdminAuthenticated(isAdmin);

      if (isAdmin) {
        await loadOverview();
      } else {
        setData(null);
        setIsLoading(false);
      }
    } catch {
      setIsAdminAuthenticated(false);
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void initializeAdmin();
  }, []);

  async function handleAdminLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setData(null);
    setOverviewError(null);
    setIsAdminAuthenticated(false);
    toast.success("Sesi admin telah ditutup.");
  }

  async function handleTopUp(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!email.trim() || !emailRegex.test(email.trim())) {
      toast.error("Format email pengguna tidak valid.");
      return;
    }
    if (creditAmount < 1 || isNaN(creditAmount)) {
      toast.error("Jumlah kredit minimal 1.");
      return;
    }

    setIsSaving(true);
    try {
      const response = await fetch("/api/admin/credits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          amount: creditAmount,
          reason: reason.trim() || undefined,
        }),
      });

      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        throw new Error(payload.error || "Kredit gagal ditambahkan.");
      }

      toast.success(`Berhasil menambahkan ${creditAmount} kredit ke ${email}.`);
      setEmail("");
      setCreditAmount(10);
      setReason("");
      await loadOverview();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Gagal menambahkan kredit.");
    } finally {
      setIsSaving(false);
    }
  }

  // Filtered users
  const filteredUsers = useMemo(() => {
    if (!data?.users) return [];
    if (!searchUser.trim()) return data.users;
    return data.users.filter((u) =>
      u.email.toLowerCase().includes(searchUser.toLowerCase()),
    );
  }, [data?.users, searchUser]);

  const usersTotalPages = Math.max(1, Math.ceil(filteredUsers.length / PAGE_SIZE));
  const paginatedUsers = filteredUsers.slice((usersPage - 1) * PAGE_SIZE, usersPage * PAGE_SIZE);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    if (!data?.transactions) return [];
    if (txFilter === "add") return data.transactions.filter((t) => t.amount > 0);
    if (txFilter === "deduct") return data.transactions.filter((t) => t.amount < 0);
    return data.transactions;
  }, [data?.transactions, txFilter]);

  const ordersTotalPages = Math.max(1, Math.ceil((data?.orders?.length ?? 0) / PAGE_SIZE));
  const paginatedOrders = (data?.orders ?? []).slice((ordersPage - 1) * PAGE_SIZE, ordersPage * PAGE_SIZE);

  const txTotalPages = Math.max(1, Math.ceil(filteredTransactions.length / PAGE_SIZE));
  const paginatedTx = filteredTransactions.slice((auditPage - 1) * PAGE_SIZE, auditPage * PAGE_SIZE);

  return (
    <main className="admin-shell">
      {/* ── Top Header Bar ─────────────────────────────────────── */}
      <header className="admin-header-nav">
        <div className="admin-nav-brand-wrap">
          <a href="/" className="admin-brand-link">
            <div className="brand-logo-icon sm">
              <Layers size={18} strokeWidth={2.4} />
            </div>
            <strong>Dokumenku AI</strong>
          </a>
          <span className="admin-brand-sep">|</span>
          <span className="admin-brand-subtitle">
            ADMIN CONTROL PANEL
          </span>
        </div>

        <div className="admin-header-actions">
          {isAdminAuthenticated && (
            <>
              <a
                href="/studio"
                className="btn-secondary admin-btn-action"
                style={{ textDecoration: "none" }}
              >
                 <FileText size={14} /> <span>Studio</span>
              </a>
              <a
                href="/account"
                className="btn-secondary admin-btn-action"
                style={{ textDecoration: "none" }}
              >
                <User size={14} /> <span>Profil</span>
              </a>
              <button
                type="button"
                className="btn-secondary admin-btn-action danger"
                onClick={() => void handleAdminLogout()}
                title="Keluar dari admin"
              >
                <LogOut size={14} /> <span>Keluar</span>
              </button>
            </>
          )}
        </div>
      </header>

      {/* ── Conditional Render: Unauthenticated vs Dashboard ──── */}
      {isAdminAuthenticated ? (data ? (
        /* ══════════════════════════════════════════════════════════
           AUTHENTICATED DASHBOARD (admin-dashboard.png)
           ══════════════════════════════════════════════════════════ */
        <div className="admin-body-container">
          {/* Title Header with Shield Gear Icon */}
          <div className="admin-title-hero">
            <div className="admin-title-icon-box">
              <ShieldAlert size={24} />
            </div>
            <div className="admin-title-text-wrap">
              <span className="eyebrow-badge">ADMIN CONTROL PANEL</span>
              <h1>Manajemen Kredit & Pengguna</h1>
              <p>Kelola saldo kredit, pengguna, dan audit transaksi dalam satu tempat.</p>
            </div>
          </div>

          {/* 4 KPI Summary Cards */}
          <section className="admin-kpi-3col-grid" aria-label="Ringkasan Statistik Admin">
            {/* Total Pengguna */}
            <article className="admin-kpi-box">
              <div className="admin-kpi-icon-wrap">
                <User size={24} />
              </div>
              <div>
                <span className="kpi-label">Total Pengguna</span>
                <strong>{data.summary.users.toLocaleString("id-ID")}</strong>
                <span className="kpi-sub">• Akun Terdaftar</span>
              </div>
            </article>

            {/* Total Kredit Beredar */}
            <article className="admin-kpi-box green">
              <div className="admin-kpi-icon-wrap green">
                <Coins size={24} />
              </div>
              <div>
                <span className="kpi-label">Total Kredit Beredar</span>
                <strong>{data.summary.credits.toLocaleString("id-ID")}</strong>
                <span className="kpi-sub">• Saldo seluruh user</span>
              </div>
            </article>

            {/* Paket Dokumen Selesai */}
            <article className="admin-kpi-box amber">
              <div className="admin-kpi-icon-wrap amber">
                <FileText size={24} />
              </div>
              <div>
                <span className="kpi-label">Paket Dokumen Selesai</span>
                <strong>{data.summary.completedDocuments.toLocaleString("id-ID")}</strong>
                <span className="kpi-sub">• 4 Blueprint / Paket</span>
              </div>
            </article>

            {/* Total Token AI Terpakai */}
            <article className="admin-kpi-box purple">
              <div className="admin-kpi-icon-wrap purple">
                <Cpu size={24} />
              </div>
              <div>
                <span className="kpi-label">Total Token Blueprint AI</span>
                <strong style={{ fontSize: "1.45rem", color: "#6D28D9" }}>
                  {(data.providerInfo?.estimatedTokensUsed ?? 0).toLocaleString("id-ID")}
                </strong>
                <span className="kpi-sub" style={{ color: "var(--cobalt)" }}>
                  • Est. Biaya: {data.providerInfo?.estimatedCostUsd || "$0.000 USD"}
                </span>
              </div>
            </article>
          </section>

          {/* AI Provider & API Key Infrastructure Inspector Card */}
          <section
            className="admin-card-surface"
            style={{
              padding: "20px 24px",
              background: "linear-gradient(135deg, #FFFFFF 0%, #F8FAFC 100%)",
              border: "1.5px solid #E2E8F0",
              boxShadow: "0 4px 12px rgba(15, 23, 42, 0.04)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "14px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <div
                  style={{
                    width: "36px",
                    height: "36px",
                    borderRadius: "10px",
                    background: "#EEF2FF",
                    color: "var(--cobalt)",
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                   <CheckCircle size={20} />
                </div>
                <div>
                  <strong style={{ fontSize: "1.05rem", color: "var(--navy)", display: "block" }}>
                    Status AI Provider & Token API Key
                  </strong>
                  <span style={{ fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    Koneksi upstream AI Engine dan pemantauan beban token blueprint.
                  </span>
                </div>
              </div>

              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    background: "#ECFDF5",
                    border: "1px solid #A7F3D0",
                    color: "#065F46",
                    fontSize: "0.78rem",
                    fontWeight: 700,
                  }}
                >
                  <span style={{ width: "7px", height: "7px", borderRadius: "50%", background: "#10B981" }} />
                  {data.providerInfo?.status === "connected" ? "Terhubung & Siap" : "Tidak Aktif"}
                </span>

                {data.providerInfo?.models && data.providerInfo.models.length > 0 && (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ minHeight: "32px", padding: "0 12px", fontSize: "0.76rem" }}
                    onClick={() => setShowModelsModal(true)}
                  >
                    <Cpu size={13} />
                    Lihat {data.providerInfo.models.length} Model AI
                  </button>
                )}
              </div>
            </div>

            {/* Grid 4 Mini Stats Provider */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
                gap: "12px",
                background: "#FFFFFF",
                padding: "14px 16px",
                borderRadius: "12px",
                border: "1px solid var(--border-light)",
              }}
            >
              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                  API Key Aktif
                </span>
                <code style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--navy)", background: "#F1F5F9", padding: "2px 6px", borderRadius: "6px" }}>
                  {data.providerInfo?.apiKeyMasked || "Belum dikonfigurasi"}
                </code>
              </div>

              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                  Provider Upstream
                </span>
                <strong style={{ fontSize: "0.82rem", color: "var(--navy)" }}>
                  {data.providerInfo?.providerUrl || "Belum Dikonfigurasi"}
                </strong>
              </div>

              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                  Rata-rata Token / Paket Blueprint
                </span>
                <strong style={{ fontSize: "0.82rem", color: "var(--cobalt)" }}>
                  ~12.500 Token (4 Dokumen)
                </strong>
              </div>

              <div>
                <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginBottom: "2px" }}>
                  Status Kuota Saldo API
                </span>
                {data.providerQuota && data.providerQuota.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {data.providerQuota.map((q) => {
                      if (!q.ok) {
                        return (
                          <div key={q.provider} style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: "#9CA3AF", flexShrink: 0 }} />
                            <strong style={{ fontSize: "0.78rem", color: "#9CA3AF" }}>
                              {q.error || "N/A"}
                            </strong>
                          </div>
                        );
                      }
                      if (!q.quota) return null;
                      const pct = q.quota.limit > 0 ? Math.round((q.quota.usage / q.quota.limit) * 100) : 0;
                      const colour = pct >= 90 ? "#DC2626" : pct >= 70 ? "#D97706" : "#059669";
                      return (
                        <div key={q.provider} style={{ display: "flex", flexDirection: "column", gap: "3px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                            <span style={{ width: "6px", height: "6px", borderRadius: "50%", background: q.quota.isActive ? colour : "#9CA3AF", flexShrink: 0 }} />
                            <strong style={{ fontSize: "0.78rem", color: "var(--navy)" }}>
                              {q.quota.formattedRemaining || q.quota.remaining.toLocaleString("id-ID")} token tersisa
                            </strong>
                            {q.quota.limit > 0 && (
                              <span style={{ fontSize: "0.68rem", color: colour, fontWeight: 700 }}>
                                ({pct}% terpakai)
                              </span>
                            )}
                          </div>
                          <div style={{ display: "flex", gap: "8px", fontSize: "0.68rem", color: "var(--text-muted)", paddingLeft: "12px" }}>
                            {q.quota.planName && <span>Plan: <strong>{q.quota.planName}</strong></span>}
                            {q.quota.daysUntilExpiry != null && (
                              <span>
                                {q.quota.daysUntilExpiry > 0
                                  ? `Aktif ${q.quota.daysUntilExpiry} hari lagi`
                                  : "⚠️ Sudah kedaluwarsa"}
                              </span>
                            )}
                            {q.quota.rateLimitRpm != null && (
                              <span>RPM: {q.quota.rateLimitRemaining}/{q.quota.rateLimitRpm}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <strong style={{ fontSize: "0.82rem", color: "#059669" }}>
                    {data.providerInfo?.balanceText || "Aktif • Kuota Siap"}
                  </strong>
                )}
              </div>
            </div>
          </section>

          {/* Middle Row: Top Up Form (Left) & User Balances Table (Right) */}
          <div className="admin-middle-grid">
            {/* Left Form: Tambah Kredit Pengguna */}
            <section className="admin-card-surface" aria-labelledby="topup-heading">
              <div className="admin-card-header">
                <h2 id="topup-heading" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--navy)" }}>
                  Tambah Kredit Pengguna
                </h2>
              </div>
              <p className="admin-card-sub">
                Kredit akan langsung ditambahkan ke saldo akun pengguna.
              </p>

              <form onSubmit={handleTopUp} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 750, color: "var(--navy)", marginBottom: "6px" }}>
                    Email Pengguna
                  </label>
                  <div className="auth-input-field">
                    <Mail size={16} className="lead-icon" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@email.com"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 750, color: "var(--navy)", marginBottom: "6px" }}>
                    Jumlah Kredit
                  </label>
                  <div className="stepper-input-row">
                    <div style={{ padding: "0 10px", color: "var(--text-muted)", display: "flex", alignItems: "center" }}>
                      <Coins size={16} />
                    </div>
                    <input
                      type="number"
                      min={1}
                      max={10000}
                      value={creditAmount}
                      onChange={(e) => setCreditAmount(Math.max(1, Number(e.target.value) || 1))}
                      placeholder="Contoh: 10"
                      required
                    />
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setCreditAmount((prev) => Math.max(1, prev - 1))}
                      aria-label="Kurangi 1 kredit"
                    >
                      <Minus size={14} />
                    </button>
                    <button
                      type="button"
                      className="stepper-btn"
                      onClick={() => setCreditAmount((prev) => prev + 1)}
                      aria-label="Tambah 1 kredit"
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: "0.78rem", fontWeight: 750, color: "var(--navy)", marginBottom: "6px" }}>
                    Catatan / Keterangan Transaksi
                  </label>
                  <div style={{ position: "relative" }}>
                    <MessageSquare size={16} style={{ position: "absolute", left: "12px", top: "12px", color: "var(--text-muted)" }} />
                    <textarea
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Contoh: Pembelian paket Pro Studio"
                      rows={2}
                      style={{
                        width: "100%",
                        padding: "10px 14px 10px 38px",
                        borderRadius: "10px",
                        border: "1px solid var(--border)",
                        fontSize: "0.85rem",
                        resize: "none",
                        color: "var(--navy)",
                      }}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  className="btn-primary"
                  style={{ width: "100%", minHeight: "44px", marginTop: "4px" }}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Menyimpan...
                    </>
                  ) : (
                    <>
                      <Plus size={16} strokeWidth={3} /> Tambahkan Kredit Sekarang
                    </>
                  )}
                </button>

                <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "0.74rem", color: "var(--text-muted)", marginTop: "4px" }}>
                  <Info size={13} />
                  <span>Semua perubahan saldo akan tercatat dalam audit.</span>
                </div>
              </form>
            </section>

            {/* Right Table: Daftar Saldo Pengguna */}
            <section className="admin-card-surface" aria-labelledby="users-table-heading">
              <div className="admin-card-header">
                <div>
                  <h2 id="users-table-heading" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--navy)" }}>
                    Daftar Saldo Pengguna
                  </h2>
                  <span className="admin-card-sub" style={{ margin: 0 }}>
                    30 akun pengguna yang terakhir aktif diperbarui.
                  </span>
                </div>

                {/* Search Email Input */}
                <div style={{ position: "relative", width: "220px" }}>
                  <Search size={15} style={{ position: "absolute", left: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)" }} />
                  <input
                    type="text"
                    value={searchUser}
                    onChange={(e) => setSearchUser(e.target.value)}
                    placeholder="Cari email pengguna"
                    style={{
                      width: "100%",
                      height: "36px",
                      padding: "0 10px 0 32px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      fontSize: "0.8rem",
                      color: "var(--navy)",
                    }}
                  />
                </div>
              </div>

              <div style={{ overflowX: "auto", marginTop: "16px" }}>
                {paginatedUsers.length > 0 ? (
                  <>
                    <table className="admin-custom-table">
                      <thead>
                        <tr>
                          <th>Email Pengguna</th>
                          <th>Saldo Kredit</th>
                          <th>Terakhir Diperbarui</th>
                          <th style={{ textAlign: "right" }}>Aksi</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paginatedUsers.map((user) => (
                          <tr key={user.email}>
                            <td style={{ fontWeight: 600 }}>{user.email}</td>
                            <td>
                              <span
                                style={{
                                  display: "inline-flex",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  background: "var(--cobalt-light)",
                                  color: "var(--cobalt)",
                                  fontWeight: 750,
                                  fontSize: "0.78rem",
                                }}
                              >
                                {user.credits} kredit
                              </span>
                            </td>
                            <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                              {new Date(user.updatedAt).toLocaleDateString("id-ID", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td style={{ textAlign: "right" }}>
                              <button
                                type="button"
                                className="btn-secondary"
                                onClick={() => void handleDeleteUser(user.email)}
                                disabled={deletingTarget === `user:${user.email}`}
                                title={`Hapus pengguna ${user.email}`}
                                style={{ minHeight: "28px", padding: "0 9px", fontSize: "0.72rem", color: "#B91C1C", borderColor: "#FECACA" }}
                              >
                                {deletingTarget === `user:${user.email}` ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                Hapus
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {usersTotalPages > 1 && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "12px" }}>
                        <button type="button" onClick={() => setUsersPage((p) => Math.max(1, p - 1))} disabled={usersPage === 1} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px", background: usersPage === 1 ? "#F3F4F6" : "#fff", cursor: usersPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem" }}>Prev</button>
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{usersPage}/{usersTotalPages}</span>
                        <button type="button" onClick={() => setUsersPage((p) => Math.min(usersTotalPages, p + 1))} disabled={usersPage === usersTotalPages} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px", background: usersPage === usersTotalPages ? "#F3F4F6" : "#fff", cursor: usersPage === usersTotalPages ? "not-allowed" : "pointer", fontSize: "0.75rem" }}>Next</button>
                </div>
              )}
              </>
            ) : (
                  <div className="admin-empty-table-state">
                    <div className="admin-empty-icon">
                      <User size={24} />
                    </div>
                    <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--navy)" }}>
                      Belum ada pengguna terdaftar.
                    </span>
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* Middle Table: Antrean Tagihan & Pembayaran Masuk (Invoices) */}
          <section className="admin-card-surface" aria-labelledby="invoices-heading">
            <div className="admin-card-header">
              <div>
                <h2 id="invoices-heading" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--navy)" }}>
                  Daftar Tagihan & Pembayaran Paket (Invoices)
                </h2>
                <span className="admin-card-sub" style={{ margin: 0 }}>
                  Riwayat pembelian kredit. Setujui pembayaran setelah memeriksa bukti yang dikirim pengguna melalui WhatsApp.
                </span>
              </div>

              {data.orders && data.orders.filter((o) => o.status === "PENDING_REVIEW").length > 0 && (
                <span
                  style={{
                    fontSize: "0.76rem",
                    fontWeight: 800,
                    background: "#FEF3C7",
                    color: "#92400E",
                    padding: "4px 12px",
                    borderRadius: "20px",
                    border: "1px solid #FDE68A",
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Clock size={13} /> {data.orders.filter((o) => o.status === "PENDING_REVIEW").length} Menunggu Verifikasi
                </span>
              )}
            </div>

            <div style={{ overflowX: "auto", marginTop: "16px" }}>
              {paginatedOrders.length > 0 ? (
                <>
                  <table className="admin-custom-table">
                    <thead>
                      <tr>
                        <th>No. Invoice</th>
                        <th>Pengguna</th>
                        <th>Paket & Kredit</th>
                        <th>Nominal</th>
                        <th>Bukti Transfer</th>
                        <th>Proses Kredit</th>
                        <th>Status Tagihan</th>
                        <th>Waktu Pesan</th>
                        <th style={{ textAlign: "right" }}>Aksi Admin</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedOrders.map((ord) => (
                      <tr key={ord.id}>
                        <td>
                          <code style={{ fontSize: "0.78rem", fontWeight: 750, color: "var(--navy)", background: "#F1F5F9", padding: "2px 6px", borderRadius: "6px" }}>
                            {ord.id}
                          </code>
                        </td>
                        <td style={{ fontWeight: 600 }}>{ord.userEmail}</td>
                        <td>
                          <span style={{ fontSize: "0.82rem", fontWeight: 700, color: "var(--cobalt)" }}>
                            {ord.planName} (+{ord.credits} Kredit)
                          </span>
                        </td>
                        <td>
                          <strong style={{ fontSize: "0.86rem", color: "var(--navy)" }}>
                            Rp {ord.amount.toLocaleString("id-ID")}
                          </strong>
                        </td>
                        <td>
                          {ord.hasProof ? (
                            <button
                              type="button"
                              onClick={() =>
                                setInspectProofImage({
                                  url: `/api/admin/orders/${encodeURIComponent(ord.id)}/proof`,
                                  orderId: ord.id,
                                  analysis: ord.aiAnalysis,
                                  userEmail: ord.userEmail,
                                  status: ord.status,
                                  ocrMerchant: ord.ocrMerchant,
                                  ocrNmid: ord.ocrNmid,
                                  ocrAmount: ord.ocrAmount,
                                  ocrTransactionId: ord.ocrTransactionId,
                                  ocrDate: ord.ocrDate,
                                })
                              }
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                padding: "4px 8px",
                                borderRadius: "8px",
                                border: "1px solid var(--border)",
                                background: "#FFFFFF",
                                cursor: "pointer",
                              }}
                            >
                              <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--cobalt)" }}>
                                Lihat Bukti
                              </span>
                            </button>
                          ) : (
                            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                              {ord.status === "PENDING_REVIEW" ? "Bukti via WhatsApp" : "Belum dikirim"}
                            </span>
                          )}
                        </td>
                        <td>
                          {ord.status === "PAID" || ord.status === "paid" ? (
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "0.7rem",
                                fontWeight: 800,
                                background: "#ECFDF5",
                                color: "#065F46",
                                border: "1px solid #A7F3D0",
                              }}
                              title={ord.aiAnalysis}
                            >
                              ✓ Kredit sudah ditambahkan
                            </span>
                          ) : ord.aiStatus === "payment_pending_admin" || ord.aiStatus === "pending_review" || ord.status === "PENDING_REVIEW" ? (
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "0.7rem",
                                fontWeight: 800,
                                background: "#EFF6FF",
                                color: "#1E40AF",
                                border: "1px solid #BFDBFE",
                              }}
                              title={ord.aiAnalysis}
                            >
                              ⏳ Menunggu Review Admin
                            </span>
                          ) : ord.aiStatus === "data_mismatch" ? (
                            <span
                              style={{
                                display: "inline-flex",
                                padding: "2px 8px",
                                borderRadius: "6px",
                                fontSize: "0.7rem",
                                fontWeight: 800,
                                background: "#FEF2F2",
                                color: "#991B1B",
                                border: "1px solid #FECACA",
                              }}
                              title={ord.aiAnalysis}
                            >
                              ⚠️ Data Struk Tidak Cocok
                            </span>
                          ) : (
                            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>—</span>
                          )}
                        </td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "3px 8px",
                              borderRadius: "6px",
                              fontSize: "0.72rem",
                              fontWeight: 800,
                              background:
                                ord.status === "PAID" || ord.status === "paid"
                                  ? "#ECFDF5"
                                  : ord.status === "REJECTED" || ord.status === "cancelled"
                                    ? "#FEF2F2"
                                    : ord.status === "DATA_MISMATCH"
                                      ? "#FFFBEB"
                                      : ord.status === "PENDING_REVIEW"
                                        ? "#EFF6FF"
                                        : "#FEF3C7",
                              color:
                                ord.status === "PAID" || ord.status === "paid"
                                  ? "#065F46"
                                  : ord.status === "REJECTED" || ord.status === "cancelled"
                                    ? "#991B1B"
                                    : ord.status === "DATA_MISMATCH"
                                      ? "#B45309"
                                      : ord.status === "PENDING_REVIEW"
                                        ? "#1E40AF"
                                        : "#92400E",
                              border: `1px solid ${
                                ord.status === "PAID" || ord.status === "paid"
                                  ? "#A7F3D0"
                                  : ord.status === "REJECTED" || ord.status === "cancelled"
                                    ? "#FECACA"
                                    : ord.status === "DATA_MISMATCH"
                                      ? "#FDE68A"
                                      : ord.status === "PENDING_REVIEW"
                                        ? "#BFDBFE"
                                        : "#FDE68A"
                              }`,
                            }}
                          >
                            {ord.status === "PAID" || ord.status === "paid"
                              ? "🟢 LUNAS (PAID)"
                              : ord.status === "REJECTED" || ord.status === "cancelled"
                                ? "✕ DITOLAK"
                                : ord.status === "DATA_MISMATCH"
                                  ? "⚠️ DATA MISMATCH"
                                  : ord.status === "PENDING_REVIEW"
                                    ? "⏳ MENUNGGU REVIEW"
                                    : ord.status === "PROOF_UPLOADED"
                                      ? "📷 BUKTI MASUK"
                                      : "⏳ MENUNGGU BAYAR"}
                          </span>
                        </td>
                        <td style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                          {new Date(ord.createdAt).toLocaleDateString("id-ID", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          {ord.status === "PENDING_REVIEW" ? (
                            <div style={{ display: "inline-flex", gap: "6px", justifyContent: "flex-end" }}>
                              <button
                                type="button"
                                className="btn-primary"
                                style={{ minHeight: "28px", padding: "0 10px", fontSize: "0.72rem" }}
                                onClick={() => setConfirmApproveOrder(ord)}
                                disabled={processingOrderId === ord.id}
                              >
                                {processingOrderId === ord.id ? (
                                  <Loader2 className="animate-spin" size={12} />
                                ) : (
                                  <>
                                    <Check size={12} /> ACC (+{ord.credits})
                                  </>
                                )}
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ minHeight: "28px", padding: "0 8px", fontSize: "0.72rem", color: "#DC2626" }}
                                onClick={() =>
                                  setRejectOrderModal({
                                    order: ord,
                                    reasonCode: "TRANSACTION_NOT_FOUND",
                                    reasonNote: "",
                                  })
                                }
                                disabled={processingOrderId === ord.id}
                              >
                                <X size={12} />
                              </button>
                              <button
                                type="button"
                                className="btn-secondary"
                                style={{ minHeight: "28px", padding: "0 8px", fontSize: "0.72rem", color: "#B91C1C", borderColor: "#FECACA" }}
                                onClick={() => void handleDeleteOrder(ord.id)}
                                disabled={deletingTarget === `order:${ord.id}` || processingOrderId === ord.id}
                                title={`Hapus invoice ${ord.id}`}
                              >
                                {deletingTarget === `order:${ord.id}` ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                              </button>
                            </div>
                          ) : ord.status === "PAID" || ord.status === "paid" ? (
                            <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>Selesai</span>
                          ) : (
                            <button
                              type="button"
                              className="btn-secondary"
                              style={{ minHeight: "28px", padding: "0 9px", fontSize: "0.72rem", color: "#B91C1C", borderColor: "#FECACA" }}
                              onClick={() => void handleDeleteOrder(ord.id)}
                              disabled={deletingTarget === `order:${ord.id}`}
                            >
                              {deletingTarget === `order:${ord.id}` ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />}
                              Hapus
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                  {ordersTotalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "12px" }}>
                      <button type="button" onClick={() => setOrdersPage((p) => Math.max(1, p - 1))} disabled={ordersPage === 1} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px", background: ordersPage === 1 ? "#F3F4F6" : "#fff", cursor: ordersPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem" }}>Prev</button>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{ordersPage}/{ordersTotalPages}</span>
                      <button type="button" onClick={() => setOrdersPage((p) => Math.min(ordersTotalPages, p + 1))} disabled={ordersPage === ordersTotalPages} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px", background: ordersPage === ordersTotalPages ? "#F3F4F6" : "#fff", cursor: ordersPage === ordersTotalPages ? "not-allowed" : "pointer", fontSize: "0.75rem" }}>Next</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="admin-empty-table-state">
                  <div className="admin-empty-icon">
                    <Receipt size={24} />
                  </div>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--navy)" }}>
                    Belum ada riwayat pesanan invoice.
                  </span>
                </div>
              )}
            </div>
          </section>

          {/* Bottom Table: Riwayat Audit Transaksi Kredit */}
          <section className="admin-card-surface" aria-labelledby="audit-table-heading">
            <div className="admin-card-header">
              <div>
                <h2 id="audit-table-heading" style={{ margin: 0, fontSize: "1.15rem", fontWeight: 800, color: "var(--navy)" }}>
                  Riwayat Audit Transaksi Kredit
                </h2>
                <span className="admin-card-sub" style={{ margin: 0 }}>
                  Catatan mutasi penambahan, penggunaan, dan pengembalian kredit terbaru.
                </span>
              </div>

              {/* Transaction Filter Dropdown */}
              <div style={{ position: "relative" }}>
                <select
                  value={txFilter}
                  onChange={(e) => setTxFilter(e.target.value)}
                  style={{
                    height: "36px",
                    padding: "0 30px 0 12px",
                    borderRadius: "8px",
                    border: "1px solid var(--border)",
                    background: "#FFFFFF",
                    fontSize: "0.8rem",
                    fontWeight: 600,
                    color: "var(--navy)",
                    appearance: "none",
                    cursor: "pointer",
                  }}
                >
                  <option value="all">Semua Transaksi</option>
                  <option value="add">Penambahan Kredit</option>
                  <option value="deduct">Penggunaan Kredit</option>
                </select>
                <ChevronDown size={14} style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", pointerEvents: "none" }} />
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: "16px" }}>
              {paginatedTx.length > 0 ? (
                <>
                  <table className="admin-custom-table">
                    <thead>
                      <tr>
                        <th>Pengguna</th>
                        <th>Perubahan</th>
                        <th>Keterangan</th>
                        <th>Waktu Transaksi</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedTx.map((tx) => (
                      <tr key={tx.id}>
                        <td style={{ fontWeight: 600 }}>{tx.userEmail}</td>
                        <td>
                          <span
                            style={{
                              display: "inline-flex",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontWeight: 800,
                              fontSize: "0.78rem",
                              background: tx.amount > 0 ? "var(--teal-light)" : "var(--danger-light)",
                              color: tx.amount > 0 ? "var(--teal)" : "var(--danger)",
                            }}
                          >
                            {tx.amount > 0 ? `+${tx.amount}` : tx.amount} kredit
                          </span>
                        </td>
                        <td style={{ color: "var(--text-body)" }}>{tx.reason}</td>
                        <td style={{ color: "var(--text-muted)", fontSize: "0.78rem" }}>
                          {new Date(tx.createdAt).toLocaleString("id-ID")}
                        </td>
                      </tr>
                    ))}
                    </tbody>
                  </table>
                  {txTotalPages > 1 && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "6px", marginTop: "12px" }}>
                      <button type="button" onClick={() => setAuditPage((p) => Math.max(1, p - 1))} disabled={auditPage === 1} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px", background: auditPage === 1 ? "#F3F4F6" : "#fff", cursor: auditPage === 1 ? "not-allowed" : "pointer", fontSize: "0.75rem" }}>Prev</button>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{auditPage}/{txTotalPages}</span>
                      <button type="button" onClick={() => setAuditPage((p) => Math.min(txTotalPages, p + 1))} disabled={auditPage === txTotalPages} style={{ padding: "4px 10px", border: "1px solid var(--border)", borderRadius: "6px", background: auditPage === txTotalPages ? "#F3F4F6" : "#fff", cursor: auditPage === txTotalPages ? "not-allowed" : "pointer", fontSize: "0.75rem" }}>Next</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="admin-empty-table-state">
                  <div className="admin-empty-icon">
                    <FileText size={24} />
                  </div>
                  <span style={{ fontSize: "0.88rem", fontWeight: 700, color: "var(--navy)" }}>
                    Belum ada transaksi kredit.
                  </span>
                </div>
              )}
            </div>
          </section>

        </div>
      ) : (
        <div className="admin-login-center-wrap">
          <div className="admin-login-card" style={{ maxWidth: "480px", padding: "32px 28px", textAlign: "center" }}>
            {isLoading ? (
              <>
                <Loader2 size={30} className="animate-spin" style={{ color: "var(--cobalt)", marginBottom: "14px" }} />
                <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem", color: "var(--navy)" }}>Memuat Panel Admin</h2>
                <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "0.86rem" }}>Memeriksa sesi dan menyiapkan data dashboard.</p>
              </>
            ) : (
              <>
                <Info size={30} style={{ color: "#D97706", marginBottom: "14px" }} />
                <h2 style={{ margin: "0 0 8px", fontSize: "1.2rem", color: "var(--navy)" }}>Sesi Admin Tetap Aktif</h2>
                <p style={{ margin: "0 0 18px", color: "var(--text-muted)", fontSize: "0.86rem", lineHeight: "1.5" }}>
                  {overviewError || "Data dashboard belum tersedia. Silakan muat ulang."}
                </p>
                <button type="button" className="btn-primary" onClick={() => void loadOverview()}>
                  <RefreshCw size={15} /> Coba Muat Ulang
                </button>
              </>
            )}
          </div>
        </div>
      )) : (
        /* ══════════════════════════════════════════════════════════
           UNAUTHENTICATED ADMIN SCREEN (Direct Admin Login Gate)
           ══════════════════════════════════════════════════════════ */
        <div className="admin-login-center-wrap">
          <div style={{ textAlign: "center", marginBottom: "24px" }}>
            <span className="eyebrow-badge center">
              <Shield size={14} /> ADMIN CONTROL PANEL
            </span>
            <h1 style={{ margin: "4px 0 6px", fontSize: "2rem", fontWeight: 800, color: "var(--navy)" }}>
              Akses Khusus Administrator
            </h1>
            <p style={{ margin: 0, fontSize: "0.92rem", color: "var(--text-muted)" }}>
              Panel ini memerlukan autentikasi dengan kredensial administrator resmi.
            </p>
          </div>

          <div className="admin-login-card" style={{ maxWidth: "440px", padding: "32px 28px" }}>
            <div className="admin-shield-icon-circle">
              <Shield size={30} />
            </div>

            <h2 style={{ margin: "0 0 6px", fontSize: "1.3rem", fontWeight: 800, color: "var(--navy)", textAlign: "center" }}>
              Masuk Panel Admin
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: "0.84rem", color: "var(--text-muted)", textAlign: "center" }}>
              Kelola saldo kredit, order QRIS, dan pantau histori audit sistem.
            </p>

            <form onSubmit={handleAdminLogin} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>
                  Email Administrator
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Mail size={16} style={{ position: "absolute", left: "12px", color: "var(--text-muted)", pointerEvents: "none" }} />
                  <input
                    type="email"
                    value={adminEmail}
                    onChange={(e) => setAdminEmail(e.target.value)}
                    required
                    style={{
                      width: "100%",
                      padding: "10px 12px 10px 36px",
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      fontSize: "0.88rem",
                      background: "#F8FAFC",
                      outline: "none",
                      color: "var(--navy)",
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: "block", fontSize: "0.82rem", fontWeight: 700, color: "var(--navy)", marginBottom: "6px" }}>
                  Kata Sandi Admin
                </label>
                <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <Lock size={16} style={{ position: "absolute", left: "12px", color: "var(--text-muted)", pointerEvents: "none" }} />
                  <input
                    type={showAdminPassword ? "text" : "password"}
                    value={adminPassword}
                    onChange={(e) => setAdminPassword(e.target.value)}
                    placeholder="Masukkan kata sandi admin..."
                    required
                    autoFocus
                    style={{
                      width: "100%",
                      padding: "10px 38px 10px 36px",
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      fontSize: "0.88rem",
                      background: "#FFFFFF",
                      outline: "none",
                      color: "var(--navy)",
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setShowAdminPassword(!showAdminPassword)}
                    style={{
                      position: "absolute",
                      right: "10px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-muted)",
                      padding: "4px",
                    }}
                    title={showAdminPassword ? "Sembunyikan sandi" : "Tampilkan sandi"}
                  >
                    {showAdminPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="btn-primary"
                disabled={isAdminLoggingIn}
                style={{
                  width: "100%",
                  minHeight: "44px",
                  fontSize: "0.92rem",
                  fontWeight: 700,
                  justifyContent: "center",
                  marginTop: "8px",
                }}
              >
                {isAdminLoggingIn ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Memeriksa Kredensial...
                  </>
                ) : (
                  <>
                    <LogIn size={16} /> Masuk ke Panel Admin
                  </>
                )}
              </button>
            </form>

            <div style={{ marginTop: "20px", display: "flex", flexDirection: "column", gap: "8px", borderTop: "1px solid var(--border)", paddingTop: "16px" }}>
              <a
                href="/studio"
                className="btn-secondary"
                style={{ width: "100%", minHeight: "36px", fontSize: "0.82rem", justifyContent: "center" }}
              >
                Kembali ke Studio
              </a>
              <a
                href="/login"
                style={{ fontSize: "0.78rem", color: "var(--cobalt)", textAlign: "center", textDecoration: "none" }}
              >
                Masuk sebagai Pengguna Biasa &rarr;
              </a>
            </div>
          </div>

          <div style={{ marginTop: "36px", display: "flex", alignItems: "center", gap: "14px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
            <span>&copy; {new Date().getFullYear()} Dokumenku AI</span>
            <span>•</span>
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span className="status-dot" />
              <span>Sistem Admin Terproteksi</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Daftar Model AI Upstream ───────────────────────── */}
      {showModelsModal && data?.providerInfo?.models && (
        <div
          className="studio-modal-backdrop"
          onClick={() => setShowModelsModal(false)}
        >
          <div
            className="studio-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="models-modal-title"
            style={{ maxWidth: "680px", maxHeight: "85vh", display: "flex", flexDirection: "column" }}
          >
            <div className="studio-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Cpu size={20} color="var(--cobalt)" />
                <div>
                  <strong id="models-modal-title" style={{ fontSize: "1.1rem", color: "var(--navy)", display: "block" }}>
                    Daftar Model AI Terkoneksi ({data.providerInfo.models.length} Model)
                  </strong>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    Provider: {data.providerInfo?.providerUrl?.split("•")[0]?.trim() || "AI Gateway"} • API Key Aktif
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={() => setShowModelsModal(false)}
              >
                ✕
              </button>
            </div>

            <div
              className="studio-modal-body"
              style={{
                overflowY: "auto",
                maxHeight: "55vh",
                padding: "16px 20px",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
                  gap: "10px",
                }}
              >
                {data.providerInfo.models.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      padding: "10px 12px",
                      borderRadius: "10px",
                      background: m.healthStatus === "healthy" ? (m.isFlagship ? "#FAF5FF" : "#F0FDF4") : "#FFFBEB",
                      border: `1px solid ${m.healthStatus === "healthy" ? (m.isFlagship ? "#E9D5FF" : "#BBF7D0") : "#FDE68A"}`,
                      display: "flex",
                      flexDirection: "column",
                      gap: "4px",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px" }}>
                      <strong style={{ fontSize: "0.82rem", color: "var(--navy)" }}>
                        {m.name}
                      </strong>
                      <div style={{ display: "flex", gap: "4px" }}>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: "6px",
                            background: m.isFlagship ? "#8B5CF6" : "#10B981",
                            color: "#FFFFFF",
                          }}
                        >
                          {m.isFlagship ? "Flagship (Pro)" : "Starter"}
                        </span>
                        {m.availabilityLabel && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              padding: "2px 6px",
                              borderRadius: "6px",
                              background: m.healthStatus === "healthy" ? "#ECFDF5" : "#FEF3C7",
                              color: m.healthStatus === "healthy" ? "#065F46" : "#92400E",
                              border: `1px solid ${m.healthStatus === "healthy" ? "#A7F3D0" : "#FDE68A"}`,
                            }}
                          >
                            {m.availabilityLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    <code style={{ fontSize: "0.72rem", color: "var(--text-muted)", wordBreak: "break-all" }}>
                      ID: {m.id}
                    </code>
                    {m.providerGrade && (
                      <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                        Grade provider: {m.providerGrade}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="studio-modal-footer">
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowModelsModal(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ── Modal Pratinjau Foto Bukti Pembayaran ────────────────── */}
      {inspectProofImage && (
        <div
          className="studio-modal-backdrop"
          onClick={() => setInspectProofImage(null)}
        >
          <div
            className="studio-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="proof-modal-title"
            style={{ maxWidth: "680px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
          >
            <div className="studio-modal-header">
              <div>
                <strong id="proof-modal-title" style={{ fontSize: "1.08rem", color: "var(--navy)", display: "block" }}>
                  Bukti Pembayaran: {inspectProofImage.orderId}
                </strong>
                <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                  Pengguna: {inspectProofImage.userEmail}
                </span>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={() => setInspectProofImage(null)}
              >
                ✕
              </button>
            </div>

            <div className="studio-modal-body" style={{ padding: "16px 20px", overflowY: "auto" }}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                  gap: "16px",
                  alignItems: "start",
                }}
              >
                {/* Proof Image */}
                <div style={{ textAlign: "center" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={inspectProofImage.url}
                    alt="Struk Transfer Lengkap"
                    style={{
                      maxWidth: "100%",
                      maxHeight: "45vh",
                      objectFit: "contain",
                      borderRadius: "10px",
                      border: "1px solid var(--border)",
                      background: "#F8FAFC",
                    }}
                  />
                </div>

                {/* Informasi bukti. Pembayaran otomatis tidak memakai OCR. */}
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div
                    style={{
                      background: "#F8FAFC",
                      borderRadius: "10px",
                      padding: "12px 14px",
                      border: "1px solid var(--border)",
                    }}
                  >
                    <strong style={{ fontSize: "0.82rem", color: "var(--navy)", display: "block", marginBottom: "8px" }}>
                      📋 Informasi Pembayaran:
                    </strong>
                    <div style={{ display: "grid", gridTemplateColumns: "110px 1fr", gap: "6px", fontSize: "0.76rem" }}>
                      <span style={{ color: "var(--text-muted)" }}>Metode:</span>
                      <strong style={{ color: "var(--navy)" }}>QRIS</strong>

                      <span style={{ color: "var(--text-muted)" }}>Proses:</span>
                      <strong style={{ color: "#92400E" }}>Menunggu persetujuan admin</strong>

                      <span style={{ color: "var(--text-muted)" }}>Status:</span>
                      <strong style={{ color: "#065F46" }}>{inspectProofImage.status === "PAID" ? "LUNAS" : inspectProofImage.status || "—"}</strong>

                      <span style={{ color: "var(--text-muted)" }}>OCR:</span>
                      <span>Tidak digunakan</span>
                    </div>
                  </div>

                  {/* System/AI Analysis Alert */}
                  {inspectProofImage.analysis && (
                    <div
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        background: inspectProofImage.analysis.includes("Ketidaksesuaian") ? "#FEF2F2" : "#F0FDF4",
                        border: `1px solid ${inspectProofImage.analysis.includes("Ketidaksesuaian") ? "#FECACA" : "#BBF7D0"}`,
                        fontSize: "0.76rem",
                        color: inspectProofImage.analysis.includes("Ketidaksesuaian") ? "#991B1B" : "#065F46",
                        lineHeight: "1.45",
                      }}
                    >
                      <strong>Catatan Sistem:</strong>
                      <p style={{ margin: "4px 0 0" }}>{inspectProofImage.analysis}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="studio-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setInspectProofImage(null)}
              >
                Tutup
              </button>

              {inspectProofImage.status !== "PAID" && inspectProofImage.status !== "paid" && inspectProofImage.status !== "REJECTED" && inspectProofImage.status !== "cancelled" && (
                <>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ color: "#DC2626" }}
                    onClick={() => {
                      const order = data?.orders?.find((item) => item.id === inspectProofImage.orderId);
                      if (!order) return;
                      setInspectProofImage(null);
                      setRejectOrderModal({ order, reasonCode: "TRANSACTION_NOT_FOUND", reasonNote: "" });
                    }}
                  >
                    <X size={14} /> Tolak Tagihan
                  </button>
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={() => {
                      const order = data?.orders?.find((item) => item.id === inspectProofImage.orderId);
                      if (!order) return;
                      setInspectProofImage(null);
                      setConfirmApproveOrder(order);
                    }}
                  >
                  <Check size={14} /> Verifikasi Mutasi QRIS
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Integrasi & QR Code Bot WhatsApp ────────────────── */}
      {showWaModal && (
        <div
          className="studio-modal-backdrop"
          onClick={() => setShowWaModal(false)}
        >
          <div
            className="studio-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="wa-modal-title"
            style={{ maxWidth: "560px", maxHeight: "90vh", display: "flex", flexDirection: "column" }}
          >
            <div className="studio-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <Smartphone size={22} color="#10B981" />
                <div>
                  <strong id="wa-modal-title" style={{ fontSize: "1.1rem", color: "var(--navy)", display: "block" }}>
                    Integrasi WhatsApp Bot (+62 857-5449-4990)
                  </strong>
                  <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    Tautkan WhatsApp Admin untuk notifikasi struk & approval instan via chat
                  </span>
                </div>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={() => setShowWaModal(false)}
              >
                ✕
              </button>
            </div>

            <div className="studio-modal-body" style={{ padding: "20px 24px", overflowY: "auto" }}>
              {waStatus?.ready ? (
                /* ── State 1: Connected (Gateway or Local Bot) ── */
                <div style={{ display: "flex", flexDirection: "column", gap: "18px", textAlign: "center" }}>
                  <div
                    style={{
                      background: "#F0FDF4",
                      border: "1.5px solid #BBF7D0",
                      borderRadius: "14px",
                      padding: "24px 20px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "10px",
                    }}
                  >
                    <div
                      style={{
                        width: "56px",
                        height: "56px",
                        borderRadius: "50%",
                        background: "#DCFCE7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <CheckCircle2 size={32} color="#16A34A" />
                    </div>
                    <strong style={{ fontSize: "1.15rem", color: "#166534" }}>
                      {waStatus.mode === "gateway" ? "WhatsApp Gateway (Cloud) Aktif!" : "Bot WhatsApp Terhubung & Aktif!"}
                    </strong>
                    <span style={{ fontSize: "0.85rem", color: "#15803D" }}>
                      Nomor Admin Tujuan: <strong>+{waStatus.adminPhone}</strong>
                    </span>
                    <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "#166534", lineHeight: "1.5" }}>
                      Bukti pembayaran dikirim sendiri oleh pengguna melalui WhatsApp. Periksa mutasi pembayaran secara manual sebelum menyetujui invoice ini.
                    </p>
                  </div>

                  {/* Webhook Endpoint for Vercel Deployment */}
                  {waStatus.webhookUrl && (
                    <div
                      style={{
                        background: "#F8FAFC",
                        border: "1px solid var(--border)",
                        borderRadius: "12px",
                        padding: "14px 16px",
                        textAlign: "left",
                      }}
                    >
                      <strong style={{ fontSize: "0.84rem", color: "var(--navy)", display: "block", marginBottom: "6px" }}>
                        🌐 URL Webhook Vercel (Untuk Fonnte / Gateway):
                      </strong>
                      <div
                        style={{
                          background: "#0F172A",
                          color: "#F8FAFC",
                          borderRadius: "8px",
                          padding: "10px 12px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          fontFamily: "monospace",
                          fontSize: "0.78rem",
                        }}
                      >
                        <span style={{ wordBreak: "break-all" }}>{waStatus.webhookUrl}</span>
                        <button
                          type="button"
                          onClick={() => {
                            if (waStatus.webhookUrl) {
                              void navigator.clipboard.writeText(waStatus.webhookUrl);
                              toast.success("URL Webhook disalin ke clipboard!");
                            }
                          }}
                          style={{
                            background: "rgba(255,255,255,0.12)",
                            border: "none",
                            color: "#FFFFFF",
                            padding: "4px 8px",
                            borderRadius: "4px",
                            cursor: "pointer",
                            fontSize: "0.72rem",
                            display: "flex",
                            alignItems: "center",
                            gap: "4px",
                            marginLeft: "8px",
                          }}
                        >
                          <Copy size={12} /> Salin
                        </button>
                      </div>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block", marginTop: "6px" }}>
                        💡 Masukkan URL ini di menu Webhook dashboard gateway (misal Fonnte) agar balasan <code>ACC &lt;INV-ID&gt; &lt;TOKEN&gt;</code> langsung dieksekusi serverless Vercel.
                      </span>
                    </div>
                  )}

                  {/* Commands Guide Card */}
                  <div
                    style={{
                      background: "#F8FAFC",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      padding: "14px 16px",
                      textAlign: "left",
                    }}
                  >
                    <strong style={{ fontSize: "0.84rem", color: "var(--navy)", display: "block", marginBottom: "8px" }}>
                      📱 Perintah Balasan Cepat di WhatsApp:
                    </strong>
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", fontSize: "0.78rem" }}>
                      <div>
                        <code>ACC &lt;INV-ID&gt; &lt;TOKEN&gt;</code> &mdash; <span style={{ color: "var(--text-muted)" }}>Setujui invoice & berikan +100 kredit</span>
                      </div>
                      <div>
                        <code>TOLAK &lt;INV-ID&gt;</code> &mdash; <span style={{ color: "var(--text-muted)" }}>Batalkan invoice jika mutasi tidak ada</span>
                      </div>
                      <div>
                        <code>LIST</code> &mdash; <span style={{ color: "var(--text-muted)" }}>Cek daftar transaksi yang sedang menunggu review</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Row: Test Notification & Disconnect / Change Account */}
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={handleTestWa}
                      disabled={isTestingWa || isDisconnectingWa}
                      style={{
                        minHeight: "42px",
                        fontSize: "0.88rem",
                        justifyContent: "center",
                        background: "#10B981",
                      }}
                    >
                      {isTestingWa ? (
                        <>
                          <Loader2 size={16} className="animate-spin" /> Mengirim Pesan Tes...
                        </>
                      ) : (
                        <>
                          <Send size={16} /> Kirim Pesan Tes ke WhatsApp Saya
                        </>
                      )}
                    </button>

                    {waStatus.mode !== "gateway" && (
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={handleDisconnectWa}
                        disabled={isDisconnectingWa || isTestingWa}
                        style={{
                          minHeight: "38px",
                          fontSize: "0.82rem",
                          justifyContent: "center",
                          color: "#DC2626",
                          borderColor: "#FECACA",
                          background: "#FEF2F2",
                        }}
                      >
                        {isDisconnectingWa ? (
                          <>
                            <Loader2 size={14} className="animate-spin" /> Memutus Sesi WhatsApp...
                          </>
                        ) : (
                          <>
                            <LogOut size={14} /> Putus Sesi / Ganti Perangkat WhatsApp
                          </>
                        )}
                      </button>
                    )}
                  </div>

                  {/* Configuration Help */}
                  <div style={{ fontSize: "0.76rem", color: "var(--text-muted)", background: "#F1F5F9", padding: "8px 12px", borderRadius: "8px", textAlign: "left" }}>
                    💡 <strong>Konfigurasi Environment Vercel:</strong> Setel <code>FONNTE_TOKEN</code> & <code>ADMIN_WA_PHONE</code> di Vercel Dashboard Settings &rarr; Environment Variables.
                  </div>
                </div>
              ) : waStatus?.online && waStatus?.qrCode ? (
                /* ── State 2: QR Code Waiting to be Scanned ── */
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "16px", textAlign: "center" }}>
                  <div
                    style={{
                      padding: "4px 12px",
                      borderRadius: "20px",
                      background: "#FEF3C7",
                      border: "1px solid #FCD34D",
                      color: "#92400E",
                      fontSize: "0.78rem",
                      fontWeight: 700,
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <span className="status-dot" style={{ background: "#F59E0B" }} />
                    <span>Pindai QR Code di Bawah dengan WhatsApp HP</span>
                  </div>

                  {/* Live QR Code Image */}
                  <div
                    style={{
                      padding: "12px",
                      borderRadius: "16px",
                      background: "#FFFFFF",
                      boxShadow: "0 8px 24px rgba(15, 23, 42, 0.08)",
                      border: "2px solid #E2E8F0",
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={waStatus.qrCode}
                      alt="WhatsApp Web Pairing QR Code"
                      style={{
                        width: "250px",
                        height: "250px",
                        display: "block",
                        borderRadius: "8px",
                      }}
                    />
                  </div>

                  {/* Step by step guide */}
                  <div
                    style={{
                      background: "#F8FAFC",
                      border: "1px solid var(--border)",
                      borderRadius: "12px",
                      padding: "14px 18px",
                      textAlign: "left",
                      width: "100%",
                      fontSize: "0.82rem",
                      lineHeight: "1.6",
                    }}
                  >
                    <strong style={{ color: "var(--navy)", display: "block", marginBottom: "6px" }}>
                      📝 Cara Menautkan Perangkat:
                    </strong>
                    <ol style={{ margin: 0, paddingLeft: "20px", color: "var(--text-muted)" }}>
                      <li>Buka aplikasi <strong>WhatsApp</strong> di HP Admin (<code>6285754494990</code>).</li>
                      <li>Ketuk ikon titik tiga di kanan atas (Android) atau <strong>Pengaturan</strong> (iPhone).</li>
                      <li>Pilih menu <strong>Perangkat Tertaut</strong> &rarr; <strong>Tautkan Perangkat</strong>.</li>
                      <li>Arahkan kamera ke QR Code di atas.</li>
                    </ol>
                  </div>

                  <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>
                    🔄 QR Code akan otomatis diperbarui setiap beberapa detik secara otomatis.
                  </span>
                </div>
              ) : (
                /* ── State 3: Bot Server Offline ── */
                <div style={{ display: "flex", flexDirection: "column", gap: "16px", textAlign: "center" }}>
                  <div
                    style={{
                      background: "#FFFBEB",
                      border: "1.5px solid #FDE68A",
                      borderRadius: "14px",
                      padding: "20px 18px",
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                    }}
                  >
                    <div
                      style={{
                        width: "48px",
                        height: "48px",
                        borderRadius: "50%",
                        background: "#FEF3C7",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Smartphone size={26} color="#D97706" />
                    </div>
                    <strong style={{ fontSize: "1.08rem", color: "#92400E" }}>
                      Server WhatsApp Bot Belum Berjalan
                    </strong>
                    <p style={{ margin: 0, fontSize: "0.82rem", color: "#B45309", lineHeight: "1.5" }}>
                      Agar QR Code dapat muncul di dashboard ini dan bot dapat mengirim notifikasi chat, jalankan server bot di terminal Anda:
                    </p>
                  </div>

                  {/* Terminal Command Snippet */}
                  <div
                    style={{
                      background: "#0F172A",
                      color: "#F8FAFC",
                      borderRadius: "10px",
                      padding: "14px 16px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      fontFamily: "monospace",
                      fontSize: "0.9rem",
                    }}
                  >
                    <span>npm run bot:wa</span>
                    <button
                      type="button"
                      onClick={() => {
                        void navigator.clipboard.writeText("npm run bot:wa");
                        setHasCopiedCommand(true);
                        toast.success("Perintah 'npm run bot:wa' disalin!");
                        setTimeout(() => setHasCopiedCommand(false), 2500);
                      }}
                      style={{
                        background: "rgba(255,255,255,0.12)",
                        border: "none",
                        color: "#FFFFFF",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        cursor: "pointer",
                        fontSize: "0.75rem",
                        display: "flex",
                        alignItems: "center",
                        gap: "4px",
                      }}
                    >
                      {hasCopiedCommand ? <Check size={13} color="#4ADE80" /> : <Copy size={13} />}
                      <span>{hasCopiedCommand ? "Tersalin" : "Salin"}</span>
                    </button>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "8px", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Mendeteksi server bot secara otomatis (setiap 3 detik)...</span>
                  </div>
                </div>
              )}
            </div>

            <div className="studio-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => void checkWaStatus()}
                style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}
              >
                <RefreshCw size={14} /> Refresh Status
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowWaModal(false)}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 4: Konfirmasi Verifikasi Mutasi Pembayaran ── */}
      {confirmApproveOrder && (
        <div className="studio-modal-backdrop" onClick={() => setConfirmApproveOrder(null)}>
          <div className="studio-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="studio-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--navy)", fontWeight: 800 }}>
                <Shield size={18} color="#059669" />
                <span>Konfirmasi Verifikasi Mutasi Rekening</span>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={() => setConfirmApproveOrder(null)}
              >
                ✕
              </button>
            </div>
            <div className="studio-modal-body" style={{ fontSize: "0.86rem", lineHeight: "1.6" }}>
              <div
                style={{
                  background: "#FFFBEB",
                  border: "1px solid #FDE68A",
                  padding: "12px 14px",
                  borderRadius: "10px",
                  color: "#92400E",
                  marginBottom: "16px",
                  fontSize: "0.82rem",
                }}
              >
                ⚠️ <strong>Peringatan Verifikasi:</strong> Pastikan Anda telah memeriksa mutasi pembayaran secara langsung pada m-Banking/QRIS Dashboard. Jangan menyetujui transaksi hanya berdasarkan bukti yang dikirim pengguna melalui WhatsApp.
              </div>

              <div
                style={{
                  background: "#F8FAFC",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "12px 16px",
                  display: "grid",
                  gridTemplateColumns: "130px 1fr",
                  rowGap: "8px",
                  fontSize: "0.82rem",
                }}
              >
                <span style={{ color: "var(--text-muted)" }}>ID Invoice:</span>
                <strong>{confirmApproveOrder.id}</strong>

                <span style={{ color: "var(--text-muted)" }}>Nominal Tagihan:</span>
                <strong style={{ color: "var(--cobalt)" }}>
                  Rp {confirmApproveOrder.amount.toLocaleString("id-ID")}
                </strong>

                <span style={{ color: "var(--text-muted)" }}>Nominal di Struk:</span>
                <span>{confirmApproveOrder.ocrAmount || "—"}</span>

                <span style={{ color: "var(--text-muted)" }}>ID Transaksi/RRN:</span>
                <code style={{ fontSize: "0.78rem" }}>{confirmApproveOrder.ocrTransactionId || "—"}</code>

                <span style={{ color: "var(--text-muted)" }}>Email Pengguna:</span>
                <span>{confirmApproveOrder.userEmail}</span>

                <span style={{ color: "var(--text-muted)" }}>Kredit Diberikan:</span>
                <span style={{ color: "#059669", fontWeight: 800 }}>+{confirmApproveOrder.credits} Kredit {confirmApproveOrder.planName}</span>
              </div>
            </div>
            <div className="studio-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setConfirmApproveOrder(null)}
                disabled={processingOrderId === confirmApproveOrder.id}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                style={{ background: "#059669", borderColor: "#047857" }}
                disabled={processingOrderId === confirmApproveOrder.id}
                onClick={async () => {
                  const id = confirmApproveOrder.id;
                  setConfirmApproveOrder(null);
                  await handleOrderAction(id, "approve");
                }}
              >
                {processingOrderId === confirmApproveOrder.id ? (
                  <>
                    <Loader2 size={14} className="animate-spin" /> Memproses...
                  </>
                ) : (
                  <>
                    <Check size={14} /> Saya Sudah Cek Mutasi — ACC (+{confirmApproveOrder.credits} Kredit)
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal 5: Tolak Tagihan dengan Alasan Terstruktur ── */}
      {rejectOrderModal && (
        <div className="studio-modal-backdrop" onClick={() => setRejectOrderModal(null)}>
          <div className="studio-modal-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "520px" }}>
            <div className="studio-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px", color: "var(--navy)", fontWeight: 800 }}>
                <X size={18} color="#DC2626" />
                <span>Tolak Pembayaran Invoice</span>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={() => setRejectOrderModal(null)}
              >
                ✕
              </button>
            </div>
            <div className="studio-modal-body">
              <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", margin: "0 0 14px" }}>
                Pilih alasan penolakan tagihan <strong>{rejectOrderModal.order.id}</strong>. Alasan ini akan tercatat dalam audit log dan ditampilkan kepada pengguna.
              </p>

              <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "6px" }}>
                Alasan Penolakan:
              </label>
              <select
                value={rejectOrderModal.reasonCode}
                onChange={(e) =>
                  setRejectOrderModal({
                    ...rejectOrderModal,
                    reasonCode: e.target.value,
                  })
                }
                style={{
                  width: "100%",
                  padding: "8px 12px",
                  borderRadius: "8px",
                  border: "1px solid var(--border)",
                  marginBottom: "12px",
                  fontSize: "0.84rem",
                  background: "#FFFFFF",
                }}
              >
                <option value="TRANSACTION_NOT_FOUND">Transaksi tidak ditemukan pada mutasi pembayaran</option>
                <option value="AMOUNT_MISMATCH">Nominal transfer tidak sesuai (Rp 20.000 / Rp 75.000)</option>
                <option value="MERCHANT_MISMATCH">Merchant tujuan transfer tidak sesuai</option>
                <option value="PROOF_UNREADABLE">Bukti transfer buram / terpotong / tidak terbaca</option>
                <option value="TRANSACTION_DUPLICATE">ID transaksi sudah pernah digunakan sebelumnya</option>
                <option value="TRANSACTION_EXPIRED">Transaksi dilakukan di luar tanggal tagihan aktif</option>
                <option value="OTHER">Alasan lainnya</option>
              </select>

              {rejectOrderModal.reasonCode === "OTHER" && (
                <div>
                  <label style={{ display: "block", fontSize: "0.8rem", fontWeight: 700, marginBottom: "6px" }}>
                    Catatan Penolakan (Wajib Diisi):
                  </label>
                  <textarea
                    rows={3}
                    value={rejectOrderModal.reasonNote}
                    onChange={(e) =>
                      setRejectOrderModal({
                        ...rejectOrderModal,
                        reasonNote: e.target.value,
                      })
                    }
                    placeholder="Tuliskan alasan penolakan secara spesifik..."
                    style={{
                      width: "100%",
                      padding: "8px 12px",
                      borderRadius: "8px",
                      border: "1px solid var(--border)",
                      fontSize: "0.84rem",
                    }}
                  />
                </div>
              )}
            </div>
            <div className="studio-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setRejectOrderModal(null)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ color: "#DC2626", borderColor: "#FECACA", background: "#FEF2F2", fontWeight: 700 }}
                disabled={
                  processingOrderId === rejectOrderModal.order.id ||
                  (rejectOrderModal.reasonCode === "OTHER" && !rejectOrderModal.reasonNote.trim())
                }
                onClick={async () => {
                  const { order, reasonCode, reasonNote } = rejectOrderModal;
                  setRejectOrderModal(null);
                  await handleOrderAction(order.id, "cancel", reasonCode, reasonNote);
                }}
              >
                Tolak Tagihan
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
