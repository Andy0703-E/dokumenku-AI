"use client";

import { useState } from "react";
import LandingPage from "@/components/LandingPage";
import StudioWorkbench from "@/components/StudioWorkbench";

export default function HomePage() {
  const [inStudio, setInStudio] = useState(false);
  const [initialPrompt, setInitialPrompt] = useState("");

  function handleStartStudio(prompt?: string) {
    if (prompt) setInitialPrompt(prompt);
    setInStudio(true);
  }

  if (inStudio) {
    return (
      <StudioWorkbench
        initialPrompt={initialPrompt}
        onBackToHome={() => setInStudio(false)}
      />
    );
  }

  return <LandingPage onStart={handleStartStudio} />;
}
