import type { Metadata } from "next";
import AccountProfilePage from "@/components/AccountProfilePage";

export const metadata: Metadata = {
  title: "Profil & Riwayat Dokumen | Dokumenku AI",
  description: "Kelola akun, profil, saldo kredit, dan riwayat dokumen blueprint yang telah Anda buat.",
};

export default function AccountPage() {
  return <AccountProfilePage />;
}
