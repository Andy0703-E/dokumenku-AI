"use client";

import { useParams, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import StudioWorkbench from "@/components/StudioWorkbench";

function StudioContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const projectId = (params?.projectId as string) || "default_project";
  const initialPrompt = searchParams.get("prompt") || "";
  const projectName = searchParams.get("name") || "";

  return (
    <StudioWorkbench
      projectId={projectId}
      initialPrompt={initialPrompt}
      initialProjectName={projectName}
      onBackToHome={() => window.location.assign("/")}
    />
  );
}

export default function StudioProjectPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--bg-soft, #F8FAFC)",
          }}
        >
          <div style={{ textAlign: "center", color: "var(--text-muted, #64748B)" }}>
            <div
              style={{
                width: "40px",
                height: "40px",
                border: "3px solid #E2E8F0",
                borderTopColor: "var(--cobalt, #2563EB)",
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite",
                margin: "0 auto 12px",
              }}
            />
            <p style={{ fontSize: "0.88rem" }}>Memuat studio...</p>
          </div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      }
    >
      <StudioContent />
    </Suspense>
  );
}
