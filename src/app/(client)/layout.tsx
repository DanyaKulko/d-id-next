import { getCurrentUser } from "@/lib/auth/require";
import { isClientAuthRequired } from "@/lib/auth/client-access";
import SpaceBackground from "@/components/SpaceBackground/SpaceBackground";
import UserSessionTracker from "./_components/UserSessionTracker";

const isRegularUserRoles = (roles: string[]) =>
  roles.includes("USER") && !roles.includes("ADMIN");

export default async function ClientLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const authRequired = await isClientAuthRequired();
  const session = authRequired ? await getCurrentUser() : null;
  const shouldTrack =
    authRequired && session && isRegularUserRoles(session.user.roles);

  return (
    <>
      {shouldTrack ? <UserSessionTracker /> : null}
      <SpaceBackground />
      <div className="na-theme-space">{children}</div>
    </>
  );
}
