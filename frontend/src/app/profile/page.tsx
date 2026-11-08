import { redirect } from "next/navigation";
import { session, AuthError } from "@/lib/auth-server";
import { SessionWorkspace } from "@/components/auth/SessionWorkspace";
import type { ProfileTab } from "@/components/ProfileScreen";

export default async function ProfilePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const query = await searchParams;
  const initialProfileTab: ProfileTab = query.tab === "workspace" || query.tab === "security" ? query.tab : "profile";
  let current;
  try {
    current = await session();
  } catch (error) {
    if (error instanceof AuthError && error.status === 401) {
      const next = initialProfileTab === "profile" ? "/profile" : `/profile?tab=${initialProfileTab}`;
      redirect(`/login?next=${encodeURIComponent(next)}`);
    }
    return <SessionWorkspace unavailable initialSection="profile" initialProfileTab={initialProfileTab} />;
  }
  return <SessionWorkspace initialUser={current.user} initialSection="profile" initialProfileTab={initialProfileTab} />;
}
