"use client";

import { useState, useEffect } from "react";
import {
  Layers,
  Tag,
  User,
  Shield,
  Coins,
  Pencil,
  FileText,
  Clock,
  Download,
  Clipboard,
  AlertTriangle,
  Loader2,
  Edit3,
  Eye,
  MessageSquarePlus,
  Send,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useDocumentGenerator } from "@/hooks/useDocumentGenerator";
import { downloadMarkdown, FILES } from "@/lib/stream-parser";
import { downloadAllAsZip } from "@/lib/export";
import {
  analyzeRevisionImpact,
  createLineDiff,
  type RevisionImpact,
  type RevisionPreview,
  type RevisionScope,
} from "@/lib/revision-impact";
import type { FileName } from "@/lib/types";

const QUICK_PROMPTS = [
  {
    title: "QR Absensi Siswa",
    text: `Nama / jenis produk: Sistem absensi siswa berbasis QR untuk sekolah
Target pengguna utama: Admin sekolah, guru, dan siswa
Masalah yang ingin diselesaikan dan tujuan bisnis: Mempercepat pencatatan kehadiran dan memberi riwayat presensi yang akurat
Fitur utama beserta prioritasnya: Kelola kelas/siswa, sesi absensi QR, scan presensi, riwayat siswa, dan laporan guru
Role pengguna dan alur utama yang diharapkan: Admin menyiapkan data; guru membuka sesi; siswa scan QR; guru meninjau hasil
Halaman / pengalaman pengguna yang diperlukan: Dashboard admin, daftar kelas, sesi QR, pemindai siswa, dan riwayat kehadiran
Data penting, integrasi, dan teknologi yang diinginkan: Siswa, kelas, sesi, presensi; Next.js, TypeScript, Tailwind, PostgreSQL
Aturan bisnis, keamanan, atau batasan khusus: Satu siswa hanya dapat tercatat sekali per sesi dan akses berbasis role
Preferensi desain, bahasa, atau contoh referensi: Antarmuka web sederhana, cepat dipakai di kelas, Bahasa Indonesia`,
  },
  {
    title: "POS Kasir & Stok",
    text: `Nama / jenis produk: POS cloud untuk coffee shop dan restoran
Target pengguna utama: Kasir, owner, manajer cabang, dan staf dapur
Masalah yang ingin diselesaikan dan tujuan bisnis: Mempercepat transaksi dan mengontrol stok serta laba per cabang
Fitur utama beserta prioritasnya: Transaksi kasir, cetak struk, meja, stok bahan baku, laporan harian, dan multi-cabang
Role pengguna dan alur utama yang diharapkan: Kasir membuat pesanan; dapur menerima pesanan; owner melihat laporan dan stok
Halaman / pengalaman pengguna yang diperlukan: POS kasir, daftar pesanan, denah meja, stok, dashboard owner, dan laporan
Data penting, integrasi, dan teknologi yang diinginkan: Produk, transaksi, stok, cabang; printer Bluetooth dan WhatsApp
Aturan bisnis, keamanan, atau batasan khusus: Stok berkurang otomatis saat transaksi selesai; pembatalan harus tercatat audit
Preferensi desain, bahasa, atau contoh referensi: Tampilan kasir cepat dengan tombol besar dan dashboard ringkas`,
  },
  {
    title: "SaaS AI Document Chat",
    text: `Nama / jenis produk: Platform SaaS AI untuk analisis dan tanya jawab dokumen PDF
Target pengguna utama: Profesional, tim operasional, dan peneliti
Masalah yang ingin diselesaikan dan tujuan bisnis: Mempercepat pencarian insight dari dokumen panjang dengan jawaban yang memiliki sumber kutipan
Fitur utama beserta prioritasnya: Upload PDF, ekstraksi teks, chat RAG, kutipan sumber, ringkasan, dan ekspor Excel/Word
Role pengguna dan alur utama yang diharapkan: Pengguna upload dokumen, menunggu indeks, bertanya, memeriksa kutipan, lalu ekspor hasil
Halaman / pengalaman pengguna yang diperlukan: Dashboard dokumen, upload, ruang chat, detail kutipan, dan riwayat ekspor
Data penting, integrasi, dan teknologi yang diinginkan: File PDF, chunk, embedding, percakapan; penyimpanan objek dan layanan AI/RAG
Aturan bisnis, keamanan, atau batasan khusus: Dokumen privat per pengguna; jawaban wajib menunjukkan sumber kutipan
Preferensi desain, bahasa, atau contoh referensi: SaaS profesional, desktop-first, Bahasa Indonesia dan Inggris`,
  },
  {
    title: "Marketplace Jasa Lokal",
    text: `Nama / jenis produk: Marketplace jasa freelance lokal
Target pengguna utama: Klien, freelancer, admin platform, dan tim verifikasi
Masalah yang ingin diselesaikan dan tujuan bisnis: Mempertemukan pencari jasa lokal dengan freelancer terpercaya dan transaksi yang aman
Fitur utama beserta prioritasnya: Profil jasa, pencarian, penawaran, escrow, milestone, chat, review, dan verifikasi identitas
Role pengguna dan alur utama yang diharapkan: Klien membuat proyek; freelancer mengirim penawaran; keduanya menyetujui milestone dan pembayaran
Halaman / pengalaman pengguna yang diperlukan: Beranda pencarian, detail jasa, proyek, penawaran, chat, pembayaran, dan dashboard admin
Data penting, integrasi, dan teknologi yang diinginkan: Akun, jasa, proyek, milestone, transaksi; payment gateway dan notifikasi
Aturan bisnis, keamanan, atau batasan khusus: Dana escrow hanya dilepas setelah milestone disetujui; verifikasi identitas wajib untuk freelancer
Preferensi desain, bahasa, atau contoh referensi: Mobile-friendly, terpercaya, fokus pada layanan lokal`,
  },
];

