"use client";

import { useMemo, useState } from "react";

type TabId =
    | "integrations"
    | "external-sources"
    | "technical"
    | "sessions"
    | "errors-debug"
    | "admin";

const tabTitles: Record<TabId, string> = {
    integrations: "Integrations",
    "external-sources": "External Sources",
    technical: "Technical Settings",
    sessions: "Session Records",
    "errors-debug": "Error Log & Debug",
    admin: "Administrator",
};

function setBreadcrumb(title: string) {
    const el = document.getElementById("current-section");
    if (el) el.textContent = title;

    const h1 = document.querySelector(".page-title");
    if (h1) h1.textContent = title;
}

type UserRow = {
    id: number;
    login: string;
    email: string;
    createdDate: string;
    lastLogin: string;
    status: "active" | "inactive";
};

const initialUsers: UserRow[] = [
    { id: 1, login: "user1", email: "user1@example.com", createdDate: "2025-01-15", lastLogin: "2025-01-22", status: "active" },
    { id: 2, login: "user2", email: "user2@example.com", createdDate: "2025-01-18", lastLogin: "2025-01-21", status: "active" },
    { id: 3, login: "testuser", email: "test@example.com", createdDate: "2025-01-20", lastLogin: "Never", status: "inactive" },
];

export default function SettingsClient() {
    const [activeTab, setActiveTab] = useState<TabId>("integrations");

    // sessions expand
    const [expandedSessions, setExpandedSessions] = useState<Record<string, boolean>>({
        session1: false,
    });

    // auth required toggle
    const [authRequired, setAuthRequired] = useState(true);

    // users (mock)
    const [users, setUsers] = useState<UserRow[]>(initialUsers);

    const switchTab = (tab: TabId) => {
        setActiveTab(tab);
        setBreadcrumb(tabTitles[tab]);
    };

    const toggleSession = (id: string) => {
        setExpandedSessions((s) => ({ ...s, [id]: !s[id] }));
    };

    const checkConnection = (apiName: string) => {
        window.alert(`Checking connection to ${apiName}...\n\nConnection successful!\nLatency: 120ms`);
    };

    const onAuthRequiredToggle = (checked: boolean) => {
        setAuthRequired(checked);
        if (checked) {
            window.alert(
                "Authentication ENABLED\n\nUsers must now login with username/password and complete 2FA email verification to access the avatar."
            );
        } else {
            window.alert(
                "Authentication DISABLED\n\nAll users can access the avatar without login. Use with caution!"
            );
        }
    };

    const addNewUser = () => {
        const login = window.prompt("Enter new user login:");
        if (!login) return;

        const email = window.prompt("Enter user email:");
        if (!email) return;

        const password = window.prompt("Enter initial password:");
        if (!password) return;

        const newUser: UserRow = {
            id: users.length ? Math.max(...users.map((u) => u.id)) + 1 : 1,
            login,
            email,
            createdDate: new Date().toISOString().split("T")[0],
            lastLogin: "Never",
            status: "active",
        };

        setUsers((u) => [...u, newUser]);

        window.alert(
            `User "${login}" created successfully!\n\nLogin: ${login}\nPassword: ${password}\nEmail: ${email}\n\nThe user will need to verify their email for 2FA.`
        );
    };

    const editUser = (id: number) => {
        const user = users.find((u) => u.id === id);
        if (!user) return;

        const newLogin = window.prompt("Edit login:", user.login);
        const newEmail = window.prompt("Edit email:", user.email);

        setUsers((prev) =>
            prev.map((u) =>
                u.id === id
                    ? {
                        ...u,
                        login: newLogin?.trim() ? newLogin.trim() : u.login,
                        email: newEmail?.trim() ? newEmail.trim() : u.email,
                    }
                    : u
            )
        );

        window.alert("User updated successfully!");
    };

    const deleteUser = (id: number) => {
        const user = users.find((u) => u.id === id);
        if (!user) return;

        const ok = window.confirm(
            `Are you sure you want to delete user "${user.login}"?\n\nThis action cannot be undone.`
        );
        if (!ok) return;

        setUsers((prev) => prev.filter((u) => u.id !== id));
        window.alert("User deleted successfully!");
    };

    const usersRows = useMemo(
        () =>
            users.map((u) => (
                <tr key={u.id}>
                    <td>{u.email}</td>
                    <td>{u.createdDate}</td>
                    <td>{u.lastLogin}</td>
                    <td>
                        <button type="button" className="btn btn-secondary btn-small" onClick={() => editUser(u.id)}>
                            ✏️ Edit
                        </button>{" "}
                        <button type="button" className="btn btn-danger btn-small" onClick={() => deleteUser(u.id)}>
                            🗑️ Delete
                        </button>
                    </td>
                </tr>
            )),
        [users]
    );

    return (
        <>
            <div className="tabs">
                <button type="button" className={`tab ${activeTab === "integrations" ? "active" : ""}`} onClick={() => switchTab("integrations")}>
                    🔗 Integrations
                </button>
                <button type="button" className={`tab ${activeTab === "external-sources" ? "active" : ""}`} onClick={() => switchTab("external-sources")}>
                    📰 External Sources
                </button>
                <button type="button" className={`tab ${activeTab === "technical" ? "active" : ""}`} onClick={() => switchTab("technical")}>
                    ⚙️ Technical Settings
                </button>
                <button type="button" className={`tab ${activeTab === "sessions" ? "active" : ""}`} onClick={() => switchTab("sessions")}>
                    📋 Session Records
                </button>
                <button type="button" className={`tab ${activeTab === "errors-debug" ? "active" : ""}`} onClick={() => switchTab("errors-debug")}>
                    ⚠️ Error Log
                </button>
                <button type="button" className={`tab ${activeTab === "admin" ? "active" : ""}`} onClick={() => switchTab("admin")}>
                    👨‍💼 Administrator
                </button>
            </div>

            {/* Integrations */}
            <div id="integrations" className={`tab-content ${activeTab === "integrations" ? "active" : ""}`}>
                <div className="section">
                    <div className="two-column">
                        <div className="api-card">
                            <h3>D-ID API</h3>

                            <div className="health-status healthy">
                                <span className="icon">✅</span>
                                <span>Service Available</span>
                            </div>

                            <div className="input-group">
                                <label>API Key</label>
                                <input type="password" defaultValue="sk_did_" placeholder="Enter API Key" />
                            </div>

                            <button type="button" className="btn btn-primary btn-small" onClick={() => checkConnection("D-ID API")}>
                                🔍 Check Connection
                            </button>{" "}
                            {/*<button type="button" className="btn btn-secondary btn-small">*/}
                            {/*    💾 Save*/}
                            {/*</button>*/}
                        </div>
                    </div>
                </div>
            </div>

            {/* External Sources */}
            <div id="external-sources" className={`tab-content ${activeTab === "external-sources" ? "active" : ""}`}>
                <div className="section">
                    <div className="info-box">
                        ℹ️ The system automatically retrieves new materials from the blog according to the CRON schedule and converts them into vector data for the knowledge base.
                    </div>

                    <h2 className="section-title">Text Articles (JSON)</h2>

                    <div className="cron-settings">
                        <div className="input-group">
                            <label>JSON API Link</label>
                            <input type="url" defaultValue="https://roliki.ua/s/json_template_s.txt" placeholder="https://example.com/api/blog/posts.json" />
                        </div>

                        <div className="input-group">
                            <label>Access Key</label>
                            <input type="text" placeholder="API Key" />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>CRON Settings (Update Frequency)</label>
                        <input type="text" defaultValue="0 2 * * *" placeholder="0 2 * * * (every day at 2:00 AM)" />
                    </div>

                    <h2 className="section-title">Video Transcription (JSON)</h2>

                    <div className="cron-settings">
                        <div className="input-group">
                            <label>JSON API Link</label>
                            <input type="url" defaultValue="https://roliki.ua/s/video-transcripts-neil.txt" placeholder="https://example.com/api/video-transcripts.json" />
                        </div>

                        <div className="input-group">
                            <label>Access Key</label>
                            <input type="text" placeholder="API Key" />
                        </div>
                    </div>

                    <div className="input-group">
                        <label>CRON Settings (Update Frequency)</label>
                        <input type="text" defaultValue="0 3 * * *" placeholder="0 3 * * * (every day at 3:00 AM)" />
                    </div>

                    <div style={{ marginTop: 30 }}>
                        <button type="button" className="btn btn-primary">
                            💾 Save Settings
                        </button>{" "}
                        <button type="button" className="btn btn-secondary">
                            🔄 Test Connection
                        </button>
                    </div>
                </div>
            </div>

            {/* Technical Settings */}
            <div id="technical" className={`tab-content ${activeTab === "technical" ? "active" : ""}`}>
                <div className="section">
                    <div className="info-box">ℹ️ Configure technical parameters for each role</div>

                    <RoleTechCard title="🎭 Basic Neil" video="basic_neil_v1" voice="voice_neil_basic" />
                    <RoleTechCard title="✈️ Tourism Neil" video="tourism_neil_v1" voice="voice_neil_tourism" />
                    <RoleTechCard title="⚽ Sports Neil" video="sports_neil_v1" voice="voice_neil_sports" />
                    <RoleTechCard title="🏛️ Politics Neil" video="politics_neil_v1" voice="voice_neil_politics" />
                    <RoleTechCard title="🚀 Space Neil" video="space_neil_v1" voice="voice_neil_space" />
                </div>
            </div>

            {/* Session Records */}
            <div id="sessions" className={`tab-content ${activeTab === "sessions" ? "active" : ""}`}>
                <div className="section">
                    <div className="info-box">
                        ℹ️ Complete dialogues for response quality analysis. Click on a session to view detailed information.
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
                        <tr className="session-row" onClick={() => toggleSession("session1")}>
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
                                <div className={`expandable-content ${expandedSessions.session1 ? "expanded" : ""}`}>
                                    <div className="message-block user">
                                        <div className="message-meta">
                                            <strong>👤 User</strong> | 14:30:18 | Latency: 0ms
                                        </div>
                                        <div className="message-text">Have you been to Grand Canyon?</div>
                                        <div className="rag-trace">
                                            🎤 <strong>Audio:</strong> audio_input_001.mp3 | <strong>STT:</strong> &quot;Have you been to Grand Canyon?&quot;
                                        </div>
                                    </div>

                                    <div className="message-block avatar">
                                        <div className="message-meta">
                                            <strong>🤖 Avatar</strong> | 14:30:21 | Latency: 2800ms | Source: <span className="badge internal">Internal</span>
                                        </div>
                                        <div className="message-text">Yes, I visited the Grand Canyon in 1991. It was absolutely breathtaking...</div>
                                        <div className="rag-trace">
                                            🔍 <strong>RAG:</strong> chunk_travel_gc_1991 (0.94) | LLM: ChatGPT-4
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
                </div>
            </div>

            {/* Error Log & Debug */}
            <div id="errors-debug" className={`tab-content ${activeTab === "errors-debug" ? "active" : ""}`}>
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
            <div id="admin" className={`tab-content ${activeTab === "admin" ? "active" : ""}`}>
                <div className="section">
                    <h2 className="section-title">User Access Management</h2>

                    <div className="toggle-container" style={{ marginBottom: 30 }}>
                        <label className="toggle-switch">
                            <input type="checkbox" checked={authRequired} onChange={(e) => onAuthRequiredToggle(e.target.checked)} />
                            <span className="slider" />
                        </label>
                        <div>
                            <div className="toggle-label">Require Authentication</div>
                            <div className="toggle-description">
                                When enabled, users must login with username/password and complete 2FA email verification. Access is valid for
                                24 hours. When disabled, anyone can access the avatar without credentials.
                            </div>
                        </div>
                    </div>

                    <div className="info-box">
                        ℹ️ When authentication is enabled, users receive a 2FA code via email for verification. Each session lasts 24 hours.
                    </div>

                    <button type="button" className="btn btn-primary" onClick={addNewUser} style={{ marginBottom: 20 }}>
                        ➕ Add New User
                    </button>

                    <div style={{ overflowX: "auto" }}>
                        <table className="log-table">
                            <thead>
                            <tr>
                                <th>Email</th>
                                <th>Created</th>
                                <th>Last Login</th>
                                <th>Actions</th>
                            </tr>
                            </thead>
                            <tbody>{usersRows}</tbody>
                        </table>
                    </div>

                    <h2 className="section-title" style={{ marginTop: 50 }}>
                        Administrator Credentials
                    </h2>

                    <div style={{ maxWidth: 600 }}>
                        <div className="input-group">
                            <label>Administrator Email</label>
                            <input type="email" defaultValue="admin@gokhale.cms" placeholder="Enter administrator email" />
                        </div>

                        <div className="input-group">
                            <label>Administrator Login</label>
                            <input type="text" defaultValue="admin" placeholder="Enter login" />
                        </div>

                        <div className="input-group">
                            <label>Current Password</label>
                            <input type="password" placeholder="Enter current password" />
                        </div>

                        <div className="input-group">
                            <label>New Password</label>
                            <input type="password" placeholder="Enter new password" />
                        </div>

                        <div className="input-group">
                            <label>Confirm New Password</label>
                            <input type="password" placeholder="Repeat new password" />
                        </div>

                        <div className="info-box">ℹ️ Email is used for password recovery. Make sure it&apos;s valid and accessible.</div>

                        <button type="button" className="btn btn-primary">
                            💾 Save Changes
                        </button>{" "}
                        <button type="button" className="btn btn-secondary">
                            ❌ Cancel
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

function RoleTechCard(props: { title: string; video: string; voice: string }) {
    return (
        <div className="role-technical-settings">
            <h3>{props.title}</h3>

            <div className="form-grid">
                <div className="input-group">
                    <label>Avatar Video ID</label>
                    <input type="text" defaultValue={props.video} placeholder="video_12345" />
                </div>

                <div className="input-group">
                    <label>Voice ID</label>
                    <input type="text" defaultValue={props.voice} placeholder="voice_id" />
                </div>

                <div className="input-group">
                    <label>Background Control</label>
                    <select defaultValue="enabled">
                        <option value="disabled">Disabled</option>
                        <option value="enabled">Enabled (Green Screen)</option>
                    </select>
                </div>
            </div>

            <button type="button" className="btn btn-primary btn-small">
                💾 Save
            </button>
        </div>
    );
}
