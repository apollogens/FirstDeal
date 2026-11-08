import { redirect } from "next/navigation";
import { AuthError, session } from "@/lib/auth-server";
import { SessionWorkspace } from "@/components/auth/SessionWorkspace";

export default async function MailPage() {
  let current;
  try {
    current = await session();
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) redirect("/login?next=%2Fmail");
    return <SessionWorkspace unavailable />;
  }
  return <SessionWorkspace initialUser={current.user} initialSection="mail" />;
}
