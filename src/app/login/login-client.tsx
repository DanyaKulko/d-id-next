"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
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
    return n?.startsWith("/") ? n : "/";
  }, [search]);

  const isProd = process.env.NODE_ENV === "production";
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [recaptchaToken, setRecaptchaToken] = useState("");

  const [state, loginAction, loginPending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const email = String(formData.get("email") ?? "")
        .trim()
        .toLowerCase();
      const password = String(formData.get("password") ?? "");

      if (!email || !password)
        return { phase: "login", error: "Email and password are required" };

      const res = await loginStart({
        email,
        password,
        recaptchaToken: isProd ? recaptchaToken : undefined,
      });

      if (!res.ok)
        return { phase: "login", error: "Invalid email/password or captcha" };

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
        return { phase: "otp", error: "Enter the 6-digit code" };

      const res = await twoFactorVerify({ code });
      if (!res.ok) return { phase: "otp", error: "Invalid or expired code" };

      router.replace(nextUrl);
      return { phase: "otp" };
    },
    state,
  );

  useEffect(() => {
    if (state.phase === "login" && state.error && recaptchaRef.current) {
      recaptchaRef.current.reset();
      setRecaptchaToken("");
    }
  }, [state]);

  const current = state.phase === "otp" ? otpState : state;
  const isOtp = state.phase === "otp";

  return (
    <div className="auth-shell">
      <div className="auth-panel">
        <div className="auth-panel-inner">
          <div className="auth-badge">Neil Avatar</div>
          <h1>Access your avatar workspace</h1>
          <p>
            Secure login keeps your avatar knowledge, roles, and training
            settings protected. Use your email and one-time code to continue.
          </p>
          <div className="auth-panel-grid">
            <div>
              <span>Lock</span>
              <strong>Two-step access</strong>
              <p>
                Every login is verified by a one-time code sent to your email.
              </p>
            </div>
            <div>
              <span>Speed</span>
              <strong>Fast sessions</strong>
              <p>
                Stay connected while keeping protected routes locked for guests.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="auth-card">
        <div className="auth-brand">
          <div>
            <div className="auth-title">User Login</div>
            <div className="auth-subtitle">Neil Avatar Access Portal</div>
          </div>
          <div className="auth-chip">Secure</div>
        </div>

        <div className={`auth-error ${current.error ? "show" : ""}`}>
          {current.error ?? ""}
        </div>

        {!isOtp ? (
          <form action={loginAction} className="auth-form">
            <div className="input-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                name="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="username"
                required
                pattern="^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$"
                title="Enter a valid email address"
              />
            </div>

            <div className="input-group">
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                placeholder="Enter your password"
                minLength={6}
                autoComplete="current-password"
                required
              />
            </div>

            {isProd && siteKey ? (
              <div className="auth-captcha">
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
              className="auth-submit"
              disabled={
                loginPending || (isProd && siteKey ? !recaptchaToken : false)
              }
            >
              {loginPending ? "Signing in..." : "Continue"}
            </button>
          </form>
        ) : (
          <form action={otpAction} className="auth-form">
            <div className="input-group">
              <label htmlFor="code">One-time code</label>
              <input
                id="code"
                name="code"
                type="text"
                placeholder="6-digit code"
                required
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                minLength={6}
              />
            </div>

            <button type="submit" className="auth-submit" disabled={otpPending}>
              {otpPending ? "Verifying..." : "Verify & Enter"}
            </button>

            <p className="auth-hint">
              A verification code was sent to your email. Check your inbox or
              spam folder.
            </p>
          </form>
        )}

        <div className="auth-footer">
          <span>Need access?</span> Contact the administrator to get an invite.
        </div>
      </div>
    </div>
  );
}
