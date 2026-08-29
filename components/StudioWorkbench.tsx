"use client";

import { useState, useEffect, useRef } from "react";
import {
  Layers,
  Tag,
  User,
  Shield,
  Coins,
  Cpu,
  ChevronDown,
  Lightbulb,
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
} from "lucide-react";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { useDocumentGenerator } from "@/hooks/useDocumentGenerator";
import { downloadMarkdown, FILES } from "@/lib/stream-parser";
import { downloadAllAsZip } from "@/lib/export";
import type { FileName } from "@/lib/types";

type ModelOption = {
  id: string;
  name: string;
  tier?: "starter" | "pro";
  badge?: string;
  isFlagship?: boolean;
  successRate?: string;
  healthStatus?: "healthy" | "degraded" | "unknown";
};

const QUICK_PROMPTS = [
  {
    title: "QR Absensi Siswa",
    text: "Website manajemen absensi QR untuk sekolah. Admin mengelola kelas, data siswa, dan sesi absensi; siswa melakukan scan barcode presensi dan melihat riwayat kehadiran. Gunakan Next.js, TypeScript, Tailwind, dan PostgreSQL dengan arsitektur role-based access.",
  },
  {
    title: "POS Kasir & Stok",
    text: "Sistem Point of Sale (POS) cloud untuk coffee shop dan restoran. Kasir cepat dengan cetak struk Bluetooth & WhatsApp, manajemen meja, stok bahan baku berkurang otomatis, laporan laba harian, dan dashboard owner multi-cabang.",
  },
  {
    title: "SaaS AI Document Chat",
    text: "Platform SaaS AI untuk analisis dokumen PDF & ekstraksi data cerdas. Pengguna upload PDF, melakukan tanya jawab berbasis RAG dengan sumber kutipan, dan ekspor ringkasan ke Excel/Word.",
  },
  {
    title: "Marketplace Jasa Lokal",
    text: "Platform marketplace jasa freelance lokal dengan escrow payment, milestone tracking, real-time chat, review rating, dan sistem verifikasi identitas freelancer.",
  },
];

type StudioWorkbenchProps = {
  initialPrompt?: string;
  onBackToHome?: () => void;
};

