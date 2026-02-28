"use client";

import { useEffect } from "react";

type LoginErrorProps = {
  error: Error & { digest?: string };
  reset: () => void;
};

export default function LoginError({ error, reset }: LoginErrorProps) {
  useEffect(() => {
    console.error("Login route error", error);
  }, [error]);

  return (
    <div style={{ minHeight: "100vh", display: "grid", placeItems: "center" }}>
      <div
        style={{
          maxWidth: 520,
          width: "100%",
          borderRadius: 16,
          border: "1px solid rgba(16,42,44,0.1)",
          background: "#fff",
          padding: 24,
          textAlign: "center",
          color: "#284665",
        }}
      >
        <h2 style={{ marginBottom: 10 }}>Login is temporarily unavailable</h2>
        <p style={{ marginBottom: 16, fontSize: 14, opacity: 0.8 }}>
          Please try again. If the issue persists, contact administrator.
        </p>
        <button
          type="button"
          onClick={reset}
          style={{
            border: "2px solid #fdaa2d",
            background: "linear-gradient(135deg, #feb13f, #ffd8a5)",
            color: "#284665",
            borderRadius: 12,
            fontWeight: 600,
            padding: "10px 18px",
            cursor: "pointer",
          }}
        >
          Retry
        </button>
      </div>
    </div>
  );
}
