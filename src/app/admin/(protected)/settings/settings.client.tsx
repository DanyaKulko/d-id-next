"use client";

import {useRouter} from "next/navigation";
import {Fragment, type FormEvent, useState, useTransition} from "react";
import toast from "react-hot-toast";

import {
    checkAzureConnectionAction,
    checkDidConnectionAction,
    saveAdminCredentialsAction,
    saveAuthRequirementAction,
    saveExternalSourcesConfigAction,
    saveUserTwoFactorRequirementAction,
    saveUserUpdateAction,
} from "@/app/admin/(protected)/actions";
import type {
    ErrorLogFilters,
    ErrorLogPage,
    SessionFilters,
    SessionPage,
    SessionRoleOption,
    UserRow,
} from "@/app/admin/(protected)/admin-data";
import type {SettingsTabId} from "./settings.tabs";

type SettingsClientProps = {
    initialTab: SettingsTabId;
    initialUsers?: UserRow[];
    initialIntegrationConfig?: { apiKey: string; azureRegion?: string };
    initialAuthRequired?: boolean;
    initialUserTwoFactorRequired?: boolean;
    initialAdminEmail?: string;
    initialSessions?: SessionPage;
    initialSessionFilters?: SessionFilters;
    initialSessionRoles?: SessionRoleOption[];
    initialErrorLogs?: ErrorLogPage;
    initialErrorLogFilters?: ErrorLogFilters;
};

