import LoginClient from "@/app/admin/login/login-client";
import "./page.css";
import {Suspense} from "react";

export default function LoginPage() {
    return (
        <Suspense fallback={<>...</>}>
            <LoginClient/>
        </Suspense>
    );
}
