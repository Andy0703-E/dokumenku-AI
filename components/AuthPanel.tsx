"use client";

import { useState } from "react";
import {
  Layers,
  Home,
  FileText,
  Cpu,
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User,
  UserPlus,
  LogIn,
  Check,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { toast } from "sonner";
import { generateDeviceFingerprint } from "@/lib/device-fingerprint";

type AuthMode = "login" | "register";

type AuthPanelProps = {
  initialMode?: AuthMode;
};

export default function AuthPanel({ initialMode = "login" }: AuthPanelProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [loginError, setLoginError] = useState("");

  function validateEmail(val: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!val.trim()) {
      setEmailError("Email tidak boleh kosong.");
      return false;
    }
    if (!emailRegex.test(val.trim())) {
      setEmailError("Format email tidak valid (contoh: user@domain.com).");
      return false;
    }
    setEmailError("");
    return true;
  }

  function validatePassword(val: string): boolean {
    if (!val) {
      setPasswordError("Kata sandi tidak boleh kosong.");
      return false;
    }
    if (val.length < 8) {
      setPasswordError("Kata sandi minimal 8 karakter.");
      return false;
    }
    setPasswordError("");
    return true;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const isEmailOk = validateEmail(email);
    const isPassOk = validatePassword(password);

    if (!isEmailOk || !isPassOk) {
      toast.error("Harap perbaiki kesalahan pada formulir.");
      return;
    }

    if (mode === "register" && !agreedToTerms) {
      toast.error("Harap menyetujui Syarat & Ketentuan serta Kebijakan Privasi.");
      return;
    }

    setIsSubmitting(true);
    setLoginError("");
    const endpoint = mode === "login" ? "/api/auth/login" : "/api/auth/register";

    try {
      let deviceFingerprint: string | undefined;
      if (mode === "register") {
        deviceFingerprint = await generateDeviceFingerprint();
      }
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password, deviceFingerprint }),
      });

      const payload = (await response.json()) as {
        error?: string;
        ok?: boolean;
        isAdmin?: boolean;
      };
      if (!response.ok) {
        const errorMsg = payload.error || "Autentikasi gagal diproses.";
        setLoginError(typeof errorMsg === "string" ? errorMsg : "Autentikasi gagal diproses.");
        throw new Error(typeof errorMsg === "string" ? errorMsg : "Autentikasi gagal diproses.");
      }

      if (mode === "register") {
                toast.success("Akun berhasil dibuat! Silakan beli paket Pro Studio untuk mulai generate dokumen.");
        window.location.assign("/studio");
      } else if (payload.isAdmin) {
        toast.success("Berhasil masuk sebagai Admin.");
        window.location.assign("/admin");
      } else {
        toast.success("Berhasil masuk ke studio.");
        window.location.assign("/studio");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Autentikasi gagal.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="auth-split-grid">
      {/* ── Left Blueprint Navy Showcase (50%) ───────────────────── */}
      <section className="auth-left-showcase blueprint-grid-dark" aria-label="Showcase Dokumenku AI">
        {/* Top Logo */}
        <a href="/" className="auth-showcase-logo">
          <div className="logo-box">
            <Layers size={20} strokeWidth={2.4} />
          </div>
          <strong>Dokumenku AI</strong>
        </a>

        {/* Center Content */}
        <div className="auth-showcase-content">
          <h1>
            Ubah ide produk menjadi <span className="highlight-cyan">blueprint</span> yang siap dibangun.
          </h1>
          <p className="auth-lead-text">
            Masuk untuk mengakses studio arsitektur, menyimpan riwayat dokumen, dan mengelola kredit Anda.
          </p>

          <div className="auth-showcase-features">
            <div className="auth-showcase-card">
              <FileText size={20} />
              <div>
                <strong>Streaming 4 Dokumen Sekaligus</strong>
                <span>PRD, Tech Stack, UI/UX, dan Schema dibuat dalam satu sesi live.</span>
              </div>
            </div>

            <div className="auth-showcase-card">
              <Cpu size={20} />
              <div>
                <strong>Multi-Model AI Engine</strong>
                <span>Dukungan model AI mutakhir untuk rekayasa perangkat lunak standar industri.</span>
              </div>
            </div>

            <div className="auth-showcase-card">
              <ShieldCheck size={20} />
              <div>
                <strong>Aman & Terpercaya</strong>
                <span>Data brief dan dokumen Anda aman dan siap diekspor ke format ZIP.</span>
              </div>
            </div>
          </div>
        </div>

        {/* Testimonial Box */}
        <div className="auth-testimonial-box">
          <p>
            &ldquo;Dokumenku AI memotong waktu perencanaan sprint dari 3 hari menjadi 5 menit.
            Output PRD dan Schema-nya sangat presisi.&rdquo;
          </p>
          <div className="auth-author-row">
            <div className="auth-author-avatar">R</div>
            <div>
              <strong>Rian Pratama</strong>
              <span>Lead Software Engineer</span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Right Form Section (50%) ─────────────────────────────── */}
      <section className="auth-right-form-panel" aria-label="Formulir Autentikasi">
        {/* Top Header Row: Aligned with top edge & Dokumenku AI logo */}
        <header className="auth-panel-top-nav">
          <a href="/" className="auth-mobile-logo">
            <div className="brand-logo-icon sm">
              <Layers size={18} strokeWidth={2.4} />
            </div>
            <strong style={{ fontSize: "1.05rem", color: "var(--navy)" }}>Dokumenku AI</strong>
          </a>

          <a
            href="/"
            className="btn-secondary"
            style={{ minHeight: "38px", padding: "0 16px", fontSize: "0.82rem" }}
          >
            <Home size={14} /> Kembali ke Beranda
          </a>
        </header>

        <div className="auth-form-inner">
          {/* Tab Switcher: Masuk vs Daftar */}
          <div className="auth-tab-pill-switcher" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              className={`auth-tab-pill-btn ${mode === "login" ? "active" : ""}`}
              onClick={() => { setMode("login"); setLoginError(""); }}
            >
              Masuk
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              className={`auth-tab-pill-btn ${mode === "register" ? "active" : ""}`}
              onClick={() => { setMode("register"); setLoginError(""); }}
            >
              Daftar
            </button>
          </div>

          {/* Form Header */}
          <h2 className="auth-form-title">
            {mode === "login" ? "Selamat Datang Kembali" : "Buat Akun Baru"}
          </h2>
          <p className="auth-form-sub">
            {mode === "login"
              ? "Masukkan email dan kata sandi untuk melanjutkan ke studio."
              : "Buat akun baru, beli paket Pro Studio, dan langsung generate dokumen."}
          </p>

          {/* Register Benefit Chips */}
          {mode === "register" && (
            <div className="auth-benefits-badges">
              <span className="auth-benefit-item">
                <Check size={14} strokeWidth={3} /> Beli paket mulai Rp 20.000
              </span>
              <span className="auth-benefit-item">
                <Check size={14} strokeWidth={3} /> Akses 4 dokumen rekayasa lengkap
              </span>
              <span className="auth-benefit-item">
                <Check size={14} strokeWidth={3} /> Tanpa perlu kartu kredit
              </span>
            </div>
          )}

          {/* Form Fields */}
          <form onSubmit={handleSubmit}>
            {mode === "register" && (
              <div className="auth-input-group">
                <label htmlFor="reg-name">Nama lengkap</label>
                <div className="auth-input-field">
                  <User size={17} className="lead-icon" />
                  <input
                    id="reg-name"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nama Anda"
                    autoComplete="name"
                  />
                </div>
              </div>
            )}

            <div className="auth-input-group">
              <label htmlFor="auth-email">Alamat email</label>
              <div className={`auth-input-field ${emailError ? "has-error" : ""}`}>
                <Mail size={17} className="lead-icon" />
                <input
                  id="auth-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (emailError) validateEmail(e.target.value);
                    if (loginError) setLoginError("");
                  }}
                  onBlur={() => validateEmail(email)}
                  placeholder="nama@email.com"
                  autoComplete="email"
                  required
                />
              </div>
              {emailError && (
                <span className="auth-inline-error">{emailError}</span>
              )}
            </div>

            <div className="auth-input-group">
              <label htmlFor="auth-password">Kata sandi</label>
              <div className={`auth-input-field ${passwordError ? "has-error" : ""}`}>
                <Lock size={17} className="lead-icon" />
                <input
                  id="auth-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    if (passwordError) validatePassword(e.target.value);
                    if (loginError) setLoginError("");
                  }}
                  onBlur={() => validatePassword(password)}
                  placeholder="••••••••••••"
                  autoComplete={mode === "login" ? "current-password" : "new-password"}
                  required
                />
                <button
                  type="button"
                  className="eye-btn"
                  onClick={() => setShowPassword((prev) => !prev)}
                  aria-label={showPassword ? "Sembunyikan kata sandi" : "Lihat kata sandi"}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {passwordError && (
                <span className="auth-inline-error">{passwordError}</span>
              )}
            </div>

            {mode === "login" && (
              <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "18px", marginTop: "-4px" }}>
                <a href="#lupa-sandi" style={{ fontSize: "0.8rem", color: "var(--cobalt)", fontWeight: 600 }}>
                  Lupa kata sandi?
                </a>
              </div>
            )}

            {mode === "register" && (
              <label className="auth-checkbox-row">
                <input
                  type="checkbox"
                  checked={agreedToTerms}
                  onChange={(e) => setAgreedToTerms(e.target.checked)}
                  style={{ accentColor: "var(--cobalt)", width: "16px", height: "16px" }}
                />
                <span>
                  Saya menyetujui <a href="#">Syarat & Ketentuan</a> serta <a href="#">Kebijakan Privasi</a>.
                </span>
              </label>
            )}

            <button
              type="submit"
              className="btn-primary"
              style={{ width: "100%", minHeight: "46px", fontSize: "0.95rem" }}
              disabled={isSubmitting}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="animate-spin" size={18} />
                  Memproses...
                </>
              ) : mode === "login" ? (
                <>
                  <LogIn size={18} />
                  Masuk ke Studio
                </>
              ) : (
                <>
                  <UserPlus size={18} />
                  Daftar Akun
                </>
              )}
            </button>
          </form>

          {loginError && (
            <div className="auth-login-error" style={{
              marginTop: "16px",
              padding: "12px 16px",
              borderRadius: "8px",
              background: "#FEF2F2",
              border: "1px solid #FECACA",
              color: "#991B1B",
              fontSize: "0.85rem",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}>
              <AlertTriangle size={16} />
              {loginError}
            </div>
          )}

          {/* Footer Switch Link */}
          <div className="auth-footer-link">
            {mode === "login" ? (
              <span>
                Belum punya akun?{" "}
                <button type="button" onClick={() => setMode("register")}>
                  Daftar gratis sekarang
                </button>
              </span>
            ) : (
              <span>
                Sudah memiliki akun?{" "}
                <button type="button" onClick={() => setMode("login")}>
                  Masuk di sini
                </button>
              </span>
            )}
          </div>

          {/* Encryption Note */}
          <div className="auth-encryption-badge">
            <Lock size={13} />
            <span>Data akun Anda dilindungi dengan enkripsi.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
