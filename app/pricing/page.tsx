import type { Metadata } from "next";
import PricingPage from "@/components/PricingPage";

export const metadata: Metadata = {
  title: "Harga · Dokumenku AI",
  description: "Lihat paket harga dan kredit Dokumenku AI. Mulai gratis, upgrade kapan saja.",
};

export default function Pricing() {
  return <PricingPage />;
}
