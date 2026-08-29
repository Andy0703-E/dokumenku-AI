import type { Metadata } from "next";
import AdminDashboard from "@/components/AdminDashboard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Admin · Dokumenku AI",
  description: "Kelola kredit dan penggunaan Dokumenku AI.",
};

export default function AdminPage() {
  return <AdminDashboard />;
}
