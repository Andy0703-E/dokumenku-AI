import type { Metadata } from "next";
import PricingPage from "@/components/PricingPage";

export const metadata: Metadata = {
  title: "Harga · Dokumenku AI",
  description: "Lihat paket harga dan kredit Dokumenku AI. Pilih paket sesuai kebutuhan.",
};

export default function Pricing() {
  return <PricingPage />;
}