export default function SettingsClient({
                                           initialTab,
                                           initialUsers,
                                           initialIntegrationConfig,
                                           initialAuthRequired,
                                           initialUserTwoFactorRequired,
                                           initialAdminEmail,
                                           initialSessions,
                                           initialSessionFilters,
                                           initialSessionRoles,
                                           initialErrorLogs,
                                           initialErrorLogFilters,
                                       }: SettingsClientProps) {
    const activeTab = initialTab;
    const router = useRouter();

    // sessions expand
    const [expandedSessions, setExpandedSessions] = useState<
        Record<string, boolean>
    >({});
    const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>(
        {},
    );

    // auth required toggle
    const [authRequired, setAuthRequired] = useState(
        initialAuthRequired ?? false,
    );
    const [userTwoFactorRequired, setUserTwoFactorRequired] = useState(
        initialUserTwoFactorRequired ?? true,
    );
    const [users, setUsers] = useState<UserRow[]>(initialUsers ?? []);
    const [integrationConfig] = useState(
        initialIntegrationConfig ?? {apiKey: "", azureRegion: ""},
    );
    const [adminEmail, setAdminEmail] = useState(initialAdminEmail ?? "");
    const [didStatus, setDidStatus] = useState<"idle" | "ok" | "error">("idle");
    const [azureStatus, setAzureStatus] = useState<"idle" | "ok" | "error">("idle");
    const [isSaving, startSaving] = useTransition();
    const [isCheckingAzure, startCheckingAzure] = useTransition();
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
    const [editUserPassword, setEditUserPassword] = useState("");
    const [editUserPasswordConfirm, setEditUserPasswordConfirm] = useState("");

    const toggleSession = (id: string) => {
        setExpandedSessions((s) => ({...s, [id]: !s[id]}));
    };

    const toggleError = (id: string) => {
        setExpandedErrors((s) => ({...s, [id]: !s[id]}));
    };

    const sessionPage = initialSessions ?? {
        rows: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 1,
    };
    const sessionFilters = initialSessionFilters ?? {
        page: 1,
        limit: 10,
    };
    const sessionRoles = initialSessionRoles ?? [];
    const sessionPages = Array.from(
        {length: sessionPage.totalPages},
        (_, index) => index + 1,
    );
    const errorPage = initialErrorLogs ?? {
        rows: [],
        total: 0,
        page: 1,
        limit: 25,
        totalPages: 1,
    };
    const errorFilters = initialErrorLogFilters ?? {
        page: 1,
        limit: 25,
    };
    const errorPages = Array.from(
        {length: errorPage.totalPages},
        (_, index) => index + 1,
    );
    const languageOptions = [
        {value: "en-US", label: "English"},
        {value: "es-ES", label: "Spanish"},
        {value: "fr-FR", label: "French"},
        {value: "de-DE", label: "German"},
        {value: "ru-RU", label: "Russian"},
        {value: "uk-UA", label: "Ukrainian"},
        {value: "zh-CN", label: "Chinese"},
        {value: "ja-JP", label: "Japanese"},
    ];
    const languageLabel = (value: string) =>
        languageOptions.find((lang) => lang.value === value)?.label ?? value;

    const buildSessionQuery = (overrides: Partial<SessionFilters> = {}) => {
        const params = new URLSearchParams();
        const roleId = overrides.roleId ?? sessionFilters.roleId;
        const from = overrides.from ?? sessionFilters.from;
        const to = overrides.to ?? sessionFilters.to;
        const language = overrides.language ?? sessionFilters.language;
        const page = overrides.page ?? sessionFilters.page;
        const limit = overrides.limit ?? sessionFilters.limit;

        if (roleId) params.set("role", roleId);
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        if (language) params.set("language", language);
        params.set("page", String(page));
        params.set("limit", String(limit));
        return params.toString();
    };

    const buildErrorQuery = (overrides: Partial<ErrorLogFilters> = {}) => {
        const params = new URLSearchParams();
        const page = overrides.page ?? errorFilters.page;
        const limit = overrides.limit ?? errorFilters.limit;
        params.set("page", String(page));
        params.set("limit", String(limit));
        return params.toString();
    };

    const applySessionFilters = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        const role = String(formData.get("role") ?? "").trim();
        const language = String(formData.get("language") ?? "").trim();
        const from = String(formData.get("from") ?? "").trim();
        const to = String(formData.get("to") ?? "").trim();
        const limitRaw = Number.parseInt(
            String(formData.get("limit") ?? sessionFilters.limit),
            10,
        );
        const limit = Number.isNaN(limitRaw) ? sessionFilters.limit : limitRaw;

        router.push(
            `/admin/settings/sessions?${buildSessionQuery({
                roleId: role || undefined,
                language: language || undefined,
                from: from || undefined,
                to: to || undefined,
                page: 1,
                limit,
            })}`,
        );
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

    const onUserTwoFactorToggle = (checked: boolean) => {
        setUserTwoFactorRequired(checked);
        const formData = new FormData();
        formData.set("enabled", checked ? "true" : "false");
        startSaving(async () => {
            await saveUserTwoFactorRequirementAction(formData)
                .then(() => toast.success("2FA requirement updated"))
                .catch(() => {
                    setUserTwoFactorRequired((prev) => !prev);
                    toast.error("Failed to update 2FA requirement");
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
                .then(() => toast.success(`User "${email}" created`))
                .catch(() => toast.error("Failed to create user"));
        });
    };

    const editUser = (id: string) => {
        const user = users.find((u) => u.id === id);
        if (!user) return;

        setEditUserCandidate(user);
        setEditUserEmail(user.email);
        setEditUserPassword("");
        setEditUserPasswordConfirm("");
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
        if (editUserPassword && editUserPassword.length < 6) {
            toast.error("Password must be at least 6 characters");
            return;
        }
        if (editUserPassword && editUserPassword !== editUserPasswordConfirm) {
            toast.error("Passwords do not match");
            return;
        }

        const formData = new FormData();
        formData.set("action", "update");
        formData.set("userId", editUserCandidate.id);
        formData.set("email", newEmail);
        if (editUserPassword) {
            formData.set("password", editUserPassword);
        }

        startSaving(async () => {
            await saveUserUpdateAction(formData)
                .then(() => toast.success("User updated"))
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
                .then(() =>  toast.success("User status updated"))
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
                </button>
                {" "}
                <button
                    type="button"
                    className="btn btn-secondary btn-small"
                    onClick={() => toggleUserStatus(u.id)}
                >
                    {u.status === "active" ? "⏸️ Disable" : "✅ Enable"}
                </button>
                {" "}
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
            {activeTab === "integrations" && (
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

                        <form
                            className="api-card"
                            onSubmit={(event) => {
                                event.preventDefault();
                                setAzureStatus("idle");
                                startCheckingAzure(async () => {
                                    await checkAzureConnectionAction()
                                        .then(() => {
                                            setAzureStatus("ok");
                                            toast.success("Azure Speech service is available");
                                        })
                                        .catch(() => {
                                            setAzureStatus("error");
                                            toast.error("Azure Speech service is unreachable");
                                        });
                                });
                            }}
                        >
                            <h3>Azure Speech</h3>

                            <div
                                className={`health-status ${azureStatus === "error" ? "error" : "healthy"}`}
                            >
                <span className="icon">
                  {azureStatus === "error" ? "⚠️" : "✅"}
                </span>
                                <span>
                  {azureStatus === "error"
                      ? "Service Unavailable"
                      : "Service Available"}
                </span>
                            </div>

                            <div className="input-group">
                                <label htmlFor={"azureRegion"}>Region</label>
                                <input
                                    id="azureRegion"
                                    name="azureRegion"
                                    type="text"
                                    value={integrationConfig.azureRegion ?? ""}
                                    disabled={true}
                                    placeholder="AZURE_SPEECH_REGION"
                                />
                            </div>

                            <button
                                type="submit"
                                className="btn btn-primary btn-small"
                                disabled={isCheckingAzure}
                            >
                                {isCheckingAzure ? "Checking..." : "🔍 Check Connection"}
                            </button>
                        </form>
                    </div>
                </div>
            )}

            {activeTab === "external-sources" && (
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

                    <h2 className="section-title">Text Articles + Video Transcript</h2>

                    <div className="cron-settings">
                        <div className="input-group">
                            <label htmlFor={"textLink"}>Base API Link</label>
                            <input
                                id="textLink"
                                name="textLink"
                                type="url"
                                defaultValue={'https://www.dondemineilstravels.com'}
                                placeholder="https://www.dondemineilstravels.com"
                                disabled={true}
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor={"textAccessKey"}>Client Secret</label>
                            <input
                                id="textAccessKey"
                                name="textAccessKey"
                                type="text"
                                defaultValue={'6iOg********************Iq25u'}
                                placeholder="API Key"
                                disabled={true}
                            />
                        </div>
                    </div>
                    <div className="cron-settings">
                        <div className="input-group">
                            <label htmlFor={"textLink"}>Username</label>
                            <input
                                id="textLink"
                                name="textLink"
                                type="url"
                                defaultValue={'neil@avatar.platform'}
                                placeholder="Username"
                                disabled={true}
                            />
                        </div>

                        <div className="input-group">
                            <label htmlFor={"textAccessKey"}>Password</label>
                            <input
                                id="textAccessKey"
                                name="textAccessKey"
                                type="text"
                                defaultValue={'*********'}
                                placeholder="Password"
                                disabled={true}
                            />
                        </div>
                    </div>

                    <div className="input-group">
                        <label htmlFor={"textCron"}>CRON Settings (Update Frequency)</label>
                        <input
                            id="textCron"
                            name="textCron"
                            type="text"
                            defaultValue={'0 0 * * *'}
                            placeholder="0 0 * * * (every day at midnight)"
                            disabled={true}
                        />
                    </div>

                    {/*<div style={{marginTop: 30}}>*/}
                    {/*    <button*/}
                    {/*        type="submit"*/}
                    {/*        className="btn btn-primary"*/}
                    {/*        disabled={isSaving}*/}
                    {/*    >*/}
                    {/*        {isSaving ? "Saving..." : "💾 Save Settings"}*/}
                    {/*    </button>*/}
                    {/*    {" "}*/}
                    {/*    <button type="button" className="btn btn-secondary">*/}
                    {/*        🔄 Test Connection*/}
                    {/*    </button>*/}
                    {/*</div>*/}
                </form>
            )}

            {activeTab === "sessions" && (
                <div className="section">
                    <div className="info-box">
                        ℹ️ Complete dialogues for response quality analysis. Click on a
                        session to view detailed information.
                    </div>

                    <form
                        className="filters"
                        method="get"
                        onSubmit={applySessionFilters}
                    >
                        <select name="role" defaultValue={sessionFilters.roleId ?? ""}>
                            <option value="all">All Roles</option>
                            {sessionRoles.map((role) => (
                                <option key={role.id} value={role.id}>
                                    {role.name}
                                </option>
                            ))}
                        </select>

                        <select
                            name="language"
                            defaultValue={sessionFilters.language ?? ""}
                        >
                            <option value="all">All Languages</option>
                            {languageOptions.map((lang) => (
                                <option key={lang.value} value={lang.value}>
                                    {lang.label}
                                </option>
                            ))}
                        </select>

                        <input
                            type="date"
                            name="from"
                            placeholder="From"
                            defaultValue={sessionFilters.from ?? ""}
                        />
                        <input
                            type="date"
                            name="to"
                            placeholder="To"
                            defaultValue={sessionFilters.to ?? ""}
                        />

                        <input type="hidden" name="page" value="1"/>
                        <input type="hidden" name="limit" value={sessionFilters.limit}/>

                        <button type="submit" className="btn btn-secondary btn-small">
                            🔍 Apply Filters
                        </button>
                    </form>

                    {sessionPage.rows.length === 0 ? (
                        <div className="info-box">No sessions found for this filter.</div>
                    ) : (
                        <div className="table-scroll">
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
                                {sessionPage.rows.map((session) => (
                                    <Fragment key={session.id}>
                                        <tr
                                            className="session-row"
                                            onClick={() => toggleSession(session.id)}
                                        >
                                            <td>
                                                <code>{session.sessionId}</code>
                                            </td>
                                            <td>{session.roleName}</td>
                                            <td>{languageLabel(session.language)}</td>
                                            <td>{session.device}</td>
                                            <td>{session.messageCount}</td>
                                            <td>{session.startedAt}</td>
                                        </tr>
                                        <tr>
                                            <td colSpan={6}>
                                                <div
                                                    className={`expandable-content ${
                                                        expandedSessions[session.id] ? "expanded" : ""
                                                    }`}
                                                >
                                                    {session.messages.length === 0 ? (
                                                        <div className="info-box">
                                                            No messages recorded for this session yet.
                                                        </div>
                                                    ) : (
                                                        session.messages.map((message) => (
                                                            <div
                                                                key={message.id}
                                                                className={`message-block ${
                                                                    message.role === "user"
                                                                        ? "user"
                                                                        : message.role === "assistant"
                                                                            ? "avatar"
                                                                            : ""
                                                                }`}
                                                            >
                                                                <div className="message-meta">
                                                                    <strong>
                                                                        {message.role === "assistant"
                                                                            ? "🤖 Avatar"
                                                                            : message.role === "system"
                                                                                ? "⚙️ System"
                                                                                : "👤 User"}
                                                                    </strong>{" "}
                                                                    | {message.createdAt}
                                                                </div>
                                                                <div className="message-text">
                                                                    {message.content}
                                                                </div>
                                                            </div>
                                                        ))
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {sessionPage.totalPages > 1 && (
                        <form className="pagination" method="get">
                            <input
                                type="hidden"
                                name="role"
                                value={sessionFilters.roleId ?? ""}
                            />
                            <input
                                type="hidden"
                                name="language"
                                value={sessionFilters.language ?? ""}
                            />
                            <input
                                type="hidden"
                                name="from"
                                value={sessionFilters.from ?? ""}
                            />
                            <input type="hidden" name="to" value={sessionFilters.to ?? ""}/>
                            <input type="hidden" name="limit" value={sessionFilters.limit}/>

                            {sessionPages.map((page) => (
                                <button
                                    key={page}
                                    type="submit"
                                    name="page"
                                    value={page}
                                    className={page === sessionPage.page ? "active" : ""}
                                >
                                    {page}
                                </button>
                            ))}
                        </form>
                    )}

                    <form className="filters" method="get">
                        <label htmlFor="rowsPerPage">Rows to show</label>
                        <input
                            type="hidden"
                            name="role"
                            value={sessionFilters.roleId ?? "all"}
                        />
                        <input
                            type="hidden"
                            name="language"
                            value={sessionFilters.language ?? "all"}
                        />
                        <input
                            type="hidden"
                            name="from"
                            value={sessionFilters.from ?? ""}
                        />
                        <input type="hidden" name="to" value={sessionFilters.to ?? ""}/>
                        <input type="hidden" name="page" value={1}/>
                        <select
                            id="rowsPerPage"
                            name="limit"
                            defaultValue={sessionFilters.limit}
                            onChange={(event) => {
                                const limit = Number(event.currentTarget.value);
                                router.push(
                                    `/admin/settings/sessions?${buildSessionQuery({
                                        limit,
                                        page: 1,
                                    })}`,
                                );
                            }}
                        >
                            {[10, 20, 30, 50, 100].map((value) => (
                                <option key={value} value={value}>
                                    {value} rows
                                </option>
                            ))}
                        </select>
                    </form>
                </div>
            )}

            {activeTab === "errors-debug" && (
                <div className="section">
                    <div className="info-box">ℹ️ System errors and integration issues</div>

                    {errorPage.rows.length === 0 ? (
                        <div className="info-box">No error logs yet.</div>
                    ) : (
                        <div className="table-scroll">
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
                                {errorPage.rows.map((log) => (
                                    <Fragment key={log.id}>
                                        <tr
                                            className="error-log-row"
                                            onClick={() => toggleError(log.id)}
                                        >
                                            <td>{log.createdAt}</td>
                                            <td>
                          <span className={`badge ${log.level}`}>
                            {log.source}
                          </span>
                                            </td>
                                            <td>{log.type}</td>
                                            <td>{log.message}</td>
                                            <td>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary btn-small"
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        toggleError(log.id);
                                                    }}
                                                >
                                                    {expandedErrors[log.id] ? "Hide" : "Details"}
                                                </button>
                                            </td>
                                        </tr>
                                        <tr>
                                            <td colSpan={5}>
                                                <div
                                                    className={`expandable-content ${
                                                        expandedErrors[log.id] ? "expanded" : ""
                                                    }`}
                                                >
                                                    {log.metadata ? (
                                                        <pre className="log-metadata">
                                {JSON.stringify(log.metadata, null, 2)}
                              </pre>
                                                    ) : (
                                                        <div className="log-empty">
                                                            No additional details available.
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                        </tr>
                                    </Fragment>
                                ))}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {errorPage.totalPages > 1 && (
                        <form className="pagination" method="get">
                            <input type="hidden" name="limit" value={errorFilters.limit}/>
                            {errorPages.map((page) => (
                                <button
                                    key={page}
                                    type="submit"
                                    name="page"
                                    value={page}
                                    className={page === errorPage.page ? "active" : ""}
                                >
                                    {page}
                                </button>
                            ))}
                        </form>
                    )}

                    <form className="filters" method="get">
                        <label htmlFor="errorRows">Rows to show</label>
                        <input type="hidden" name="page" value={1}/>
                        <select
                            id="errorRows"
                            name="limit"
                            defaultValue={errorFilters.limit}
                            onChange={(event) => {
                                const limit = Number(event.currentTarget.value);
                                router.push(
                                    `/admin/settings/errors-debug?${buildErrorQuery({
                                        limit,
                                        page: 1,
                                    })}`,
                                );
                            }}
                        >
                            {[10, 20, 30, 50, 100].map((value) => (
                                <option key={value} value={value}>
                                    {value} rows
                                </option>
                            ))}
                        </select>
                    </form>
                </div>
            )}

            {activeTab === "user-access" && (
                <div className="section">
                    <h2 className="section-title">User Access Management</h2>

                    <div className="toggle-container" style={{marginBottom: 30}}>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={authRequired}
                                onChange={(e) => onAuthRequiredToggle(e.target.checked)}
                            />
                            <span className="slider"/>
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

                    <div className="toggle-container" style={{marginBottom: 30}}>
                        <label className="toggle-switch">
                            <input
                                type="checkbox"
                                checked={userTwoFactorRequired}
                                onChange={(e) => onUserTwoFactorToggle(e.target.checked)}
                            />
                            <span className="slider"/>
                        </label>
                        <div>
                            <div className="toggle-label">Require 2FA for User Login</div>
                            <div className="toggle-description">
                                When enabled, users must enter a one-time code from email after
                                username/password. When disabled, users login with
                                username/password only.
                            </div>
                        </div>
                    </div>

                    <div className="info-box">
                        ℹ️ Authentication and 2FA are configured separately. 2FA affects only
                        the user login page and works after successful password check.
                    </div>

                    <button
                        type="button"
                        className="btn btn-primary"
                        onClick={addNewUser}
                        style={{marginBottom: 20}}
                    >
                        ➕ Add New User
                    </button>

                    <div className="table-scroll">
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
                </div>
            )}

            {activeTab === "admin-credentials" && (
                <div className="section">
                    <h2 className="section-title">Administrator Credentials</h2>

                    <form
                        style={{maxWidth: 600}}
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
                        </button>
                        {" "}
                        <button
                            type="reset"
                            className="btn btn-secondary"
                            disabled={isSaving}
                        >
                            ❌ Cancel
                        </button>
                    </form>
                </div>
            )}

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
                            <div className="input-group">
                                <label htmlFor="editUserPassword">New Password</label>
                                <input
                                    id="editUserPassword"
                                    type="password"
                                    value={editUserPassword}
                                    onChange={(event) => setEditUserPassword(event.target.value)}
                                    placeholder="Leave blank to keep current password"
                                    minLength={6}
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="editUserPasswordConfirm">
                                    Confirm New Password
                                </label>
                                <input
                                    id="editUserPasswordConfirm"
                                    type="password"
                                    value={editUserPasswordConfirm}
                                    onChange={(event) =>
                                        setEditUserPasswordConfirm(event.target.value)
                                    }
                                    placeholder="Repeat new password"
                                    minLength={6}
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
