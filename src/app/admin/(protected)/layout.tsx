import { redirect } from "next/navigation";
import AdminNavbar from "@/app/admin/(protected)/_components/AdminNavbar";
import DevModeGate from "@/app/admin/(protected)/_components/DevModeGate";
import { hasRole } from "@/lib/auth/rbac";
import { getCurrentUser } from "@/lib/auth/require";
import { UserProvider } from "@/lib/auth/user-context";
import "./admin-shared.css";
import "./layout.css";

export const metadata = {
    title: "Admin Dashboard",
    description: "Administration dashboard for managing the application.",
    robots: {
        index: false,
        follow: false,
    },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getCurrentUser();

  if (!session) redirect("/admin/login?next=/admin");
  if (!hasRole(session.user.roles, "ADMIN")) redirect("/");

  return (
    <UserProvider user={session.user}>
      <AdminNavbar />
      {children}
      <DevModeGate />
    </UserProvider>
  );
}