const FULL_BRIEF_TEMPLATE = `Nama / jenis produk:
Target pengguna utama:
Masalah yang ingin diselesaikan dan tujuan bisnis:
Fitur utama beserta prioritasnya:
Role pengguna dan alur utama yang diharapkan:
Halaman / pengalaman pengguna yang diperlukan:
Data penting, integrasi, dan teknologi yang diinginkan:
Aturan bisnis, keamanan, atau batasan khusus:
Preferensi desain, bahasa, atau contoh referensi:`;

const REVISION_QUICK_PROMPTS: Record<FileName, Array<{ label: string; instruction: string }>> = {
  "PRD.md": [
    { label: "Tambah Fitur", instruction: "Tambahkan fitur baru beserta user story, prioritas, dan kriteria penerimaannya." },
    { label: "Tambah Role", instruction: "Tambahkan role baru, kebutuhan pengguna, dan batas permission yang jelas." },
    { label: "Ubah MVP", instruction: "Perbarui scope MVP, V1, dan Future agar prioritas rilis lebih realistis." },
    { label: "Acceptance Criteria", instruction: "Perjelas kriteria penerimaan untuk setiap alur utama dan kondisi gagal." },
  ],
  "TECH-STACK.md": [
    { label: "Security", instruction: "Perkuat desain keamanan, autentikasi, otorisasi, audit, dan perlindungan data sensitif." },
    { label: "API Architecture", instruction: "Perjelas arsitektur API, versioning endpoint, kontrak request/response, dan error response." },
    { label: "Deployment", instruction: "Tambahkan strategi deployment, environment, CI/CD, rollback, dan observabilitas." },
    { label: "Error Handling", instruction: "Perjelas edge case, penanganan galat, retry, idempotency, dan timeout." },
  ],
  "UI-UX.md": [
    { label: "Halaman Baru", instruction: "Tambahkan halaman baru lengkap dengan tujuan, struktur, state, dan interaksinya." },
    { label: "Responsive Mobile", instruction: "Perkuat perilaku responsif mobile, prioritas konten, dan interaksi layar kecil." },
    { label: "User Flow", instruction: "Perjelas user flow utama, kondisi kosong, loading, sukses, dan galat." },
    { label: "Design System", instruction: "Lengkapi design token, komponen, variasi state, dan aturan aksesibilitas." },
  ],
  "SCHEMA.md": [
    { label: "Tambah Entitas", instruction: "Tambahkan entitas baru beserta kolom, relasi, constraint, index, dan lifecycle yang diperlukan." },
    { label: "Role & Permission", instruction: "Perjelas role, permission data, row-level access, dan audit atas perubahan penting." },
    { label: "Audit Log", instruction: "Tambahkan audit log yang mencatat aktor, aksi, perubahan data, waktu, dan konteksnya." },
    { label: "Index & Constraint", instruction: "Tambahkan index dan constraint untuk integritas data, uniqueness, foreign key, dan query utama." },
    { label: "Soft Delete", instruction: "Tambahkan strategi soft delete, retensi, pemulihan, dan filter data aktif." },
    { label: "Riwayat Perubahan", instruction: "Tambahkan riwayat perubahan untuk data penting beserta actor dan alasan perubahan." },
  ],
};

type StudioWorkbenchProps = {
  initialPrompt?: string;
  initialProjectName?: string;
  projectId?: string;
  onBackToHome?: () => void;
};

