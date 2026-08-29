"use client";

import StudioWorkbench from "@/components/StudioWorkbench";

export default function StudioPage() {
  return <StudioWorkbench onBackToHome={() => window.location.assign("/")} />;
}
