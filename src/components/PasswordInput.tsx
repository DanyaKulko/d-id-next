"use client";

import { useId, useState } from "react";
import type { InputHTMLAttributes } from "react";

type PasswordInputProps = InputHTMLAttributes<HTMLInputElement>;

export default function PasswordInput({
  className,
  id,
  type,
  ...props
}: PasswordInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="na-password-input">
      <input
        {...props}
        id={inputId}
        type={visible ? "text" : "password"}
        className={className}
      />
      <button
        type="button"
        className="na-password-toggle"
        onClick={() => setVisible((value) => !value)}
        aria-controls={inputId}
        aria-label={visible ? "Hide password" : "Show password"}
      >
        {visible ? "Hide pass" : "Show pass"}
      </button>
    </div>
  );
}
