import type { Metadata } from "next";
import { AuthPage } from "@/components/auth/AuthPage";
export const metadata: Metadata = {
  title: "Workspace AI — Вход в аккаунт",
  description: "Твоя память — всегда рядом",
};
export default function Page() {
  return <AuthPage />;
}
