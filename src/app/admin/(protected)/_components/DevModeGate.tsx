"use client";

import { type FormEvent, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { verifyAdminPasswordAction } from "@/app/admin/(protected)/actions";
import { setDevModeEnabled, useDevMode } from "./dev-mode";

export default function DevModeGate() {
  const { enabled, expiresAt } = useDevMode();
  const [showModal, setShowModal] = useState(false);
  const [password, setPassword] = useState("");
  const [isSaving, startSaving] = useTransition();

  const handleOpen = () => {
    if (enabled) {
      setDevModeEnabled(false);
      toast.success("Dev mode disabled");
      return;
    }
    setShowModal(true);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!password.trim()) {
      toast.error("Password is required");
      return;
    }

    startSaving(async () => {
      const formData = new FormData();
      formData.set("password", password);

      const result = await verifyAdminPasswordAction(formData).catch(() => ({
        ok: false,
        error: "Verification failed",
      }));

      if (result?.ok) {
        setDevModeEnabled(true, 30);
        setPassword("");
        setShowModal(false);
        toast.success("Dev mode enabled");
        return;
      }
      toast.error(result?.error ?? "Invalid password");
    });
  };

  return (
    <>
      <button
        type="button"
        className={`devmode-fab ${enabled ? "active" : ""}`}
        onClick={handleOpen}
        aria-label="Toggle developer mode"
      >
        <span className="devmode-fab-icon">🛠️</span>
        <span className="devmode-fab-text">
          {enabled ? "Dev Mode On" : "Dev Mode"}
        </span>
      </button>

      {showModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <div className="modal-title">Enable Dev Mode</div>
                <div className="modal-subtitle">
                  Confirm with admin password to unlock all fields.
                </div>
                {expiresAt && (
                  <div className="modal-subtitle">
                    Last session expires on{" "}
                    {expiresAt.toLocaleDateString()}.
                  </div>
                )}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowModal(false)}
              >
                ✕
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="input-group">
                  <label htmlFor="devmode-password">Admin Password</label>
                  <input
                    id="devmode-password"
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="Enter admin password"
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowModal(false)}
                  disabled={isSaving}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={isSaving}
                >
                  {isSaving ? "Verifying..." : "Enable Dev Mode"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
