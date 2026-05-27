"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useActionState, useEffect, useMemo, useRef, useState } from "react";
import ReCAPTCHA from "react-google-recaptcha";
import { loginStart } from "@/app/actions/auth/login.actions";
import { twoFactorVerify } from "@/app/actions/auth/two-factor.actions";
import BrandLockup from "@/components/BrandLockup/BrandLockup";
import PasswordInput from "@/components/PasswordInput";

type LoginState =
  | { phase: "login"; error?: string; expiresAt?: string }
  | { phase: "otp"; error?: string; expiresAt?: string };

const initialState: LoginState = { phase: "login" };

type LoginClientProps = {
  twoFactorRequired: boolean;
};

export default function LoginClient({ twoFactorRequired }: LoginClientProps) {
  const router = useRouter();
  const search = useSearchParams();

  const nextUrl = useMemo(() => {
    const next = search.get("next");
    return next?.startsWith("/") ? next : "/";
  }, [search]);

  const isProd = process.env.NODE_ENV === "production";
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;

  const recaptchaRef = useRef<ReCAPTCHA>(null);
  const [recaptchaToken, setRecaptchaToken] = useState("");

  const [state, loginAction, loginPending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const identifier = String(formData.get("identifier") ?? "").trim();
      const password = String(formData.get("password") ?? "");

      if (!identifier || !password) {
        return {
          phase: "login",
          error: "Email/username and password are required",
        };
      }

      let result: Awaited<ReturnType<typeof loginStart>>;
      try {
        result = await loginStart({
          identifier,
          password,
          recaptchaToken: isProd ? recaptchaToken : undefined,
          scope: "user",
        });
      } catch {
        return { phase: "login", error: "Login is temporarily unavailable" };
      }

      if (!result.ok) {
        return {
          phase: "login",
          error: "Invalid email/username, password or captcha",
        };
      }

      if (result.step === "2fa") {
        return { phase: "otp", expiresAt: result.expiresAt?.toString() };
      }

      router.replace(nextUrl);
      return { phase: "login" };
    },
    initialState,
  );

  const [otpState, otpAction, otpPending] = useActionState(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const code = String(formData.get("code") ?? "").trim();
      if (!/^\d{6}$/.test(code)) {
        return { phase: "otp", error: "Enter the 6-digit code" };
      }

      let result: Awaited<ReturnType<typeof twoFactorVerify>>;
      try {
        result = await twoFactorVerify({ code, scope: "user" });
      } catch {
        return {
          phase: "otp",
          error: "Verification is temporarily unavailable",
        };
      }
      if (!result.ok) {
        return { phase: "otp", error: "Invalid or expired code" };
      }

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

  const currentState = state.phase === "otp" ? otpState : state;
  const isOtp = state.phase === "otp";

  return (
    <div className="na-login-shell">
      <div className="na-login-brand">
        <BrandLockup size="lg" />
      </div>

      <div className="na-login-content">
        <div className="na-login-image-col">
          {/* biome-ignore lint/performance/noImgElement: static hero, intentionally unoptimized */}
          <img
            className="na-login-photo"
            src="/images/neil-login.jpg"
            alt="Neil's Travels"
          />
        </div>
        <div className="na-login-card">
          <div className="na-login-card-header">
            <div className="na-login-card-title">
              <h1>User Login</h1>
            </div>
            <span className="na-login-secure-badge">Secure</span>
          </div>

          <div className={`na-login-error ${currentState.error ? "show" : ""}`}>
            {currentState.error ?? ""}
          </div>

          {!isOtp ? (
            <>
              <form action={loginAction} id="loginForm">
                <div className="na-login-form-group">
                  <label htmlFor="identifier">Email or username</label>
                  <input
                    type="text"
                    id="identifier"
                    name="identifier"
                    placeholder="you@company.com or username"
                    required
                    autoComplete="username"
                    title="Enter your email or username"
                  />
                </div>

                <div className="na-login-form-group">
                  <label htmlFor="password">Password</label>
                  <PasswordInput
                    id="password"
                    name="password"
                    placeholder="Enter your password"
                    required
                    minLength={6}
                    autoComplete="current-password"
                  />
                  <p className="na-login-password-hint">
                    Click &quot;Show&quot; to reveal the password
                  </p>
                </div>

                {isProd && siteKey ? (
                  <div className="na-login-form-group na-login-captcha-group">
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
                  className="na-login-submit"
                  disabled={
                    loginPending ||
                    (isProd && siteKey ? !recaptchaToken : false)
                  }
                >
                  {loginPending ? "Signing in..." : "Login"}
                </button>
              </form>

              <div className="na-login-instructions">
                <h2>How to Get Access to NeilAvatar</h2>
                <ol>
                  <li>
                    Type in your email address. Use the same email address that
                    you typically correspond with Neil.
                  </li>
                  <li>
                    Type in the password which Neil has sent you via email. Keep
                    password safe.
                  </li>
                  <li>Check the Captcha box to confirm you are human.</li>
                  <li>Click Login.</li>
                  <li>
                    {twoFactorRequired
                      ? "Enter the 6-digit code from your email."
                      : "Enjoy NeilAvatar."}
                  </li>
                </ol>
              </div>
            </>
          ) : (
            <>
              <div className="na-login-instructions na-login-otp-instructions">
                <h2>Email Verification</h2>
                <ol>
                  <li>Enter the 6-digit one-time code sent to your email.</li>
                  <li>If needed, check your spam folder.</li>
                  <li>Click Verify to continue.</li>
                </ol>
              </div>

              <form action={otpAction} id="otpForm">
                <div className="na-login-form-group">
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
                  className="na-login-submit"
                  disabled={otpPending}
                >
                  {otpPending ? "Verifying..." : "Verify"}
                </button>

                <p className="na-login-otp-hint">
                  Code was sent on email. Check Inbox/Spam.
                </p>
              </form>
            </>
          )}

          <div className="na-login-footer-text">
            Contact Neil with Login issues.
          </div>
        </div>
      </div>
    </div>
  );
}
