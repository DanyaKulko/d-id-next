"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import toast from "react-hot-toast";

import {
  checkDidConnectionAction,
  saveAdminCredentialsAction,
  saveAuthRequirementAction,
  saveExternalSourcesConfigAction,
  saveSessionRetentionAction,
  saveUserUpdateAction,
} from "@/app/admin/(protected)/actions";
import type { UserRow } from "@/app/admin/(protected)/admin-data";
import { type SettingsTabId, settingsTabTitles } from "./settings.tabs";

function setBreadcrumb(title: string) {
  const el = document.getElementById("current-section");
  if (el) el.textContent = title;

  const h1 = document.querySelector(".page-title");
  if (h1) h1.textContent = title;
}

type SettingsClientProps = {
  initialTab: SettingsTabId;
  initialUsers?: UserRow[];
  initialIntegrationConfig?: { apiKey: string };
  initialExternalSourcesConfig?: {
    textLink: string;
    textCron: string;
    textAccessKey: string;
    videoLink: string;
    videoCron: string;
    videoAccessKey: string;
  };
  initialAuthRequired?: boolean;
  initialAdminEmail?: string;
};

const emptyExternalSources = {
  textLink: "",
  textCron: "",
  textAccessKey: "",
  videoLink: "",
  videoCron: "",
  videoAccessKey: "",
};

