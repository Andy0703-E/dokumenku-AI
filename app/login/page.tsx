import type { Metadata } from "next";
import AuthPanel from "@/components/AuthPanel";

export const metadata: Metadata = {
  title: "Akun · Dokumenku AI",
  description: "Masuk atau buat akun Dokumenku AI.",
};

export default function LoginPage() {
  return <AuthPanel />;
}
