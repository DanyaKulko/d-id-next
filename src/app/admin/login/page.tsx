import LoginClient from "@/app/admin/login/login-client";
import "./page.css";
import {Suspense} from "react";

export const metadata = {
    title: "Admin Login",
    description: "Login page for the administration dashboard.",
    robots: {
        index: false,
        follow: false,
    },
};

export default function LoginPage() {
    return (
        <Suspense fallback={<>...</>}>
            <LoginClient/>
        </Suspense>
    );
}
