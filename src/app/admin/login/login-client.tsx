"use client";

import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { createAdmin } from "@/app/actions/auth/create-admin.actions";
import { loginStart } from "@/app/actions/auth/login.actions";
import { twoFactorVerify } from "@/app/actions/auth/two-factor.actions";

type LoginState =
  | { phase: "login"; error?: string; expiresAt?: string }
  | { phase: "otp"; error?: string; expiresAt?: string };

const initialState: LoginState = { phase: "login" };

export default function LoginClient() {
  const router = useRouter();
  const search = useSearchParams();

  const nextUrl = useMemo(() => {
    const n = search.get("next");
    return n?.startsWith("/") ? n : "/admin";
  }, [search]);

  const isProd = process.env.NODE_ENV === "production";
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [recaptchaToken, setRecaptchaToken] = useState<string>("");

  const [state, loginAction, loginPending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const email = String(formData.get("email") ?? "")
        .trim()
        .toLowerCase();
      const password = String(formData.get("password") ?? "");

      if (!email || !password)
        return { phase: "login", error: "Введите email и пароль" };

      const res = await loginStart({
        email,
        password,
        recaptchaToken: isProd ? recaptchaToken : undefined,
      });

      if (!res.ok)
        return { phase: "login", error: "Неверный email/пароль или капча" };

      if (res.step === "2fa") {
        return { phase: "otp", expiresAt: res.expiresAt?.toString() };
      }

      router.replace(nextUrl);
      return { phase: "login" };
    },
    initialState,
  );

  const [otpState, otpAction, otpPending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const code = String(formData.get("code") ?? "").trim();

      if (!/^\d{6}$/.test(code))
        return { phase: "otp", error: "Введите 6-значный код" };

      const res = await twoFactorVerify({ code });
      if (!res.ok) return { phase: "otp", error: "Неверный или истекший код" };

      router.replace(nextUrl);
      return { phase: "otp" };
    },
    state,
  );

  const handleCreateAdmin = async () => {
    const res = await createAdmin();
    console.log(res);
  };

  useEffect(() => {
    if (state.phase === "login" && state.error && recaptchaRef.current) {
      recaptchaRef.current.reset();
      setRecaptchaToken("");
    }
  }, [state]);

  const current = state.phase === "otp" ? otpState : state;
  const isOtp = state.phase === "otp";

  return (
    <div className="login-container">
      <div className="login-box">
        <div className="login-logo">
          <Image
            src="https://roliki.ua/s/ChatGPT-Image-29-%D0%BD%D0%BE%D1%8F%D0%B1.-2025-%D0%B3.-14_23_51-%D0%9E%D1%82%D1%80%D0%B5%D0%B4%D0%B0%D0%BA%D1%82%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%D0%BD%D0%BE.png"
            alt="Gokhale CMS"
            width={80}
            height={80}
          />
        </div>

        <h1 className="login-title">Gokhale CMS</h1>
        <p className="login-subtitle">Administrator Panel Login</p>

        <div
          id="errorMessage"
          className={`error-message ${current.error ? "show" : ""}`}
        >
          {current.error ?? ""}
        </div>

        {!isOtp ? (
          <form action={loginAction}>
            {/*<button type="button" onClick={handleCreateAdmin}>*/}
            {/*  Create Admin*/}
            {/*</button>*/}
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="Enter your username"
                required
                autoComplete="username"
                pattern="^[^@\s]+@[^@\s]+\.[^@\s]+$"
                title="Enter a valid email address"
              />
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <input
                type="password"
                id="password"
                name="password"
                placeholder="Enter your password"
                minLength={6}
                required
                autoComplete="current-password"
              />
            </div>

            {isProd && siteKey ? (
              <div className="captcha-container">
                <ReCAPTCHA
                  ref={recaptchaRef}
                  sitekey={siteKey}
                  onChange={(token) => setRecaptchaToken(token ?? "")}
                  onExpired={() => setRecaptchaToken("")}
                />
              </div>
            ) : null}

            <button
              type="submit"
              className="login-button"
              disabled={
                loginPending
                // loginPending || (isProd && siteKey ? !recaptchaToken : false)
              }
            >
              {loginPending ? "Signing in..." : "Login"}
            </button>
          </form>
        ) : (
          <form action={otpAction}>
            <div className="form-group">
              <label htmlFor="code">One-time code</label>
              <input
                type="text"
                id="code"
                name="code"
                placeholder="Enter 6-digit code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                minLength={6}
              />
            </div>

            <button
              type="submit"
              className="login-button"
              disabled={otpPending}
            >
              {otpPending ? "Verifying..." : "Verify"}
            </button>

            <p
              className="login-subtitle"
              style={{ marginTop: 16, marginBottom: 0 }}
            >
              Код отправлен на почту администратора. Проверьте Inbox/Spam.
            </p>
          </form>
        )}
      </div>

      <p className="footer-text">© 2025 Gokhale CMS. All rights reserved.</p>
    </div>
  );
}