export default function StudioWorkbench({
  initialPrompt = "",
  onBackToHome,
}: StudioWorkbenchProps) {
  const [projectPrompt, setProjectPrompt] = useState(initialPrompt);
  const [availableModels, setAvailableModels] = useState<ModelOption[]>([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [isLoadingModels, setIsLoadingModels] = useState(true);
  const [isProviderActive, setIsProviderActive] = useState(false);
  const [providerErrorMsg, setProviderErrorMsg] = useState("");
  const [creditStatus, setCreditStatus] = useState("Memeriksa status kredit...");
  const [isUserPro, setIsUserPro] = useState(false);

  const [creditsRemaining, setCreditsRemaining] = useState<number>(3);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [showOutOfCreditsModal, setShowOutOfCreditsModal] = useState<boolean>(false);
  const [promptError, setPromptError] = useState<string>("");
  const [revisionError, setRevisionError] = useState<string>("");

  const [isEditMode, setIsEditMode] = useState(false);
  const [showRevisionModal, setShowRevisionModal] = useState(false);
  const [revisionInstruction, setRevisionInstruction] = useState("");
  const [isSubmittingRevision, setIsSubmittingRevision] = useState(false);

  const {
    files,
    isGenerating,
    progress,
    activeFile,
    hasResult,
    lastError,
    setActiveFile,
    updateFileContent,
    reviseDocument,
    generateFromPrompt,
    resetAll,
  } = useDocumentGenerator();

  useEffect(() => {
    if (initialPrompt) {
      setProjectPrompt(initialPrompt);
    }
  }, [initialPrompt]);

  async function loadModels() {
    setIsLoadingModels(true);
    try {
      const response = await fetch("/api/models");
      const payload = (await response.json()) as {
        data?: ModelOption[];
        isPro?: boolean;
        error?: string;
      };
      if (response.ok && payload.data && payload.data.length > 0) {
        const userPro = Boolean(payload.isPro);
        setIsUserPro(userPro);
        const models = payload.data.filter((m) => Boolean(m.id));
        setAvailableModels(models);

        // Auto-select 100% healthy active model (deepseek-v4-flash-0731 for Starter, glm-5.3/mod for Pro)
        let defaultModel = "";
        if (userPro) {
          const healthyFlagship = models.find((m) => m.isFlagship && m.healthStatus === "healthy");
          defaultModel = healthyFlagship?.id || models.find((m) => m.isFlagship)?.id || models[0]?.id;
        } else {
          const healthyStarter = models.find((m) => !m.isFlagship && m.healthStatus === "healthy");
          defaultModel = healthyStarter?.id || models.find((m) => !m.isFlagship)?.id || models[0]?.id;
        }

        setSelectedModel(defaultModel ?? "");
        setIsProviderActive(true);
        setProviderErrorMsg("");
      } else {
        setIsProviderActive(false);
        setAvailableModels([]);
        setSelectedModel("");
        setProviderErrorMsg(
          payload.error ||
            "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu.",
        );
      }
    } catch {
      setIsProviderActive(false);
      setAvailableModels([]);
      setSelectedModel("");
      setProviderErrorMsg(
        "Layanan belum aktif. Admin perlu menyelesaikan konfigurasi provider terlebih dahulu.",
      );
    } finally {
      setIsLoadingModels(false);
    }
  }

  async function loadAccount() {
    try {
      const response = await fetch("/api/account");
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
          setIsUserPro(true);
        } else if (payload.isPro) {
          setCreditStatus(`Pro: ${credits} kredit`);
          setIsUserPro(true);
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
    void loadModels();
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
    if (trimmed.length > 5000) {
      setPromptError("Brief proyek melebihi batas maksimal 5.000 karakter.");
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

    if (!isProviderActive || !selectedModel) {
      toast.error("Layanan provider AI belum aktif atau model belum dipilih.");
      return;
    }

    const targetModel = availableModels.find((m) => m.id === selectedModel);
    if (availableModels.length > 0 && !targetModel) {
      toast.error(`Model AI '${selectedModel}' tidak ditemukan atau sedang dinonaktifkan di provider. Silakan pilih model lain.`);
      return;
    }

    if (targetModel?.isFlagship && !isUserPro) {
      toast.warning(
        `Model Flagship '${targetModel.name}' eksklusif untuk akun Pro Studio. Silakan gunakan model Starter atau beli paket Pro Studio.`,
      );
      return;
    }

    // Optimistically update account credits before and after generation
    void generateFromPrompt(projectPrompt, selectedModel).then((success) => {
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
    await navigator.clipboard.writeText(text);
    toast.success(`${activeFile} berhasil disalin ke clipboard`);
  }

  function downloadActiveFile() {
    const text = files[activeFile];
    if (!text) {
      toast.error("Belum ada dokumen untuk diunduh.");
      return;
    }
    downloadMarkdown(activeFile, text);
    toast.success(`${activeFile} berhasil diunduh`);
  }

  function handleDownloadZip() {
    const hasAnyContent = FILES.some(
      ({ name }) => files[name]?.trim().length > 0,
    );
    if (!hasAnyContent) {
      toast.error("Belum ada dokumen yang siap diunduh.");
      return;
    }
    downloadAllAsZip(files);
    toast.success("File ZIP 4 dokumen berhasil diunduh.");
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
            {/* Model Selector Section */}
            <div
              style={{ display: "flex", flexDirection: "column", gap: "6px" }}
            >
              <div className="brief-model-header">
                <span>ENGINE MODEL AI</span>
                <span className="credit-file-pill">1 Kredit = 4 File</span>
              </div>

              <div className="model-dropdown-wrap">
                <Cpu size={16} className="model-chip-icon" />
                <select
                  value={selectedModel}
                  onChange={(e) => {
                    const val = e.target.value;
                    const m = availableModels.find((item) => item.id === val);
                    if (m?.isFlagship && !isUserPro) {
                      toast.warning(
                        "Model Flagship eksklusif untuk akun Pro Studio. Silakan pilih model Starter atau upgrade paket.",
                      );
                      return;
                    }
                    if (m?.healthStatus === "degraded") {
                      toast.warning(
                        `⚠️ Provider upstream mencatat model '${m.name}' sedang mengalami gangguan (0% success). Disarankan beralih ke 'deepseek-v4-flash-0731' (Starter) atau 'glm-5.3' (Pro).`,
                      );
                    }
                    setSelectedModel(val);
                  }}
                  disabled={!isProviderActive || availableModels.length === 0}
                  aria-label="Pilih model AI"
                >
                  {isProviderActive && availableModels.length > 0 ? (
                    <>
                      <optgroup label="🟢 Model Aktif & Siap Pakai (100% Online)">
                        {availableModels
                          .filter((m) => m.healthStatus === "healthy")
                          .map((m) => (
                            <option
                              key={m.id}
                              value={m.id}
                              disabled={m.isFlagship && !isUserPro}
                            >
                              🟢 {m.name} {m.isFlagship ? (isUserPro ? "(Pro Flagship • 100%)" : "(🔒 Butuh Pro)") : "(Starter • 100%)"}
                            </option>
                          ))}
                      </optgroup>
                      <optgroup label="⚠️ Model Offline / Gangguan di Provider (0% Down)">
                        {availableModels
                          .filter((m) => m.healthStatus !== "healthy")
                          .map((m) => (
                            <option
                              key={m.id}
                              value={m.id}
                              disabled={true}
                            >
                              ⚠️ {m.name} (Offline di Provider Upstream)
                            </option>
                          ))}
                      </optgroup>
                    </>
                  ) : (
                    <option value="">Layanan belum aktif</option>
                  )}
                </select>
                <ChevronDown size={16} className="chevron-icon" />
              </div>

              {isProviderActive ? (
                availableModels.find((m) => m.id === selectedModel)?.healthStatus === "degraded" ? (
                  <div className="provider-alert-amber" style={{ marginTop: "4px" }} role="alert">
                    <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: "1px" }} />
                    <span>
                      Server upstream melaporkan model ini 0% success (downtime). Disarankan beralih ke <strong>deepseek-v4-flash</strong> (Starter) atau <strong>glm-5.3</strong> (Pro).
                    </span>
                  </div>
                ) : (
                  <div className="provider-status-msg">
                    <span className="status-dot" />
                    <span>
                      {availableModels.find((m) => m.id === selectedModel)?.healthStatus === "healthy"
                        ? `Model ${availableModels.find((m) => m.id === selectedModel)?.name} aktif 100% & siap memproses brief.`
                        : "Model AI terpilih siap memproses brief rekayasa."}
                    </span>
                  </div>
                )
              ) : (
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
              <label htmlFor="brief-text-input">Brief proyek Anda</label>
              <textarea
                id="brief-text-input"
                className={`brief-textarea ${promptError ? "has-error" : ""}`}
                value={projectPrompt}
                onChange={(e) => {
                  setProjectPrompt(e.target.value);
                  if (promptError) validatePrompt(e.target.value);
                }}
                onBlur={() => projectPrompt && validatePrompt(projectPrompt)}
                placeholder="Contoh: Buat aplikasi absensi siswa menggunakan QR Code dan GPS..."
                disabled={isGenerating}
              />
              {promptError && (
                <span className="studio-inline-error">{promptError}</span>
              )}
            </div>

            {/* Quick Inspiration Prompts */}
            <div className="quick-prompts-section">
              <div className="quick-prompts-label">
                <Lightbulb size={14} color="var(--amber)" />
                <span>Contoh Prompt Cepat:</span>
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
                {projectPrompt.length.toLocaleString("id-ID")} karakter
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
                    Menyusun Dokumen ({progress}%)...
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
              disabled={
                !hasResult &&
                !FILES.some(({ name }) => files[name]?.trim().length > 0)
              }
            >
              <Download size={14} /> <span>Unduh Semua (.ZIP)</span>
            </button>
          </div>

          <div className="studio-output-card">
            {/* Top Status */}
            <div className="output-status-bar">
              <Clock size={14} />
              <span>
                {isGenerating
                  ? `SEDANG MENULIS ${activeFile} (${progress}%)`
                  : hasResult
                    ? "DOKUMEN LENGKAP"
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
                  onClick={() => setShowRevisionModal(true)}
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
                  disabled={!activeContent}
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
                  disabled={!activeContent}
                  title="Unduh file .MD"
                >
                  <Download size={13} /> <span>Unduh .MD</span>
                </button>
              </div>
            </div>

            {/* Document Content View with Line Gutter */}
            <div className="doc-content-container">
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
                Tulis instruksi atau komentar revisi yang ingin Anda terapkan pada dokumen <strong>{activeFile}</strong>. AI akan merevisi dan memperbarui dokumen ini tanpa mengubah dokumen lainnya.
              </p>

              <textarea
                className={`studio-revision-textarea ${revisionError ? "has-error" : ""}`}
                rows={4}
                value={revisionInstruction}
                onChange={(e) => {
                  setRevisionInstruction(e.target.value);
                  if (revisionError) setRevisionError("");
                }}
                placeholder="Contoh: Tambahkan flow integrasi Payment Gateway Midtrans, webhook pembayaran, dan penanganan status gagal bayar..."
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
                  <button
                    type="button"
                    className="hint-chip"
                    onClick={() => {
                      setRevisionInstruction(
                        "Tambahkan detail arsitektur keamanan, otentikasi JWT/OAuth, dan role permission yang lebih spesifik.",
                      );
                      if (revisionError) setRevisionError("");
                    }}
                  >
                    + Keamanan & Role
                  </button>
                  <button
                    type="button"
                    className="hint-chip"
                    onClick={() => {
                      setRevisionInstruction(
                        "Tambahkan integrasi Payment Gateway (Midtrans/Xendit) dengan alur checkout dan webhook.",
                      );
                      if (revisionError) setRevisionError("");
                    }}
                  >
                    + Payment Gateway
                  </button>
                  <button
                    type="button"
                    className="hint-chip"
                    onClick={() => {
                      setRevisionInstruction(
                        "Perjelas edge cases, penanganan galat jaringan, dan mekanisme retry policy.",
                      );
                      if (revisionError) setRevisionError("");
                    }}
                  >
                    + Error Handling
                  </button>
                </div>
              </div>
            </div>

            <div className="studio-modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowRevisionModal(false)}
                disabled={isSubmittingRevision}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={async () => {
                  const trimmed = revisionInstruction.trim();
                  if (!trimmed) {
                    setRevisionError("Tuliskan instruksi atau komentar revisi terlebih dahulu.");
                    return;
                  }
                  if (trimmed.length < 5) {
                    setRevisionError("Instruksi revisi minimal 5 karakter.");
                    return;
                  }
                  const targetModel = availableModels.find((m) => m.id === selectedModel);
                  if (targetModel?.isFlagship && !isUserPro) {
                    toast.warning(
                      `Model Flagship '${targetModel.name}' eksklusif untuk akun Pro Studio. Silakan gunakan model Starter atau upgrade paket.`,
                    );
                    return;
                  }

                  setRevisionError("");
                  setIsSubmittingRevision(true);
                  setShowRevisionModal(false);
                  await reviseDocument(
                    activeFile,
                    trimmed,
                    selectedModel,
                  );
                  setRevisionInstruction("");
                  setIsSubmittingRevision(false);
                }}
                disabled={isSubmittingRevision || !revisionInstruction.trim()}
              >
                {isSubmittingRevision ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    <span>Sedang Merevisi...</span>
                  </>
                ) : (
                  <>
                    <Send size={14} />
                    <span>Terapkan Revisi AI</span>
                  </>
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
