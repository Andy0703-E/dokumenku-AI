"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { FolderOpen, Plus, Sparkles, FileText, Clock, ArrowRight, Trash2 } from "lucide-react";

type Project = {
  projectId: string;
  projectName: string;
  selectedModel: string;
  docCount: number;
  createdAt: string;
  updatedAt: string;
};

export default function StudioPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewModal, setShowNewModal] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrompt, setNewPrompt] = useState("");
  const [isCreating, setIsCreating] = useState(false);

  const loadProjects = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch("/api/projects");
      const json = await res.json();
      setProjects(json.data ?? []);
    } catch {
      setProjects([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const handleCreateProject = () => {
    if (!newName.trim() || !newPrompt.trim()) return;
    setIsCreating(true);
    const slug = `proj_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    const params = new URLSearchParams({
      prompt: newPrompt.trim(),
      name: newName.trim(),
    });
    window.location.href = `/studio/${slug}?${params.toString()}`;
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "var(--bg-soft, #F8FAFC)",
        padding: "32px 24px",
      }}
    >
      <div style={{ maxWidth: "960px", margin: "0 auto" }}>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: "32px",
            flexWrap: "wrap",
            gap: "12px",
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                fontSize: "1.6rem",
                fontWeight: 800,
                color: "var(--navy, #0F172A)",
                display: "flex",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <Sparkles size={24} color="var(--cobalt, #2563EB)" />
              Studio Dokumen
            </h1>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: "0.88rem",
                color: "var(--text-muted, #64748B)",
              }}
            >
              Kelola semua proyek dokumen Anda di satu tempat.
            </p>
          </div>
          <button
            type="button"
            className="btn-primary"
            onClick={() => setShowNewModal(true)}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "10px 20px",
              fontSize: "0.88rem",
            }}
          >
            <Plus size={16} /> Proyek Baru
          </button>
        </div>

        {/* Project Grid */}
        {isLoading ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                style={{
                  height: "180px",
                  borderRadius: "14px",
                  background: "#E2E8F0",
                  opacity: 0.5,
                  animation: "pulse 1.5s ease-in-out infinite",
                }}
              />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "80px 24px",
              borderRadius: "16px",
              border: "2px dashed var(--border, #E2E8F0)",
              background: "#fff",
            }}
          >
            <div
              style={{
                width: "64px",
                height: "64px",
                borderRadius: "16px",
                background: "var(--cobalt-light, #EFF6FF)",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: "16px",
              }}
            >
              <FolderOpen size={28} color="var(--cobalt, #2563EB)" />
            </div>
            <h2
              style={{
                margin: "0 0 8px",
                fontSize: "1.15rem",
                fontWeight: 700,
                color: "var(--navy, #0F172A)",
              }}
            >
              Belum ada proyek
            </h2>
            <p
              style={{
                margin: "0 0 24px",
                fontSize: "0.88rem",
                color: "var(--text-muted, #64748B)",
                maxWidth: "360px",
                marginInline: "auto",
              }}
            >
              Mulai buat proyek pertama Anda untuk menghasilkan PRD, Tech Stack, UI/UX, dan Schema secara otomatis.
            </p>
            <button
              type="button"
              className="btn-primary"
              onClick={() => setShowNewModal(true)}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
                padding: "10px 24px",
                fontSize: "0.88rem",
              }}
            >
              <Plus size={16} /> Buat Proyek Baru
            </button>
          </div>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: "16px",
            }}
          >
            {projects.map((p) => (
              <Link
                key={p.projectId}
                href={`/studio/${p.projectId}`}
                style={{ textDecoration: "none" }}
              >
                <div
                  style={{
                    padding: "20px",
                    borderRadius: "14px",
                    border: "1px solid var(--border, #E2E8F0)",
                    background: "#fff",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    height: "180px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "space-between",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--cobalt, #2563EB)";
                    e.currentTarget.style.boxShadow = "0 4px 12px rgba(37,99,235,0.1)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border, #E2E8F0)";
                    e.currentTarget.style.boxShadow = "none";
                  }}
                >
                  <div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        marginBottom: "10px",
                      }}
                    >
                      <div
                        style={{
                          width: "36px",
                          height: "36px",
                          borderRadius: "10px",
                          background: "var(--cobalt-light, #EFF6FF)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          flexShrink: 0,
                        }}
                      >
                        <FileText size={16} color="var(--cobalt, #2563EB)" />
                      </div>
                      <h3
                        style={{
                          margin: 0,
                          fontSize: "0.95rem",
                          fontWeight: 700,
                          color: "var(--navy, #0F172A)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.projectName || "Proyek Tanpa Judul"}
                      </h3>
                    </div>
                    {p.selectedModel && (
                      <span
                        style={{
                          display: "inline-block",
                          fontSize: "0.72rem",
                          fontWeight: 600,
                          padding: "2px 8px",
                          borderRadius: "6px",
                          background: "var(--bg-soft, #F1F5F9)",
                          color: "var(--text-muted, #64748B)",
                          marginBottom: "8px",
                        }}
                      >
                        {p.selectedModel}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        fontSize: "0.75rem",
                        color: "var(--text-muted, #64748B)",
                      }}
                    >
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <FileText size={12} /> {p.docCount} dokumen
                      </span>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                        <Clock size={12} />{" "}
                        {new Date(p.updatedAt).toLocaleDateString("id-ID", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                    </div>
                    <ArrowRight size={16} color="var(--cobalt, #2563EB)" />
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* New Project Modal */}
      {showNewModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: "16px",
          }}
          onClick={() => setShowNewModal(false)}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              maxWidth: "480px",
              width: "100%",
              boxShadow: "0 20px 60px rgba(0,0,0,0.15)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              style={{
                margin: "0 0 4px",
                fontSize: "1.15rem",
                fontWeight: 800,
                color: "var(--navy, #0F172A)",
              }}
            >
              Proyek Baru
            </h2>
            <p
              style={{
                margin: "0 0 20px",
                fontSize: "0.84rem",
                color: "var(--text-muted, #64748B)",
              }}
            >
              Beri nama proyek dan jelaskan gambaran besar aplikasi yang ingin Anda bangun.
            </p>

            <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--navy, #0F172A)",
                    marginBottom: "6px",
                  }}
                >
                  Nama Proyek
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Contoh: Aplikasi E-Commerce"
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1.5px solid var(--border, #E2E8F0)",
                    fontSize: "0.88rem",
                    outline: "none",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--cobalt, #2563EB)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border, #E2E8F0)")}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    fontSize: "0.82rem",
                    fontWeight: 700,
                    color: "var(--navy, #0F172A)",
                    marginBottom: "6px",
                  }}
                >
                  Deskripsi / Brief Proyek
                </label>
                <textarea
                  value={newPrompt}
                  onChange={(e) => setNewPrompt(e.target.value)}
                  placeholder="Jelaskan aplikasi yang ingin Anda bangun, target pengguna, fitur utama, dll."
                  rows={5}
                  style={{
                    width: "100%",
                    padding: "10px 12px",
                    borderRadius: "10px",
                    border: "1.5px solid var(--border, #E2E8F0)",
                    fontSize: "0.88rem",
                    outline: "none",
                    resize: "vertical",
                    boxSizing: "border-box",
                    fontFamily: "inherit",
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = "var(--cobalt, #2563EB)")}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border, #E2E8F0)")}
                />
              </div>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "24px",
              }}
            >
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setShowNewModal(false)}
                style={{ padding: "10px 18px", fontSize: "0.85rem" }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={handleCreateProject}
                disabled={!newName.trim() || !newPrompt.trim() || isCreating}
                style={{
                  padding: "10px 22px",
                  fontSize: "0.85rem",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                {isCreating ? (
                  <>
                    <span
                      style={{
                        width: "14px",
                        height: "14px",
                        border: "2px solid rgba(255,255,255,0.3)",
                        borderTopColor: "#fff",
                        borderRadius: "50%",
                        animation: "spin 0.6s linear infinite",
                        display: "inline-block",
                      }}
                    />
                    Membuka Studio...
                  </>
                ) : (
                  <>
                    <Sparkles size={14} /> Mulai
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.5; }
          50% { opacity: 0.3; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </main>
  );
}
