import {redirect} from "next/navigation";
import {getCurrentUser} from "@/lib/auth/require";
import {hasRole} from "@/lib/auth/rbac";
import {UserProvider} from "@/lib/auth/user-context";
import AdminNavbar from "@/app/admin/(protected)/_components/AdminNavbar";
import './layout.css'

export default async function AdminLayout({children}: { children: React.ReactNode }) {
    const session = await getCurrentUser();

    if (!session) redirect("/admin/login?next=/admin");
    if (!hasRole(session.user.roles, "ADMIN")) redirect("/");

    return (
        <UserProvider user={session.user}>
            <AdminNavbar/>
            {children}
        </UserProvider>
    );
}
