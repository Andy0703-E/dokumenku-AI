"use client";

import LandingPage from "@/components/LandingPage";

export default function HomePage() {
  function handleStartStudio(prompt?: string) {
    if (prompt) {
      window.location.href = `/studio?prompt=${encodeURIComponent(prompt)}`;
    } else {
      window.location.href = "/studio";
    }
  }

  return <LandingPage onStart={handleStartStudio} />;
}