export default function SettingsClient({
  initialTab,
  initialUsers,
  initialIntegrationConfig,
  initialExternalSourcesConfig,
  initialAuthRequired,
  initialAdminEmail,
}: SettingsClientProps) {
  const router = useRouter();
  const activeTab = initialTab;

  // sessions expand
  const [expandedSessions, setExpandedSessions] = useState<
    Record<string, boolean>
  >({
    session1: false,
  });

  // auth required toggle
  const [authRequired, setAuthRequired] = useState(
    initialAuthRequired ?? false,
  );
  const [users, setUsers] = useState<UserRow[]>(initialUsers ?? []);
  const [integrationConfig, setIntegrationConfig] = useState(
    initialIntegrationConfig ?? { apiKey: "" },
  );
  const [externalSourcesConfig, setExternalSourcesConfig] = useState(
    initialExternalSourcesConfig ?? emptyExternalSources,
  );
  const [adminEmail, setAdminEmail] = useState(initialAdminEmail ?? "");
  const [didStatus, setDidStatus] = useState<"idle" | "ok" | "error">("idle");
  const [isSaving, startSaving] = useTransition();
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [newUserPasswordConfirm, setNewUserPasswordConfirm] = useState("");
  const [editUserCandidate, setEditUserCandidate] = useState<UserRow | null>(
    null,
  );
  const [editUserEmail, setEditUserEmail] = useState("");
  const [deleteUserCandidate, setDeleteUserCandidate] =
    useState<UserRow | null>(null);

  useEffect(() => {
    if (initialUsers) {
      setUsers(initialUsers);
    }
  }, [initialUsers]);

  useEffect(() => {
    if (initialIntegrationConfig) {
      setIntegrationConfig(initialIntegrationConfig);
    }
  }, [initialIntegrationConfig]);

  useEffect(() => {
    if (initialExternalSourcesConfig) {
      setExternalSourcesConfig(initialExternalSourcesConfig);
    }
  }, [initialExternalSourcesConfig]);

  useEffect(() => {
    if (typeof initialAuthRequired === "boolean") {
      setAuthRequired(initialAuthRequired);
    }
  }, [initialAuthRequired]);

  useEffect(() => {
    if (typeof initialAdminEmail === "string") {
      setAdminEmail(initialAdminEmail);
    }
  }, [initialAdminEmail]);

  useEffect(() => {
    setBreadcrumb(settingsTabTitles[activeTab]);
  }, [activeTab]);

  const switchTab = (tab: SettingsTabId) => {
    if (tab === activeTab) return;
    router.push(`/admin/settings/${tab}`);
  };

  const toggleSession = (id: string) => {
    setExpandedSessions((s) => ({ ...s, [id]: !s[id] }));
  };

  const onAuthRequiredToggle = (checked: boolean) => {
    setAuthRequired(checked);
    const formData = new FormData();
    formData.set("enabled", checked ? "true" : "false");
    startSaving(async () => {
      await saveAuthRequirementAction(formData)
        .then(() => toast.success("Authentication settings updated"))
        .catch(() => {
          setAuthRequired((prev) => !prev);
          toast.error("Failed to update authentication settings");
        });
    });
  };

  const addNewUser = () => {
    setNewUserEmail("");
    setNewUserPassword("");
    setNewUserPasswordConfirm("");
    setShowAddUser(true);
  };

  const submitNewUser = () => {
    const email = newUserEmail.trim().toLowerCase();
    const password = newUserPassword;
    const confirm = newUserPasswordConfirm;

    if (!email || !password) {
      toast.error("Email and password are required");
      return;
    }
    if (password !== confirm) {
      toast.error("Passwords do not match");
      return;
    }

    const formData = new FormData();
    formData.set("action", "create");
    formData.set("email", email);
    formData.set("password", password);

    startSaving(async () => {
      await saveUserUpdateAction(formData)
        .then((res) => {
          const created = res?.user;
          if (created) {
            setUsers((prev) => [
              ...prev,
              {
                id: created.id,
                login: created.email.split("@")[0] || created.email,
                email: created.email,
                createdDate: new Date(created.createdAt)
                  .toISOString()
                  .split("T")[0],
                lastLogin: "Never",
                status: created.isActive ? "active" : "inactive",
              },
            ]);
          }
          toast.success(`User "${email}" created`);
          setShowAddUser(false);
        })
        .catch(() => toast.error("Failed to create user"));
    });
  };

  const editUser = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;

    setEditUserCandidate(user);
    setEditUserEmail(user.email);
  };

  const deleteUser = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;

    setDeleteUserCandidate(user);
  };

  const confirmEditUser = () => {
    if (!editUserCandidate) return;
    const newEmail = editUserEmail.trim().toLowerCase();
    if (!newEmail) {
      toast.error("Email is required");
      return;
    }

    const formData = new FormData();
    formData.set("action", "update");
    formData.set("userId", editUserCandidate.id);
    formData.set("email", newEmail);

    startSaving(async () => {
      await saveUserUpdateAction(formData)
        .then((res) => {
          const updated = res?.user;
          setUsers((prev) =>
            prev.map((u) =>
              u.id === editUserCandidate.id
                ? {
                    ...u,
                    email: updated?.email ?? newEmail,
                    login:
                      (updated?.email ?? newEmail).split("@")[0] ?? u.login,
                  }
                : u,
            ),
          );
          toast.success("User updated");
          setEditUserCandidate(null);
        })
        .catch(() => toast.error("Failed to update user"));
    });
  };

  const confirmDeleteUser = () => {
    if (!deleteUserCandidate) return;
    const formData = new FormData();
    formData.set("action", "delete");
    formData.set("userId", deleteUserCandidate.id);

    startSaving(async () => {
      await saveUserUpdateAction(formData)
        .then(() => {
          setUsers((prev) =>
            prev.filter((u) => u.id !== deleteUserCandidate.id),
          );
          toast.success("User deleted");
          setDeleteUserCandidate(null);
        })
        .catch(() => toast.error("Failed to delete user"));
    });
  };

  const toggleUserStatus = (id: string) => {
    const user = users.find((u) => u.id === id);
    if (!user) return;
    const nextStatus = user.status === "active" ? "inactive" : "active";

    const formData = new FormData();
    formData.set("action", "toggle-status");
    formData.set("userId", id);
    formData.set("status", nextStatus);

    startSaving(async () => {
      await saveUserUpdateAction(formData)
        .then((res) => {
          const updated = res?.user;
          setUsers((prev) =>
            prev.map((u) =>
              u.id === id
                ? {
                    ...u,
                    status: updated?.isActive ? "active" : "inactive",
                  }
                : u,
            ),
          );
          toast.success("User status updated");
        })
        .catch(() => toast.error("Failed to update user status"));
    });
  };

  const usersRows = users.map((u) => (
    <tr key={u.id}>
      <td>{u.email}</td>
      <td>{u.createdDate}</td>
      <td>{u.lastLogin}</td>
      <td>{u.status === "active" ? "Active" : "Inactive"}</td>
      <td>
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => editUser(u.id)}
        >
          ✏️ Edit
        </button>{" "}
        <button
          type="button"
          className="btn btn-secondary btn-small"
          onClick={() => toggleUserStatus(u.id)}
        >
          {u.status === "active" ? "⏸️ Disable" : "✅ Enable"}
        </button>{" "}
        <button
          type="button"
          className="btn btn-danger btn-small"
          onClick={() => deleteUser(u.id)}
        >
          🗑️ Delete
        </button>
      </td>
    </tr>
  ));

  return (
    <>
      <div className="tabs">
        <button
          type="button"
          className={`tab ${activeTab === "integrations" ? "active" : ""}`}
          onClick={() => switchTab("integrations")}
        >
          🔗 Integrations
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "external-sources" ? "active" : ""}`}
          onClick={() => switchTab("external-sources")}
        >
          📰 External Sources
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "sessions" ? "active" : ""}`}
          onClick={() => switchTab("sessions")}
        >
          📋 Session Records
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "errors-debug" ? "active" : ""}`}
          onClick={() => switchTab("errors-debug")}
        >
          ⚠️ Error Log
        </button>
        <button
          type="button"
          className={`tab ${activeTab === "admin" ? "active" : ""}`}
          onClick={() => switchTab("admin")}
        >
          👨‍💼 Administrator
        </button>
      </div>

      {/* Integrations */}
      <div
        id="integrations"
        className={`tab-content ${activeTab === "integrations" ? "active" : ""}`}
      >
        <div className="section">
          <div className="two-column">
            <form
              className="api-card"
              onSubmit={(event) => {
                event.preventDefault();
                setDidStatus("idle");
                startSaving(async () => {
                  await checkDidConnectionAction()
                    .then(() => {
                      setDidStatus("ok");
                      toast.success("D-ID service is available");
                    })
                    .catch(() => {
                      setDidStatus("error");
                      toast.error("D-ID service is unreachable");
                    });
                });
              }}
            >
              <h3>D-ID API</h3>

              <div
                className={`health-status ${didStatus === "error" ? "error" : "healthy"}`}
              >
                <span className="icon">
                  {didStatus === "error" ? "⚠️" : "✅"}
                </span>
                <span>
                  {didStatus === "error"
                    ? "Service Unavailable"
                    : "Service Available"}
                </span>
              </div>

              <div className="input-group">
                <label htmlFor={"apiKey"}>API Key</label>
                <input
                  id="apiKey"
                  name="apiKey"
                  type="text"
                  value={integrationConfig.apiKey}
                  disabled={true}
                  placeholder="Enter API Key"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-small"
                disabled={isSaving}
              >
                {isSaving ? "Checking..." : "🔍 Check Connection"}
              </button>
            </form>
          </div>
        </div>
      </div>

      {/* External Sources */}
      <div
        id="external-sources"
        className={`tab-content ${activeTab === "external-sources" ? "active" : ""}`}
      >
        <form
          className="section"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            startSaving(async () => {
              await saveExternalSourcesConfigAction(formData)
                .then(() => toast.success("External sources saved"))
                .catch(() => toast.error("Failed to save sources"));
            });
          }}
        >
          <div className="info-box">
            ℹ️ The system automatically retrieves new materials from the blog
            according to the CRON schedule and converts them into vector data
            for the knowledge base.
          </div>

          <h2 className="section-title">Text Articles (JSON)</h2>

          <div className="cron-settings">
            <div className="input-group">
              <label htmlFor={"textLink"}>JSON API Link</label>
              <input
                id="textLink"
                name="textLink"
                type="url"
                defaultValue={externalSourcesConfig.textLink}
                placeholder="https://example.com/api/blog/posts.json"
                disabled={true}
              />
            </div>

            <div className="input-group">
              <label htmlFor={"textAccessKey"}>Access Key</label>
              <input
                id="textAccessKey"
                name="textAccessKey"
                type="text"
                defaultValue={externalSourcesConfig.textAccessKey}
                placeholder="API Key"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor={"textCron"}>CRON Settings (Update Frequency)</label>
            <input
              id="textCron"
              name="textCron"
              type="text"
              defaultValue={externalSourcesConfig.textCron}
              placeholder="0 2 * * * (every day at 2:00 AM)"
              disabled={true}
            />
          </div>

          <h2 className="section-title">Video Transcription (JSON)</h2>

          <div className="cron-settings">
            <div className="input-group">
              <label htmlFor={"videoLink"}>JSON API Link</label>
              <input
                id="videoLink"
                name="videoLink"
                type="url"
                defaultValue={externalSourcesConfig.videoLink}
                placeholder="https://example.com/api/video-transcripts.json"
                disabled={true}
              />
            </div>

            <div className="input-group">
              <label htmlFor={"videoAccessKey"}>Access Key</label>
              <input
                id="videoAccessKey"
                name="videoAccessKey"
                type="text"
                defaultValue={externalSourcesConfig.videoAccessKey}
                placeholder="API Key"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor={"videoCron"}>
              CRON Settings (Update Frequency)
            </label>
            <input
              id="videoCron"
              name="videoCron"
              type="text"
              defaultValue={externalSourcesConfig.videoCron}
              placeholder="0 3 * * * (every day at 3:00 AM)"
              disabled={true}
            />
          </div>

          <div style={{ marginTop: 30 }}>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "💾 Save Settings"}
            </button>{" "}
            <button type="button" className="btn btn-secondary">
              🔄 Test Connection
            </button>
          </div>
        </form>
      </div>

      {/* Session Records */}
      <div
        id="sessions"
        className={`tab-content ${activeTab === "sessions" ? "active" : ""}`}
      >
        <div className="section">
          <div className="info-box">
            ℹ️ Complete dialogues for response quality analysis. Click on a
            session to view detailed information.
          </div>

          <div className="filters">
            <select defaultValue="">
              <option value="">All Roles</option>
              <option value="basic">Basic Neil</option>
              <option value="tourism">Tourism Neil</option>
              <option value="sports">Sports Neil</option>
              <option value="politics">Politics Neil</option>
              <option value="space">Space Neil</option>
            </select>

            <select defaultValue="">
              <option value="">All Languages</option>
              <option value="en">English</option>
              <option value="ru">Russian</option>
              <option value="uk">Ukrainian</option>
            </select>

            <input type="date" placeholder="From" />
            <input type="date" placeholder="To" />

            <button type="button" className="btn btn-secondary btn-small">
              🔍 Apply Filters
            </button>
          </div>

          <table className="log-table">
            <thead>
              <tr>
                <th>Session ID</th>
                <th>Role</th>
                <th>Language</th>
                <th>Device</th>
                <th>Messages</th>
                <th>Start Time</th>
              </tr>
            </thead>
            <tbody>
              <tr
                className="session-row"
                onClick={() => toggleSession("session1")}
              >
                <td>
                  <code>sess_2025_001</code>
                </td>
                <td>Tourism Neil</td>
                <td>English</td>
                <td>Desktop</td>
                <td>12</td>
                <td>2025-01-22 14:30:15</td>
              </tr>
              <tr>
                <td colSpan={6}>
                  <div
                    className={`expandable-content ${expandedSessions.session1 ? "expanded" : ""}`}
                  >
                    <div className="message-block user">
                      <div className="message-meta">
                        <strong>👤 User</strong> | 14:30:18 | Latency: 0ms
                      </div>
                      <div className="message-text">
                        Have you been to Grand Canyon?
                      </div>
                      <div className="rag-trace">
                        🎤 <strong>Audio:</strong> audio_input_001.mp3 |{" "}
                        <strong>STT:</strong> &quot;Have you been to Grand
                        Canyon?&quot;
                      </div>
                    </div>

                    <div className="message-block avatar">
                      <div className="message-meta">
                        <strong>🤖 Avatar</strong> | 14:30:21 | Latency: 2800ms
                        | Source:{" "}
                        <span className="badge internal">Internal</span>
                      </div>
                      <div className="message-text">
                        Yes, I visited the Grand Canyon in 1991. It was
                        absolutely breathtaking...
                      </div>
                      <div className="rag-trace">
                        🔍 <strong>RAG:</strong> chunk_travel_gc_1991 (0.94) |
                        LLM: ChatGPT-4
                      </div>
                    </div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="pagination">
            <button type="button" className="active">
              1
            </button>
            <button type="button">2</button>
            <button type="button">3</button>
            <button type="button">→</button>
          </div>

          <form
            className="filters"
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              startSaving(async () => {
                await saveSessionRetentionAction(formData)
                  .then(() => toast.success("Session preferences saved"))
                  .catch(() =>
                    toast.error("Failed to save session preferences"),
                  );
              });
            }}
          >
            <label htmlFor="retentionDays">Retention (days)</label>
            <input
              id="retentionDays"
              name="retentionDays"
              type="number"
              min={1}
              defaultValue={30}
            />
            <button
              type="submit"
              className="btn btn-primary btn-small"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "💾 Save Preferences"}
            </button>
          </form>
        </div>
      </div>

      {/* Error Log & Debug */}
      <div
        id="errors-debug"
        className={`tab-content ${activeTab === "errors-debug" ? "active" : ""}`}
      >
        <div className="section">
          <div className="info-box">ℹ️ System errors and integration issues</div>

          <table className="log-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Source</th>
                <th>Type</th>
                <th>Description</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>2025-01-22 14:25:33</td>
                <td>
                  <span className="badge error">D-ID</span>
                </td>
                <td>Connection Timeout</td>
                <td>WebRTC connection timeout after 30s</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-small">
                    Details
                  </button>
                </td>
              </tr>
              <tr>
                <td>2025-01-22 13:18:45</td>
                <td>
                  <span className="badge warning">ChatGPT</span>
                </td>
                <td>Rate Limit</td>
                <td>API rate limit exceeded, retry after 60s</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-small">
                    Details
                  </button>
                </td>
              </tr>
            </tbody>
          </table>

          <div className="pagination">
            <button type="button" className="active">
              1
            </button>
            <button type="button">2</button>
            <button type="button">→</button>
          </div>
        </div>
      </div>

      {/* Administrator */}
      <div
        id="admin"
        className={`tab-content ${activeTab === "admin" ? "active" : ""}`}
      >
        <div className="section">
          <h2 className="section-title">User Access Management</h2>

          <div className="toggle-container" style={{ marginBottom: 30 }}>
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={authRequired}
                onChange={(e) => onAuthRequiredToggle(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <div>
              <div className="toggle-label">Require Authentication</div>
              <div className="toggle-description">
                When enabled, users must login with username/password and
                complete 2FA email verification. Access is valid for 24 hours.
                When disabled, anyone can access the avatar without credentials.
              </div>
            </div>
          </div>

          <div className="info-box">
            ℹ️ When authentication is enabled, users receive a 2FA code via email
            for verification. Each session lasts 24 hours.
          </div>

          <button
            type="button"
            className="btn btn-primary"
            onClick={addNewUser}
            style={{ marginBottom: 20 }}
          >
            ➕ Add New User
          </button>

          <div style={{ overflowX: "auto" }}>
            <table className="log-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Created</th>
                  <th>Last Login</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>{usersRows}</tbody>
            </table>
          </div>

          <h2 className="section-title" style={{ marginTop: 50 }}>
            Administrator Credentials
          </h2>

          <form
            style={{ maxWidth: 600 }}
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              const newPassword = String(formData.get("newPassword") ?? "");
              const confirmPassword = String(
                formData.get("confirmPassword") ?? "",
              );
              if (newPassword && newPassword !== confirmPassword) {
                toast.error("Passwords do not match");
                return;
              }

              startSaving(async () => {
                await saveAdminCredentialsAction(formData)
                  .then((res) => {
                    if (!res?.ok) {
                      toast.error(
                        res?.error ?? "Failed to save admin credentials",
                      );
                      return;
                    }
                    toast.success("Administrator credentials saved");
                  })
                  .catch(() => toast.error("Failed to save admin credentials"));
              });
            }}
          >
            <div className="input-group">
              <label htmlFor={"email"}>Administrator Email</label>
              <input
                id="email"
                name="email"
                type="email"
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                placeholder="Enter administrator email"
              />
            </div>
            <div className="input-group">
              <label htmlFor={"curr_password"}>Current Password</label>
              <input
                id="curr_password"
                name="currentPassword"
                type="password"
                placeholder="Enter current password"
              />
            </div>
            <div className="input-group">
              <label htmlFor={"password"}>New Password</label>
              <input
                id="password"
                name="newPassword"
                type="password"
                placeholder="Enter new password"
              />
            </div>
            <div className="input-group">
              <label htmlFor={"password2"}>Confirm New Password</label>
              <input
                id="password2"
                name="confirmPassword"
                type="password"
                placeholder="Repeat new password"
              />
            </div>
            <div className="info-box">
              ℹ️ Email is used for password recovery. Make sure it&apos;s valid
              and accessible.
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "💾 Save Changes"}
            </button>{" "}
            <button
              type="reset"
              className="btn btn-secondary"
              disabled={isSaving}
            >
              ❌ Cancel
            </button>
          </form>
        </div>
      </div>

      {showAddUser && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <div className="modal-title">Add New User</div>
                <div className="modal-subtitle">
                  Create a user account with email + password.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setShowAddUser(false)}
              >
                ✕ Close
              </button>
            </div>

            <div className="modal-body">
              <div className="input-group">
                <label htmlFor="newUserEmail">Email</label>
                <input
                  id="newUserEmail"
                  type="email"
                  value={newUserEmail}
                  onChange={(event) => setNewUserEmail(event.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="newUserPassword">Password</label>
                <input
                  id="newUserPassword"
                  type="password"
                  value={newUserPassword}
                  onChange={(event) => setNewUserPassword(event.target.value)}
                  placeholder="At least 6 characters"
                  minLength={6}
                  required
                />
              </div>

              <div className="input-group">
                <label htmlFor="newUserPasswordConfirm">Confirm Password</label>
                <input
                  id="newUserPasswordConfirm"
                  type="password"
                  value={newUserPasswordConfirm}
                  onChange={(event) =>
                    setNewUserPasswordConfirm(event.target.value)
                  }
                  placeholder="Repeat password"
                  minLength={6}
                  required
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowAddUser(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={submitNewUser}
                disabled={isSaving}
              >
                {isSaving ? "Creating..." : "Create User"}
              </button>
            </div>
          </div>
        </div>
      )}

      {editUserCandidate && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <div className="modal-title">Edit User</div>
                <div className="modal-subtitle">
                  Update the email address for this account.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setEditUserCandidate(null)}
              >
                ✕ Close
              </button>
            </div>

            <div className="modal-body">
              <div className="input-group">
                <label htmlFor="editUserEmail">Email</label>
                <input
                  id="editUserEmail"
                  type="email"
                  value={editUserEmail}
                  onChange={(event) => setEditUserEmail(event.target.value)}
                  placeholder="user@example.com"
                  required
                />
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setEditUserCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={confirmEditUser}
                disabled={isSaving}
              >
                {isSaving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteUserCandidate && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <div className="modal-title">Delete User</div>
                <div className="modal-subtitle">
                  This action cannot be undone.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-small"
                onClick={() => setDeleteUserCandidate(null)}
              >
                ✕ Close
              </button>
            </div>

            <div className="modal-body">
              <p>
                Delete user &quot;{deleteUserCandidate.login}&quot;? Their
                access will be revoked immediately.
              </p>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteUserCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDeleteUser}
                disabled={isSaving}
              >
                {isSaving ? "Deleting..." : "Delete User"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