export default function StudioWorkbench({
  initialPrompt = "",
  initialProjectName = "",
  projectId = "default_project",
  onBackToHome,
}: StudioWorkbenchProps) {
  const [projectPrompt, setProjectPrompt] = useState(initialPrompt);
  const [isProviderActive, setIsProviderActive] = useState(false);
  const [isProviderMaintenance, setIsProviderMaintenance] = useState(false);
  const [providerErrorMsg, setProviderErrorMsg] = useState("");
  const [creditStatus, setCreditStatus] = useState("Memeriksa status kredit...");

  const [creditsRemaining, setCreditsRemaining] = useState<number>(3);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState<boolean>(false);
  const [promptError, setPromptError] = useState<string>("");
  const [showPromptGuide, setShowPromptGuide] = useState(false);
  const [revisionError, setRevisionError] = useState<string>("");

  const [isEditMode, setIsEditMode] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);
  const [revisionScope, setRevisionScope] = useState<RevisionScope>("document");
  const [revisionImpact, setRevisionImpact] = useState<RevisionImpact | null>(null);
  const [revisionPreview, setRevisionPreview] = useState<RevisionPreview | null>(null);

  const {
    files,
    isGenerating,
    isLoadingDocs,
    progress,
    activeFile,
    hasResult,
    qualityState,
    qualityReport,
    lastError,
    setActiveFile,
    updateFileContent,
    prepareRevision,
    applyRevisionPreview,
    generateFromPrompt,
    resetAll,
  } = useDocumentGenerator(projectId, initialProjectName);

  useEffect(() => {
    if (initialPrompt) {
      setProjectPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  async function checkProviderHealth() {
    try {
      const response = await fetch("/api/models");
      const payload = (await response.json()) as {
        data?: unknown[];
        isPro?: boolean;
        error?: string;
        providerStatus?: "maintenance";
      };
      if (response.ok && payload.data && payload.data.length > 0) {
        setIsProviderActive(true);
        setIsProviderMaintenance(false);
        setProviderErrorMsg("");
      } else {
        setIsProviderActive(false);
        setIsProviderMaintenance(payload.providerStatus === "maintenance");
        setProviderErrorMsg(
          payload.error ||
            "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu.",
        );
      }
    } catch {
      setIsProviderActive(false);
      setIsProviderMaintenance(false);
      setProviderErrorMsg(
        "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu.",
      );
    }
  }

  async function loadAccount() {
    try {
      const response = await fetch("/api/account?view=summary");
      const payload = (await response.json()) as {
        authenticated?: boolean;
        role?: string;
        credits?: number;
        isPro?: boolean;
      };
      const credits = payload.credits ?? 0;
      setCreditsRemaining(credits);
      setIsAuthenticated(Boolean(payload.authenticated));
      if (payload.authenticated) {
        if (payload.role === "admin") {
          setCreditStatus(`Admin: ${credits} kredit`);
        } else if (payload.isPro) {
          setCreditStatus(`Pro: ${credits} kredit`);
        } else {
          setCreditStatus(`Saldo: ${credits} kredit`);
        }
      } else {
        setCreditStatus(`Tamu: ${credits} kredit starter`);
      }
    } catch {
      setCreditsRemaining(3);
      setIsAuthenticated(false);
      setCreditStatus("Tamu: 3 kredit starter");
    }
  }

  useEffect(() => {
    void checkProviderHealth();
    void loadAccount();
  }, []);

  function validatePrompt(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) {
      setPromptError("Brief proyek tidak boleh kosong.");
      return false;
    }
    if (trimmed.length < 15) {
      setPromptError(
        "Brief proyek terlalu singkat (minimal 15 karakter). Berikan deskripsi fitur atau sistem yang ingin dibangun.",
      );
      return false;
    }
    if (trimmed.length > 10000) {
      setPromptError("Brief proyek melebihi batas maksimal 10.000 karakter.");
      return false;
    }
    setPromptError("");
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (isGenerating) return;

    if (creditsRemaining <= 0) {
      setShowOutOfCreditsModal(true);
      toast.error(
        "Kredit Anda telah habis. Silakan daftar akun gratis atau beli paket untuk melanjutkan.",
      );
      return;
    }

    if (!validatePrompt(projectPrompt)) {
      toast.error("Mohon perbaiki brief proyek Anda terlebih dahulu.");
      return;
    }

    if (!isProviderActive) {
      toast.error("Layanan provider AI belum aktif.");
      return;
    }

    // Optimistically update account credits before and after generation
    void generateFromPrompt(projectPrompt).then((success) => {
      void loadAccount();
      if (!success && creditsRemaining <= 0) {
        setShowOutOfCreditsModal(true);
      }
    });
    setTimeout(() => {
      void loadAccount();
    }, 600);
  }

  async function copyActiveContent() {
    const text = files[activeFile];
    if (!text) {
      toast.error("Belum ada teks untuk disalin.");
      return;
    }
    if (!hasResult) {
      toast.error("Dokumen akan dapat disalin setelah Blueprint Quality Gate V2.1 lulus.");
      return;
    }
    await navigator.clipboard.writeText(text);
    toast.success(`${activeFile} berhasil disalin ke clipboard`);
  }

  function downloadActiveFile() {
    const text = files[activeFile];
    if (!text) {
      toast.error("Belum ada dokumen untuk diunduh.");
      return;
    }
    if (!hasResult) {
      toast.error("Dokumen akan dapat diunduh setelah Blueprint Quality Gate V2.1 lulus.");
      return;
    }
    downloadMarkdown(activeFile, text);
    toast.success(`${activeFile} berhasil diunduh`);
  }

  function handleDownloadZip() {
    if (!hasResult) {
      toast.error("ZIP tersedia setelah Blueprint Quality Gate V2.1 lulus.");
      return;
    }
    downloadAllAsZip(files, initialProjectName);
    toast.success("File ZIP 4 dokumen berhasil diunduh.");
  }

  function openRevisionModal() {
    setRevisionError("");
    setRevisionImpact(null);
    setRevisionScope("document");
    setShowRevisionModal(true);
  }

  async function requestRevisionPreview(scope: RevisionScope, skipImpactConfirmation = false) {
    const instruction = revisionInstruction.trim();
    if (!instruction) {
      setRevisionError("Tuliskan instruksi atau komentar revisi terlebih dahulu.");
      return;
    }
    if (instruction.length < 5) {
      setRevisionError("Instruksi revisi minimal 5 karakter.");
      return;
    }

    const impact = analyzeRevisionImpact(activeFile, instruction);
    if (scope === "document" && impact.affectedFiles.length && !skipImpactConfirmation) {
      setRevisionImpact(impact);
      return;
    }

    setRevisionError("");
    setRevisionImpact(null);
    setRevisionScope(scope);
    setIsSubmittingRevision(true);
    const preview = await prepareRevision(activeFile, instruction, scope);
    setIsSubmittingRevision(false);
    if (preview) {
      setRevisionPreview(preview);
      setShowRevisionModal(false);
    }
  }

  async function applyPreparedRevision() {
    if (!revisionPreview) return;
    setIsSubmittingRevision(true);
    const applied = await applyRevisionPreview(revisionPreview);
    setIsSubmittingRevision(false);
    if (applied) {
      setRevisionPreview(null);
      setRevisionInstruction("");
      setRevisionImpact(null);
      setRevisionScope("document");
    }
  }

  const activeContent = files[activeFile] || "";
  const lineCount = activeContent ? activeContent.split("\n").length : 0;
  const lineNumbers = Array.from({ length: lineCount }, (_, i) => i + 1);

  return (
    <main className="studio-viewport-shell">
      {/* ── Top Navbar ─────────────────────────────────────────── */}
      <header className="studio-top-navbar" aria-label="Studio Navigation">
        <div className="studio-nav-brand-group">
          <a
            href="/"
            className="studio-brand-link"
          >
            <div className="brand-logo-icon sm">
              <Layers size={18} strokeWidth={2.4} />
            </div>
            <div className="brand-title-wrap">
              <span className="studio-brand-badge">
                STUDIO WORKBENCH
              </span>
              <strong className="studio-brand-name">Dokumenku AI</strong>
            </div>
          </a>

          <div
            className={`status-pill ${!isProviderActive ? "amber" : ""}`}
          >
            <span
              className={`status-dot ${!isProviderActive ? "amber" : ""}`}
            />
            <span className="status-pill-text">
              {isGenerating
                ? "Menyusun Dokumen..."
                : isProviderActive
                  ? "Studio Siap"
                  : isProviderMaintenance
                    ? "Provider Maintenance"
                  : "Layanan Belum Aktif"}
            </span>
          </div>
        </div>

        <div className="studio-navbar-actions">
          <div className="studio-credit-badge">
            <Coins size={14} color="var(--amber)" />
            <span>{creditStatus}</span>
          </div>

          <div className="studio-quick-links">
            <a
              href="/pricing"
              className="studio-action-link"
              title="Harga"
            >
              <Tag size={14} /> <span>Harga</span>
            </a>

            <a
              href={isAuthenticated ? "/account" : "/login"}
              className="studio-action-link"
              title="Profil Akun & Riwayat"
            >
              <User size={14} /> <span>{isAuthenticated ? "Profil Akun" : "Masuk"}</span>
            </a>
          </div>
        </div>
      </header>

      {/* ── Main Studio 2-Columns Grid ─────────────────────────── */}
      <div className="studio-main-container">
        {/* Left: Brief Input Panel (~38-40%) */}
        <section
          className="studio-brief-col"
          aria-labelledby="brief-panel-title"
        >
          <div className="studio-col-header">
            <div className="studio-panel-title-row">
              <span className="studio-panel-num">01</span>
              <span className="studio-panel-label">BRIEF PROYEK</span>
            </div>
            <h2 id="brief-panel-title" className="studio-panel-heading">
              Jelaskan Ide Proyek Anda
            </h2>
          </div>

          <form onSubmit={handleSubmit} className="studio-brief-card">
            {/* Model Selector Section - Auto Only */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <div className="brief-model-header">
                <span>MESIN AI</span>
                <span className="credit-file-pill">1 Kredit = 4 File</span>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  padding: "10px 14px",
                  borderRadius: "12px",
                  background: isProviderActive
                    ? "linear-gradient(135deg, #EEF2FF 0%, #F0FDF4 100%)"
                    : "#FFF7ED",
                  border: isProviderActive
                    ? "1.5px solid #C7D2FE"
                    : "1.5px solid #FDE68A",
                  minHeight: "42px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: isProviderActive ? "var(--cobalt)" : "#F59E0B",
                    display: "grid",
                    placeItems: "center",
                    color: "#FFFFFF",
                    flexShrink: 0,
                  }}
                >
                  {isProviderActive ? (
                    <Zap size={16} strokeWidth={2.5} />
                  ) : (
                    <AlertTriangle size={16} strokeWidth={2.5} />
                  )}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "1px", minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                    <strong
                      style={{
                        fontSize: "0.88rem",
                        color: "var(--navy)",
                        fontWeight: 800,
                      }}
                    >
                      AUTO
                    </strong>
                    {isProviderActive && (
                      <span
                        style={{
                          fontSize: "0.65rem",
                          fontWeight: 700,
                          padding: "1px 6px",
                          borderRadius: "6px",
                          background: "#DCFCE7",
                          color: "#166534",
                          border: "1px solid #BBF7D0",
                        }}
                      >
                        Direkomendasikan
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.73rem",
                      color: "var(--text-muted)",
                      lineHeight: "1.3",
                    }}
                  >
                    {isProviderActive
                      ? "Sistem otomatis memilih model terbaik untuk setiap tahap dokumen."
                      : isProviderMaintenance
                        ? "Provider dalam maintenance."
                        : "Menunggu koneksi provider AI..."}
                  </span>
                </div>
              </div>

              {!isProviderActive && (
                <div className="provider-alert-amber" role="alert">
                  <AlertTriangle
                    size={16}
                    style={{ flexShrink: 0, marginTop: "1px" }}
                  />
                  <span>{providerErrorMsg}</span>
                </div>
              )}
            </div>

            {lastError && (
              <div className="provider-alert-amber" style={{ marginTop: "6px", background: "#FEF2F2", borderColor: "#FECACA", color: "#991B1B" }} role="alert">
                <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: "1px" }} />
                <span>{lastError}</span>
              </div>
            )}

            {/* Brief Input Textarea */}
            <div className="brief-input-wrap">
              <div className="brief-input-label-row">
                <label htmlFor="brief-text-input">Brief proyek Anda</label>
                <button
                  type="button"
                  className="prompt-guide-trigger"
                  onClick={() => setShowPromptGuide(true)}
                  disabled={isGenerating}
                >
                  <FileText size={13} aria-hidden="true" /> Panduan prompt lengkap
                </button>
              </div>
              <textarea
                id="brief-text-input"
                className={`brief-textarea ${promptError ? "has-error" : ""}`}
                value={projectPrompt}
                onChange={(e) => {
                  setProjectPrompt(e.target.value);
                  if (promptError) validatePrompt(e.target.value);
                }}
                onBlur={() => projectPrompt && validatePrompt(projectPrompt)}
                placeholder="Jelaskan produk, target pengguna, fitur, alur, halaman, data/integrasi, dan batasan yang Anda butuhkan..."
                disabled={isGenerating}
              />
              {promptError && (
                <span className="studio-inline-error">{promptError}</span>
              )}
            </div>

            {/* Quick Inspiration Prompts */}
            <div className="quick-prompts-section">
              <div className="quick-prompts-label">
                 <Pencil size={14} color="var(--amber)" />
                <span>Contoh Brief Cepat (format lengkap):</span>
              </div>
              <div className="quick-prompts-grid">
                {QUICK_PROMPTS.map((qp) => (
                  <button
                    key={qp.title}
                    type="button"
                    className="quick-prompt-btn"
                    onClick={() => {
                      setProjectPrompt(qp.text);
                      if (promptError) setPromptError("");
                    }}
                    disabled={isGenerating}
                  >
                    {qp.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Out of Credits Alert Banner */}
            {creditsRemaining <= 0 && (
              <div className="studio-out-of-credits-banner" role="alert" style={{ padding: "10px 14px", marginTop: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "8px", flexWrap: "wrap" }}>
                  <AlertTriangle size={15} style={{ color: "#DC2626", flexShrink: 0 }} />
                  <span style={{ fontSize: "0.8rem", color: "#991B1B", fontWeight: 600 }}>Kredit habis.</span>
                  <span style={{ fontSize: "0.76rem", color: "#7F1D1D" }}>
                    {isAuthenticated ? "Beli paket untuk melanjutkan." : "Masuk & beli paket untuk mulai."}
                  </span>
                  <a href="/pricing" className="btn-secondary" style={{ minHeight: "26px", padding: "0 10px", fontSize: "0.72rem", borderColor: "#FCA5A5", color: "#991B1B", marginLeft: "auto" }}>
                    Lihat Harga
                  </a>
                </div>
              </div>
            )}

            {/* Character Counter & Action Button */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                marginTop: "auto",
              }}
            >
              <div className="char-counter-text">
                {projectPrompt.length.toLocaleString("id-ID")} / 10.000 karakter
              </div>

              <button
                type="submit"
                className={`btn-primary ${creditsRemaining <= 0 ? "btn-out-of-credits" : ""}`}
                style={{
                  width: "100%",
                  minHeight: "46px",
                  fontSize: "0.95rem",
                  background: creditsRemaining <= 0 ? "#FEE2E2" : undefined,
                  borderColor: creditsRemaining <= 0 ? "#FCA5A5" : undefined,
                  color: creditsRemaining <= 0 ? "#991B1B" : undefined,
                }}
                disabled={isGenerating || !isProviderActive}
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="animate-spin" size={18} />
                    {qualityState === "building" && progress <= 10
                      ? `Menyiapkan Blueprint (${progress}%)...`
                      : `Menyusun Dokumen (${progress}%)...`}
                  </>
                ) : creditsRemaining <= 0 ? (
                  <>
                    <AlertTriangle size={18} color="#DC2626" />
                    Kredit Habis — Isi Ulang / Daftar
                  </>
                ) : (
                  <>
                    <FileText size={18} />
                    Buat 4 Dokumen Sekaligus
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Right: Output Blueprint Panel (~60-62%) */}
        <section
          className="studio-output-col"
          aria-labelledby="output-panel-title"
        >
          <div className="studio-col-header-right">
            <div className="studio-col-title-wrap">
              <div className="studio-panel-title-row">
                <span className="studio-panel-num">02</span>
                <span className="studio-panel-label">OUTPUT BLUEPRINT</span>
              </div>
              <h2
                id="output-panel-title"
                className="studio-panel-heading"
              >
                Empat Dokumen Proyek
              </h2>
            </div>

            <button
              type="button"
              className="btn-secondary studio-zip-btn"
              onClick={handleDownloadZip}
              disabled={!hasResult}
            >
              <Download size={14} /> <span>Unduh Semua (.ZIP)</span>
            </button>
          </div>

          <div className="studio-output-card">
            {/* Top Status */}
            <div className="output-status-bar">
              {qualityState === "passed" ? <Shield size={14} /> : <Clock size={14} />}
              <span>
                {isGenerating
                  ? qualityState === "building" && progress <= 10
                    ? "MENYUSUN BLUEPRINT INTERNAL..."
                    : qualityState === "validating"
                      ? "BLUEPRINT QUALITY GATE V2 MEMERIKSA..."
                      : `SEDANG MENULIS ${activeFile} (${progress}%)`
                  : hasResult
                    ? qualityReport
                      ? `QUALITY GATE V2 LULUS · ${qualityReport.score}%`
                      : "DOKUMEN LENGKAP"
                    : qualityState === "failed"
                      ? "QUALITY GATE V2 PERLU PERBAIKAN"
                      : "MENUNGGU BRIEF"}
              </span>
            </div>

            {/* 4 Tabs Bar */}
            <div className="studio-tabs-row" role="tablist">
              {FILES.map((file) => {
                const isActive = activeFile === file.name;
                const hasDocContent = Boolean(
                  files[file.name]?.trim().length > 0,
                );
                return (
                  <button
                    key={file.name}
                    type="button"
                    role="tab"
                    aria-selected={isActive}
                    className={`studio-tab-button ${isActive ? "active" : ""}`}
                    onClick={() => setActiveFile(file.name)}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        width: "100%",
                      }}
                    >
                      <strong>{file.short}</strong>
                      {hasDocContent && !isActive && (
                        <span
                          style={{
                            width: "6px",
                            height: "6px",
                            borderRadius: "50%",
                            background: "var(--teal)",
                          }}
                        />
                      )}
                    </div>
                    <span>{file.description}</span>
                  </button>
                );
              })}
            </div>

            {/* Inner Header Bar */}
            <div className="doc-inner-header">
              <div className="doc-inner-title">
                <FileText size={16} color="var(--cobalt)" />
                <span>{activeFile}</span>
              </div>

              <div className="doc-inner-actions">
                <button
                  type="button"
                  className={`btn-secondary ${isEditMode ? "active" : ""}`}
                  style={{
                    minHeight: "30px",
                    padding: "0 10px",
                    fontSize: "0.74rem",
                    background: isEditMode ? "var(--cobalt-light)" : undefined,
                    borderColor: isEditMode ? "var(--cobalt)" : undefined,
                    color: isEditMode ? "var(--cobalt)" : undefined,
                  }}
                  onClick={() => setIsEditMode(!isEditMode)}
                  disabled={!activeContent && !isEditMode}
                  title={isEditMode ? "Beralih ke Pratinjau" : "Edit Markdown secara langsung"}
                >
                  {isEditMode ? <Eye size={13} /> : <Edit3 size={13} />}
                  <span>{isEditMode ? "Pratinjau" : "Edit Manual"}</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    minHeight: "30px",
                    padding: "0 10px",
                    fontSize: "0.74rem",
                    color: "var(--cobalt)",
                  }}
                  onClick={openRevisionModal}
                  disabled={!activeContent || isGenerating}
                  title="Minta AI merevisi dokumen ini berdasarkan instruksi Anda"
                >
                  <MessageSquarePlus size={13} />
                  <span>Revisi AI</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    minHeight: "30px",
                    padding: "0 10px",
                    fontSize: "0.74rem",
                  }}
                  onClick={copyActiveContent}
                  disabled={!activeContent || !hasResult}
                  title="Salin isi dokumen"
                >
                  <Clipboard size={13} /> <span>Salin</span>
                </button>

                <button
                  type="button"
                  className="btn-secondary"
                  style={{
                    minHeight: "30px",
                    padding: "0 10px",
                    fontSize: "0.74rem",
                  }}
                  onClick={downloadActiveFile}
                  disabled={!activeContent || !hasResult}
                  title="Unduh file .MD"
                >
                  <Download size={13} /> <span>Unduh .MD</span>
                </button>
              </div>
            </div>

            {/* Document Content View with Line Gutter */}
            <div className="doc-content-container">
              {isLoadingDocs ? (
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "60px 24px", color: "var(--text-muted, #64748B)" }}>
                  <div style={{ width: "36px", height: "36px", border: "3px solid #E2E8F0", borderTopColor: "var(--cobalt, #2563EB)", borderRadius: "50%", animation: "spin 0.8s linear infinite", marginBottom: "12px" }} />
                  <span style={{ fontSize: "0.88rem", fontWeight: 600 }}>Memuat dokumen proyek...</span>
                </div>
              ) : (
              <div className="doc-scrollable-paper">
                {isEditMode ? (
                  <div className="doc-editor-wrap">
                    <div className="doc-editor-bar">
                      <span>Mode Editor Markdown Aktif</span>
                      <span style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        Perubahan langsung tersimpan ke dokumen
                      </span>
                    </div>
                    <textarea
                      className="doc-markdown-textarea"
                      value={activeContent}
                      onChange={(e) => updateFileContent(activeFile, e.target.value)}
                      placeholder={`Ketik atau edit isi dokumen ${activeFile} di sini...`}
                      spellCheck={false}
                    />
                  </div>
                ) : activeContent ? (
                  <div className="doc-paper-layout">
                    <div className="doc-line-gutter" aria-hidden="true">
                      {lineNumbers.map((num) => (
                        <div key={num} className="line-num-cell">
                          {num}
                        </div>
                      ))}
                    </div>

                    <div
                      className="doc-markdown-body markdown-body"
                      style={{ fontSize: "0.9rem", color: "var(--navy)" }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {activeContent}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  <div className="doc-empty-state">
                    <div className="doc-empty-illustration">
                      <FileText size={32} />
                      <span
                        style={{
                          fontSize: "0.75rem",
                          color: "var(--cobalt)",
                          marginTop: "-4px",
                        }}
                      >
                        &lt;/&gt;
                      </span>
                    </div>
                    <h3>Dokumen {activeFile}</h3>
                    <p>
                      Dokumen ini akan disusun secara otomatis dan ditampilkan
                      di sini saat brief proyek mulai diproses.
                    </p>
                  </div>
                )}
              </div>
              )}
            </div>

            {/* Bottom Status Footer Bar */}
            <div className="studio-output-footer-bar">
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  fontSize: "0.76rem",
                }}
              >
                <span
                  className={`status-dot ${isGenerating ? "amber" : ""}`}
                />
                <span>
                  {isGenerating
                    ? "Sedang memproses dokumen secara real-time..."
                    : isEditMode
                      ? "Mode Edit Manual — Perubahan otomatis tersimpan"
                      : "Siap menerima brief proyek atau revisi"}
                </span>
              </div>
              <span style={{ fontSize: "0.74rem", color: "var(--text-muted)" }}>
                {isEditMode ? "Live Editor" : "Markdown Preview"}
              </span>
            </div>
          </div>
        </section>
      </div>

      {/* ── Modal Panduan Prompt ───────────────────────────────── */}
      {showPromptGuide && (
        <div className="studio-modal-backdrop" onClick={() => setShowPromptGuide(false)}>
          <div
            className="studio-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="prompt-guide-modal-title"
          >
            <div className="studio-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <FileText size={18} color="var(--cobalt)" />
                <strong id="prompt-guide-modal-title" style={{ fontSize: "1.05rem", color: "var(--navy)" }}>
                  Panduan Brief Terstruktur
                </strong>
              </div>
              <button type="button" className="studio-modal-close" onClick={() => setShowPromptGuide(false)}>
                ✕
              </button>
            </div>

            <div className="studio-modal-body prompt-guide-modal-body">
              <p>
                Contoh brief cepat menggunakan format yang sama di bawah ini. Anda boleh mengisi sesingkat atau selengkap yang diperlukan; bagian yang belum pasti dapat ditulis sebagai asumsi atau pertanyaan.
              </p>
              <ol className="prompt-guide-modal-list">
                <li><strong>Nama / jenis produk:</strong> jelaskan produk atau layanan yang ingin dibuat.</li>
                <li><strong>Target pengguna, masalah, dan tujuan:</strong> siapa yang memakai serta hasil yang ingin dicapai.</li>
                <li><strong>Fitur, role, dan alur utama:</strong> prioritas kebutuhan dan perjalanan pengguna inti.</li>
                <li><strong>Halaman dan pengalaman pengguna:</strong> layar penting, platform, dan preferensi desain.</li>
                <li><strong>Data, integrasi, dan teknologi:</strong> data yang dikelola serta layanan yang perlu terhubung.</li>
                <li><strong>Aturan bisnis, keamanan, dan batasan:</strong> validasi, hak akses, compliance, atau ketentuan khusus.</li>
              </ol>
              <div className="prompt-guide-tip">
                Anda tidak harus mengisi semua bagian. Cukup jelaskan informasi yang sudah Anda tahu; sistem akan menandai detail lain sebagai asumsi untuk dikonfirmasi.
              </div>
            </div>

            <div className="studio-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setShowPromptGuide(false)}>
                Tutup
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setProjectPrompt((current) => current.trim() ? `${current.trim()}\n\n${FULL_BRIEF_TEMPLATE}` : FULL_BRIEF_TEMPLATE);
                  setPromptError("");
                  setShowPromptGuide(false);
                }}
              >
                Tambahkan Format ke Brief
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Dialog Revisi AI ──────────────────────────────── */}
      {showRevisionModal && (
        <div
          className="studio-modal-backdrop"
          onClick={() => !isSubmittingRevision && setShowRevisionModal(false)}
        >
          <div
            className="studio-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="revision-modal-title"
          >
            <div className="studio-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <MessageSquarePlus size={18} color="var(--cobalt)" />
                <strong id="revision-modal-title" style={{ fontSize: "1.05rem", color: "var(--navy)" }}>
                  Revisi {activeFile} dengan AI
                </strong>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={() => setShowRevisionModal(false)}
                disabled={isSubmittingRevision}
              >
                ✕
              </button>
            </div>

            <div className="studio-modal-body">
              <p style={{ fontSize: "0.84rem", color: "var(--text-muted)", margin: "0 0 12px", lineHeight: "1.5" }}>
                Tulis perubahan yang ingin diterapkan pada <strong>{activeFile}</strong>. AI akan menganalisis dampaknya dan menjaga konsistensi dengan blueprint proyek.
              </p>

              <textarea
                className={`studio-revision-textarea ${revisionError ? "has-error" : ""}`}
                rows={4}
                value={revisionInstruction}
                onChange={(e) => {
                  setRevisionInstruction(e.target.value);
                  if (revisionError) setRevisionError("");
                  if (revisionImpact) setRevisionImpact(null);
                }}
                placeholder={`Contoh: ${REVISION_QUICK_PROMPTS[activeFile][0]?.instruction}`}
                disabled={isSubmittingRevision}
                autoFocus
              />
              {revisionError && (
                <span className="studio-inline-error">{revisionError}</span>
              )}

              <div className="studio-revision-hints">
                <span style={{ fontSize: "0.74rem", fontWeight: 700, color: "var(--text-muted)" }}>
                  💡 Contoh instruksi cepat:
                </span>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginTop: "4px" }}>
                  {REVISION_QUICK_PROMPTS[activeFile].map((prompt) => (
                    <button
                      key={prompt.label}
                      type="button"
                      className="hint-chip"
                      onClick={() => {
                        setRevisionInstruction(prompt.instruction);
                        setRevisionImpact(null);
                        if (revisionError) setRevisionError("");
                      }}
                      disabled={isSubmittingRevision}
                    >
                      + {prompt.label}
                    </button>
                  ))}
                </div>
              </div>

              <fieldset style={{ border: 0, padding: 0, margin: "18px 0 0" }}>
                <legend style={{ fontSize: "0.78rem", fontWeight: 800, color: "var(--navy)", marginBottom: "8px" }}>
                  Cakupan Revisi
                </legend>
                <label style={{ display: "flex", gap: "9px", alignItems: "flex-start", cursor: "pointer", marginBottom: "10px" }}>
                  <input
                    type="radio"
                    name="revision-scope"
                    checked={revisionScope === "document"}
                    onChange={() => {
                      setRevisionScope("document");
                      setRevisionImpact(null);
                    }}
                    disabled={isSubmittingRevision}
                  />
                  <span>
                    <strong style={{ display: "block", fontSize: "0.82rem", color: "var(--navy)" }}>Dokumen ini saja</strong>
                    <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>Hanya {activeFile} yang akan diperbarui.</span>
                  </span>
                </label>
                <label style={{ display: "flex", gap: "9px", alignItems: "flex-start", cursor: "pointer" }}>
                  <input
                    type="radio"
                    name="revision-scope"
                    checked={revisionScope === "related"}
                    onChange={() => {
                      setRevisionScope("related");
                      setRevisionImpact(null);
                    }}
                    disabled={isSubmittingRevision}
                  />
                  <span>
                    <strong style={{ display: "block", fontSize: "0.82rem", color: "var(--navy)" }}>Sinkronkan dokumen terkait</strong>
                    <span style={{ fontSize: "0.76rem", color: "var(--text-muted)" }}>AI memperbarui dokumen lain hanya bila perubahan memengaruhi PRD, Tech Stack, UI/UX, atau schema.</span>
                  </span>
                </label>
              </fieldset>

              {revisionImpact && (
                <div role="alert" style={{ marginTop: "16px", padding: "12px", borderRadius: "10px", border: "1px solid #BFDBFE", background: "#EFF6FF" }}>
                  <strong style={{ display: "block", fontSize: "0.82rem", color: "#1E3A8A", marginBottom: "7px" }}>Perubahan ini juga memengaruhi:</strong>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "7px" }}>
                    {revisionImpact.affectedFiles.map((file) => (
                      <span key={file} style={{ fontSize: "0.73rem", fontWeight: 700, color: "#1D4ED8", background: "#DBEAFE", borderRadius: "999px", padding: "3px 8px" }}>✓ {file}</span>
                    ))}
                  </div>
                  <span style={{ display: "block", fontSize: "0.75rem", color: "#475569", lineHeight: "1.45" }}>{revisionImpact.reasons.join("; ")}.</span>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginTop: "10px" }}>
                    <button type="button" className="btn-secondary" onClick={() => void requestRevisionPreview("document", true)} disabled={isSubmittingRevision}>
                      Revisi {activeFile.replace(".md", "")} saja
                    </button>
                    <button type="button" className="btn-primary" onClick={() => void requestRevisionPreview("related", true)} disabled={isSubmittingRevision}>
                      Sinkronkan {revisionImpact.affectedFiles.length + 1} Dokumen
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="studio-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setShowRevisionModal(false);
                  setRevisionImpact(null);
                }}
                disabled={isSubmittingRevision}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void requestRevisionPreview(revisionScope)}
                disabled={isSubmittingRevision || !revisionInstruction.trim()}
              >
                {isSubmittingRevision ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Menyiapkan Perubahan...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Lihat Perubahan</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {revisionPreview && (
        <div
          className="studio-modal-backdrop"
          onClick={() => !isSubmittingRevision && setRevisionPreview(null)}
        >
          <div
            className="studio-modal-card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="revision-preview-title"
            style={{ maxWidth: "760px" }}
          >
            <div className="studio-modal-header">
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <Eye size={18} color="var(--cobalt)" />
                <strong id="revision-preview-title" style={{ fontSize: "1.05rem", color: "var(--navy)" }}>
                  Perubahan siap diterapkan
                </strong>
              </div>
              <button
                type="button"
                className="studio-modal-close"
                onClick={() => setRevisionPreview(null)}
                disabled={isSubmittingRevision}
              >
                ✕
              </button>
            </div>

            <div className="studio-modal-body" style={{ maxHeight: "62vh", overflowY: "auto" }}>
              <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", margin: "0 0 12px", lineHeight: "1.5" }}>
                Tinjau draft dari AI sebelum disimpan. Dokumen asli tidak berubah sampai Anda memilih <strong>Terapkan</strong>.
              </p>
              {revisionPreview.scope === "document" && revisionPreview.impact.affectedFiles.length > 0 && (
                <div role="alert" style={{ marginBottom: "12px", padding: "10px 12px", borderRadius: "9px", background: "#FFFBEB", border: "1px solid #FDE68A", color: "#92400E", fontSize: "0.78rem", lineHeight: "1.45" }}>
                  Perubahan {Object.keys(revisionPreview.after).join(", ")} berpotensi memengaruhi {revisionPreview.impact.affectedFiles.join(", ")}. Quality Gate akan memeriksa konsistensi saat revisi diterapkan.
                </div>
              )}
              {Object.entries(revisionPreview.after).map(([fileName, after]) => {
                const file = fileName as FileName;
                const before = revisionPreview.before[file] || "";
                const diff = createLineDiff(before, after);
                return (
                  <section key={file} style={{ marginBottom: "16px" }}>
                    <strong style={{ display: "block", fontSize: "0.84rem", color: "var(--navy)", marginBottom: "7px" }}>{file}</strong>
                    <pre style={{ margin: 0, padding: "10px 12px", borderRadius: "9px", background: "#0F172A", color: "#E2E8F0", fontSize: "0.72rem", lineHeight: "1.55", overflowX: "auto", whiteSpace: "pre-wrap" }}>
                      {diff.map((line, index) => (
                        <span
                          key={`${line.kind}-${index}-${line.value}`}
                          style={{ display: "block", color: line.kind === "added" ? "#86EFAC" : line.kind === "removed" ? "#FCA5A5" : "#94A3B8" }}
                        >
                          {line.kind === "added" ? "+ " : line.kind === "removed" ? "- " : "  "}{line.value}
                        </span>
                      ))}
                    </pre>
                  </section>
                );
              })}
            </div>

            <div className="studio-modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setRevisionPreview(null)} disabled={isSubmittingRevision}>
                Batalkan
              </button>
              <button type="button" className="btn-primary" onClick={() => void applyPreparedRevision()} disabled={isSubmittingRevision}>
                {isSubmittingRevision ? (
                  <><Loader2 size={14} className="animate-spin" /><span>Menyimpan Revisi...</span></>
                ) : (
                  <><Send size={14} /><span>Terapkan</span></>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal Dialog Peringatan Kredit Habis ─────────────────── */}
      {showOutOfCreditsModal && (
        <div
          className="studio-modal-backdrop"
          onClick={() => setShowOutOfCreditsModal(false)}
        >
          <div
            className="studio-modal-card"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="out-of-credits-title"
            style={{ maxWidth: "480px", textAlign: "center" }}
          >
            <div style={{ padding: "28px 24px 16px", display: "flex", flexDirection: "column", alignItems: "center" }}>
              <div
                style={{
                  width: "56px",
                  height: "56px",
                  borderRadius: "16px",
                  background: "#FEE2E2",
                  border: "1.5px solid #FCA5A5",
                  display: "grid",
                  placeItems: "center",
                  color: "#DC2626",
                  marginBottom: "14px",
                }}
              >
                <AlertTriangle size={28} strokeWidth={2.4} />
              </div>

              <strong id="out-of-credits-title" style={{ fontSize: "1.25rem", color: "var(--navy)", marginBottom: "6px" }}>
                Kredit Anda Telah Habis
              </strong>

              <p style={{ fontSize: "0.86rem", color: "var(--text-muted)", margin: "0 0 16px", lineHeight: "1.55" }}>
                {isAuthenticated
                  ? "Saldo kredit pada akun Anda telah mencapai 0. Beli paket kredit tambahan untuk menyusun paket 4 dokumen proyek baru."
                  : "Silakan masuk atau daftar akun, lalu beli paket Pro Studio untuk mulai generate dokumen."}
              </p>

              <div
                style={{
                  width: "100%",
                  background: "#FAFCFE",
                  border: "1px solid var(--border-light)",
                  borderRadius: "12px",
                  padding: "14px 16px",
                  textAlign: "left",
                  marginBottom: "8px",
                }}
              >
                <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--navy)", display: "block", marginBottom: "6px" }}>
                  💡 Fitur yang tetap bisa Anda gunakan:
                </span>
                <ul style={{ margin: 0, paddingLeft: "18px", fontSize: "0.76rem", color: "var(--text-muted)", lineHeight: "1.6" }}>
                  <li>Dokumen yang telah dibuat tetap dapat di-<strong>Edit Manual</strong>.</li>
                  <li>Unduh file .MD atau semua dokumen (.ZIP) tetap <strong>Gratis</strong>.</li>
                  <li>Paket Pro Studio mulai Rp 20.000 (100 Kredit tanpa langganan).</li>
                </ul>
              </div>
            </div>

            <div className="studio-modal-footer" style={{ justifyContent: "center", gap: "10px", padding: "14px 24px 20px" }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowOutOfCreditsModal(false)}
              >
                Tutup
              </button>
              {!isAuthenticated && (
                <a href="/login" className="btn-primary">
                  Daftar Akun Gratis
                </a>
              )}
              <a
                href="/pricing"
                className="btn-primary"
                style={{ background: "var(--navy)" }}
              >
                Lihat Paket Harga
              </a>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
