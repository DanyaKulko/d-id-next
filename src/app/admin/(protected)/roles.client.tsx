"use client";

import {useRouter} from "next/navigation";
import {
    type ChangeEvent,
    type FormEvent,
    useEffect,
    useMemo,
    useState,
    useTransition,
} from "react";
import toast from "react-hot-toast";
import { useDevMode } from "@/app/admin/(protected)/_components/dev-mode";

import {
    addAgentFromDidAction,
    deleteRoleAction,
    saveRoleSettingsAction,
    syncAgentFromDidAction,
    updateAgentOrderAction,
} from "@/app/admin/(protected)/actions";
import type {
    AgentKey,
    AgentListItem,
    AgentSettings,
    BackgroundItem,
} from "@/app/admin/(protected)/roles.types";

type RolesClientProps = {
    initialAgents: AgentListItem[];
    initialAgentKey?: string | null;
    initialAgentSettings?: AgentSettings | null;
};

const personalityOptions = [
    {value: "Friendly and Professional", label: "Friendly and Professional"},
    {value: "Fun and Engaging", label: "Fun and Engaging"},
    {value: "Warm and Supportive", label: "Warm and Supportive"},
    {value: "Direct and Concise", label: "Direct and Concise"},
    {value: "Sophisticated and Formal", label: "Sophisticated and Formal"},
    {value: "Confident and Persuasive", label: "Confident and Persuasive"},
];

const llmModelOptions = [
    "gpt-4o-global",
    "gpt-4o-mini",
    "gpt-4.1",
    "gpt-4.1-mini",
    "gpt-4.1-nano",
];

const llmTemplateOptions = [
    "rag-grounded",
    "rag-ungrounded",
    "assistant",
];

const voiceLanguageSuggestions = [
    "Multilingual",
    "English",
    "Russian",
    "Spanish",
    "French",
    "German",
    "Italian",
    "Portuguese",
    "Chinese",
    "Japanese",
    "Korean",
];

const personalityAliases: Record<string, string> = {
    friendly: "Friendly and Professional",
    fun: "Fun and Engaging",
    warm: "Warm and Supportive",
    direct: "Direct and Concise",
    sophisticated: "Sophisticated and Formal",
    confident: "Confident and Persuasive",
};

const normalizePersonalityStyle = (value?: string) => {
    if (!value) return personalityOptions[0].value;
    return personalityAliases[value] ?? value;
};

export default function RolesClient({
                                        initialAgents,
                                        initialAgentKey,
                                        initialAgentSettings,
                                    }: RolesClientProps) {
    const router = useRouter();
    const [agents, setAgents] = useState<AgentListItem[]>(initialAgents);
    const [activeAgentKey, setActiveAgentKey] = useState<AgentKey>(
        initialAgentKey ?? initialAgents[0]?.key ?? "",
    );
    const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(
        initialAgentSettings ?? null,
    );
    const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>(
        initialAgentSettings?.backgrounds ?? [],
    );
    const [isSaving, startSaving] = useTransition();
    const [isSyncing, startSyncing] = useTransition();
    const [isDeleting, startDeleting] = useTransition();
    const [isUploading, setIsUploading] = useState(false);
    const [showBackgroundModal, setShowBackgroundModal] = useState(false);
    const [backgroundFile, setBackgroundFile] = useState<File | null>(null);
    const [backgroundTitle, setBackgroundTitle] = useState("");
    const [backgroundEditing, setBackgroundEditing] =
        useState<BackgroundItem | null>(null);
    const [deleteAgentCandidate, setDeleteAgentCandidate] =
        useState<AgentListItem | null>(null);
    const [showAddAgentModal, setShowAddAgentModal] = useState(false);
    const [newAgentDisplayName, setNewAgentDisplayName] = useState("");
    const [newAgentDescription, setNewAgentDescription] = useState("");
    const [newAgentId, setNewAgentId] = useState("");
    const [isAdding, startAdding] = useTransition();
    const [isReordering, startReordering] = useTransition();
    const [draggedKey, setDraggedKey] = useState<AgentKey | null>(null);
    const [dragOverKey, setDragOverKey] = useState<AgentKey | null>(null);
    const { enabled: devModeEnabled } = useDevMode();

    useEffect(() => {
        setAgents(initialAgents);
    }, [initialAgents]);

    useEffect(() => {
        if (initialAgentKey) {
            setActiveAgentKey(initialAgentKey);
        }
    }, [initialAgentKey]);

    useEffect(() => {
        setAgentSettings(initialAgentSettings ?? null);
        setBackgrounds(initialAgentSettings?.backgrounds ?? []);
    }, [initialAgentSettings]);

    const handleSave = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!activeAgentKey) return;
        const formData = new FormData(event.currentTarget);
        if (!formData.get("displayName") || !formData.get("agentName")) {
            toast.error("Please fill out required fields before saving.");
            return;
        }
        formData.set("agentKey", activeAgentKey);
        formData.set("backgrounds", JSON.stringify(backgrounds));

        const backgroundsToggle =
            event.currentTarget.querySelector<HTMLInputElement>(
                'input[name="backgroundsEnabled"]',
            );
        if (backgroundsToggle) {
            formData.set(
                "backgroundsEnabled",
                backgroundsToggle.checked ? "on" : "off",
            );
        } else if (agentSettings) {
            formData.set(
                "backgroundsEnabled",
                agentSettings.backgroundsEnabled ? "on" : "off",
            );
        }

        startSaving(async () => {
            await saveRoleSettingsAction(formData)
                .then(() => {
                    const displayName = formData.get("displayName");
                    if (typeof displayName === "string" && displayName.trim()) {
                        setAgents((prev) =>
                            prev.map((agent) =>
                                agent.key === activeAgentKey
                                    ? {...agent, displayName: displayName.trim()}
                                    : agent,
                            ),
                        );
                    }
                    toast.success("Agent settings saved");
                })
                .catch(() => toast.error("Failed to save agent settings"));
        });
    };

    const syncFromDid = () => {
        if (!activeAgentKey) return;
        startSyncing(async () => {
            await syncAgentFromDidAction(activeAgentKey)
                .then((res) => {
                    if (res?.settings) {
                        setAgentSettings(res.settings);
                        setBackgrounds(res.settings.backgrounds);
                    }
                    toast.success("Agent synced from D-ID");
                })
                .catch(() => toast.error("Failed to sync agent from D-ID"));
        });
    };

    const removeBackground = async (id: string) => {
        const snapshot = backgrounds;
        setBackgrounds((prev) => prev.filter((bg) => bg.id !== id));

        try {
            const response = await fetch("/api/admin/backgrounds", {
                method: "DELETE",
                headers: {"Content-Type": "application/json"},
                body: JSON.stringify({id}),
            });

            if (!response.ok) {
                throw new Error("Failed to delete background");
            }

            toast.success("Background removed");
        } catch {
            setBackgrounds(snapshot);
            toast.error("Failed to remove background");
        }
    };

    const openBackgroundModal = (background?: BackgroundItem) => {
        setBackgroundFile(null);
        setBackgroundTitle(background?.title ?? "");
        setBackgroundEditing(background ?? null);
        // setBackgroundTheme("");
        setShowBackgroundModal(true);
    };

    const openAddAgentModal = () => {
        setNewAgentDisplayName("");
        setNewAgentDescription("");
        setNewAgentId("");
        setShowAddAgentModal(true);
    };

    const handleBackgroundFileChange = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        setBackgroundFile(file);
        if (!backgroundTitle) {
            setBackgroundTitle(file.name);
        }
    };

    const submitBackgroundUpload = async () => {
        if (!activeAgentKey) return;
        const file = backgroundFile;
        if (!file && !backgroundEditing) return;
        const title = backgroundTitle.trim() || file?.name || "";
        // const theme = backgroundTheme.trim() || "default";

        try {
            setIsUploading(true);
            const formData = new FormData();
            formData.set("agentKey", activeAgentKey);
            if (title) {
                formData.set("title", title);
            }
            if (file) {
                formData.set("file", file);
            }
            if (backgroundEditing) {
                formData.set("backgroundId", backgroundEditing.id);
            }

            const response = await fetch("/api/admin/backgrounds", {
                method: backgroundEditing ? "PATCH" : "POST",
                body: formData,
            });

            if (!response.ok) {
                toast.error(
                    backgroundEditing
                        ? "Failed to update background"
                        : "Failed to upload background",
                );
                return;
            }

            const newBackground = (await response.json()) as BackgroundItem;
            setBackgrounds((prev) =>
                backgroundEditing
                    ? prev.map((bg) => (bg.id === newBackground.id ? newBackground : bg))
                    : [...prev, newBackground],
            );
            toast.success(
                backgroundEditing ? "Background updated" : "Background uploaded",
            );
            setShowBackgroundModal(false);
        } catch {
            toast.error(
                backgroundEditing
                    ? "Failed to update background"
                    : "Failed to upload background",
            );
        } finally {
            setBackgroundFile(null);
            setBackgroundEditing(null);
            setIsUploading(false);
        }
    };

    const submitAddAgent = () => {
        const displayName = newAgentDisplayName.trim();
        const description = newAgentDescription.trim();
        const agentId = newAgentId.trim();

        if (!displayName || !agentId) {
            toast.error("Display name and D-ID Agent ID are required");
            return;
        }

        const formData = new FormData();
        formData.set("displayName", displayName);
        formData.set("description", description);
        formData.set("agentId", agentId);

        startAdding(async () => {
            await addAgentFromDidAction(formData)
                .then((res) => {
                    if (!res?.ok || !res.agentKey) {
                        throw new Error("Failed to add agent");
                    }
                    toast.success("Agent added and synced");
                    setShowAddAgentModal(false);
                    router.push(`/admin/roles/${res.agentKey}`);
                })
                .catch((error) => {
                    const message =
                        error instanceof Error ? error.message : "Failed to add agent";
                    toast.error(message);
                });
        });
    };

    const handleDeleteRole = () => {
        const current = agents.find((agent) => agent.key === activeAgentKey);
        if (!current) return;
        setDeleteAgentCandidate(current);
    };

    const confirmDeleteRole = async () => {
        const targetKey = deleteAgentCandidate?.key;
        if (!targetKey) return;
        startDeleting(async () => {
            try {
                await deleteRoleAction(targetKey);
                toast.success("Agent deleted");
                setDeleteAgentCandidate(null);
            } catch {
                toast.error("Failed to delete agent");
            }
        });
    };

    const reorderAgents = (
        list: AgentListItem[],
        sourceKey: AgentKey,
        targetKey: AgentKey,
    ) => {
        const sourceIndex = list.findIndex((agent) => agent.key === sourceKey);
        const targetIndex = list.findIndex((agent) => agent.key === targetKey);
        if (sourceIndex < 0 || targetIndex < 0) return list;
        const next = [...list];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(targetIndex, 0, moved);
        return next;
    };

    const persistAgentOrder = (
        nextAgents: AgentListItem[],
        snapshot: AgentListItem[],
    ) => {
        startReordering(async () => {
            try {
                const order = nextAgents.map((agent) => agent.key);
                const result = await updateAgentOrderAction(order);
                if (!result?.ok) {
                    setAgents(snapshot);
                    toast.error("Failed to save agent order");
                    return;
                }
                toast.success("Agent order saved");
            } catch (_error) {
                setAgents(snapshot);
                toast.error("Failed to save agent order");
            }
        });
    };

    const handleRoleDrop = (targetKey: AgentKey, sourceKey?: string | null) => {
        if (!devModeEnabled) {
            setDraggedKey(null);
            setDragOverKey(null);
            return;
        }
        const source = sourceKey?.trim() || draggedKey;
        if (!source || source === targetKey) {
            setDraggedKey(null);
            setDragOverKey(null);
            return;
        }
        const snapshot = agents;
        const next = reorderAgents(agents, source, targetKey);
        if (next === agents) {
            setDraggedKey(null);
            setDragOverKey(null);
            return;
        }
        setAgents(next);
        setDraggedKey(null);
        setDragOverKey(null);
        persistAgentOrder(next, snapshot);
    };

    const breadcrumbRole = useMemo(() => {
        const current = agents.find((agent) => agent.key === activeAgentKey);
        return current?.displayName ?? "Roles";
    }, [activeAgentKey, agents]);

    return (
        <>
            <div className="role-tabs">
                {agents.map((agent) => (
                    <button
                        key={agent.key}
                        type="button"
                        className={`role-tab ${activeAgentKey === agent.key ? "active" : ""} ${draggedKey === agent.key ? "is-dragging" : ""} ${dragOverKey === agent.key ? "is-drop-target" : ""}`}
                        draggable={devModeEnabled && !isReordering}
                        onDragStart={(event) => {
                            if (!devModeEnabled) return;
                            setDraggedKey(agent.key);
                            setDragOverKey(null);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", agent.key);
                        }}
                        onDragOver={(event) => {
                            if (!devModeEnabled) return;
                            if (draggedKey === agent.key) return;
                            event.preventDefault();
                            setDragOverKey(agent.key);
                            event.dataTransfer.dropEffect = "move";
                        }}
                        onDragLeave={() => {
                            if (!devModeEnabled) return;
                            if (dragOverKey === agent.key) {
                                setDragOverKey(null);
                            }
                        }}
                        onDrop={(event) => {
                            if (!devModeEnabled) return;
                            event.preventDefault();
                            handleRoleDrop(
                                agent.key,
                                event.dataTransfer?.getData("text/plain"),
                            );
                        }}
                        onDragEnd={() => {
                            if (!devModeEnabled) return;
                            setDraggedKey(null);
                            setDragOverKey(null);
                        }}
                        onClick={() => {
                            if (agent.key === activeAgentKey) return;
                            router.push(`/admin/roles/${agent.key}`);
                        }}
                    >
                        {agent.displayName}
                    </button>
                ))}

                <button
                  type="button"
                  className="add-role-tab"
                  onClick={openAddAgentModal}
                  disabled={!devModeEnabled}
                >
                  <span>➕</span> Add New Agent
                </button>
            </div>

            <BreadcrumbSync title={breadcrumbRole}/>

            {agents.length === 0 ? (
                <div className="section">
                    <div className="info-box">
                        ℹ️ TODO: Add at least one agent to configure roles.
                    </div>
                </div>
            ) : (
                <div className="role-content active">
                    <RoleContent
                        key={`${activeAgentKey}-${agentSettings ? "ready" : "loading"}`}
                        defaults={agentSettings}
                        backgrounds={backgrounds}
                        onBackgroundUpload={openBackgroundModal}
                        onBackgroundRemove={removeBackground}
                        onSubmit={handleSave}
                        onDelete={handleDeleteRole}
                        onSync={syncFromDid}
                        isSaving={isSaving}
                        isSyncing={isSyncing}
                        devModeEnabled={devModeEnabled}
                    />
                </div>
            )}

            {showBackgroundModal && (
                <div className="modal-backdrop" role="dialog" aria-modal="true">
                    <div className="modal-card">
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">
                                    {backgroundEditing
                                        ? "Replace Background"
                                        : "Upload Background"}
                                </div>
                                <div className="modal-subtitle">
                                    {backgroundEditing
                                        ? "Update the selected background image."
                                        : "Add a new background image for this agent."}
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => {
                                    setShowBackgroundModal(false);
                                    setBackgroundEditing(null);
                                }}
                            >
                                ✕ Close
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="input-group">
                                <label htmlFor="backgroundFile">Image file</label>
                                <input
                                    id="backgroundFile"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleBackgroundFileChange}
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="backgroundTitle">Title</label>
                                <input
                                    id="backgroundTitle"
                                    type="text"
                                    value={backgroundTitle}
                                    onChange={(event) => setBackgroundTitle(event.target.value)}
                                    placeholder="Background title"
                                />
                            </div>
                            {/*<div className="input-group">*/}
                            {/*    <label htmlFor="backgroundTheme">Theme</label>*/}
                            {/*    <input*/}
                            {/*        id="backgroundTheme"*/}
                            {/*        type="text"*/}
                            {/*        value={backgroundTheme}*/}
                            {/*        onChange={(event) => setBackgroundTheme(event.target.value)}*/}
                            {/*        placeholder="e.g. Sunset lounge"*/}
                            {/*    />*/}
                            {/*</div>*/}
                        </div>

                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => {
                                    setShowBackgroundModal(false);
                                    setBackgroundEditing(null);
                                }}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={submitBackgroundUpload}
                                disabled={isUploading}
                            >
                                {isUploading
                                    ? "Saving..."
                                    : backgroundEditing
                                        ? "Update Background"
                                        : "Upload Background"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showAddAgentModal && (
                <div className="modal-backdrop" role="dialog" aria-modal="true">
                    <div className="modal-card">
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Add Agent from D-ID</div>
                                <div className="modal-subtitle">
                                    Sync agent details from D-ID by ID and set the client-facing
                                    name.
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => setShowAddAgentModal(false)}
                            >
                                ✕ Close
                            </button>
                        </div>

                        <div className="modal-body">
                            <div className="input-group">
                                <label htmlFor="newAgentDisplayName">
                                    Role Name (Frontend Display)
                                </label>
                                <input
                                    id="newAgentDisplayName"
                                    type="text"
                                    value={newAgentDisplayName}
                                    onChange={(event) =>
                                        setNewAgentDisplayName(event.target.value)
                                    }
                                    placeholder="e.g. Tourism Neil"
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="newAgentDescription">Brief Description</label>
                                <textarea
                                    id="newAgentDescription"
                                    value={newAgentDescription}
                                    onChange={(event) =>
                                        setNewAgentDescription(event.target.value)
                                    }
                                    placeholder="Short description for the frontend"
                                />
                            </div>
                            <div className="input-group">
                                <label htmlFor="newAgentId">D-ID Agent ID</label>
                                <input
                                    id="newAgentId"
                                    type="text"
                                    value={newAgentId}
                                    onChange={(event) => setNewAgentId(event.target.value)}
                                    placeholder="v2_agt_..."
                                />
                            </div>
                        </div>

                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setShowAddAgentModal(false)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-primary"
                                onClick={submitAddAgent}
                                disabled={isAdding}
                            >
                                {isAdding ? "Adding..." : "Add Agent"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {deleteAgentCandidate && (
                <div className="modal-backdrop" role="dialog" aria-modal="true">
                    <div className="modal-card">
                        <div className="modal-header">
                            <div>
                                <div className="modal-title">Delete Agent</div>
                                <div className="modal-subtitle">
                                    This action cannot be undone.
                                </div>
                            </div>
                            <button
                                type="button"
                                className="btn btn-secondary btn-small"
                                onClick={() => setDeleteAgentCandidate(null)}
                            >
                                ✕ Close
                            </button>
                        </div>
                        <div className="modal-body">
                            <p>
                                Delete &quot;{deleteAgentCandidate.displayName}&quot; and all
                                related settings?
                            </p>
                        </div>
                        <div className="modal-footer">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => setDeleteAgentCandidate(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={confirmDeleteRole}
                                disabled={isDeleting}
                            >
                                {isDeleting ? "Deleting..." : "Delete Agent"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function BreadcrumbSync({title}: { title: string }) {
    useEffect(() => {
        const el = document.getElementById("current-role");
        if (el) el.textContent = title;
    }, [title]);

    return null;
}

function TooltipLabel(props: { title: string; text: string }) {
    return (
        <label className="with-tooltip" htmlFor={"#"}>
            {props.title}
      {/*      <span className="tooltip-icon" aria-hidden="true">*/}
      {/*  ?*/}
      {/*</span>*/}
            <span className="tooltip-text" role="tooltip">
        {props.text}
      </span>
        </label>
    );
}

function SectionTooltipTitle(props: { title: string; text: string }) {
    return (
        <h2 className="section-title-with-tooltip">
            {props.title}
            <span className="section-tooltip-icon" aria-hidden="true">
        ?
      </span>
            <span className="section-tooltip-text" role="tooltip">
        {props.text}
      </span>
        </h2>
    );
}

type RoleContentProps = {
    defaults: AgentSettings | null;
    backgrounds: BackgroundItem[];
    onBackgroundUpload: (background?: BackgroundItem) => void;
    onBackgroundRemove: (id: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    onDelete: () => void;
    onSync: () => void;
    isSaving: boolean;
    isSyncing: boolean;
    devModeEnabled: boolean;
};

function RoleContent({
                         defaults,
                         backgrounds,
                         onBackgroundUpload,
                         onBackgroundRemove,
                         onSubmit,
                         onDelete,
                         onSync,
                         isSaving,
                         isSyncing,
                         devModeEnabled,
                     }: RoleContentProps) {
    const currentVoiceLanguage = (defaults?.voiceLanguage ?? "").trim() || "Multilingual";
    const voiceLanguageOptions = voiceLanguageSuggestions.includes(currentVoiceLanguage)
        ? voiceLanguageSuggestions
        : [currentVoiceLanguage, ...voiceLanguageSuggestions];
    const isReadOnly = !devModeEnabled;

    return (
        <form className="section" onSubmit={onSubmit}>
            <h2 className="section-title">Display Settings</h2>

            <div className="form-grid">
                <div className="input-group form-full">
                    <TooltipLabel
                        title="Role Name (Frontend Display)"
                        text="The name of the role displayed to users on the frontend site and used for navigation and role selection; this name is only for visual display and user understanding and does not affect the intelligence, behavior, or logic of the avatar."
                    />
                    <input
                        name="displayName"
                        type="text"
                        defaultValue={defaults?.displayName ?? ""}
                        placeholder="Enter role name"
                    />
                </div>

                <div className="input-group form-full">
                    <TooltipLabel
                        title="Brief Description"
                        text="A short text description of the role shown to users on the frontend that helps them understand what topics and questions can be addressed to this role; used exclusively for the interface and does not affect the avatar's responses or behavior."
                    />
                    <textarea
                        name="description"
                        defaultValue={defaults?.description ?? ""}
                        placeholder="Enter description"
                    />
                </div>

                <div className="input-group form-full">
                    <TooltipLabel
                        title="Mobile video offset (px)"
                        text="Shift the avatar video left/right on mobile. Use negative values to move left, positive to move right."
                    />
                    <input
                        name="mobileVideoOffsetPx"
                        type="number"
                        step="1"
                        defaultValue={defaults?.mobileVideoOffsetPx ?? 0}
                        placeholder="0"
                        disabled={isReadOnly}
                    />
                    {isReadOnly && (
                        <input
                            type="hidden"
                            name="mobileVideoOffsetPx"
                            value={defaults?.mobileVideoOffsetPx ?? 0}
                        />
                    )}
                </div>
            </div>

            <h2 className="section-title">Personalization</h2>

            <div className="input-group">
                <TooltipLabel
                    title="Agent id"
                    text="The internal name the avatar uses for self-identification; this name participates in the working logic, influences response formation, and determines how the avatar perceives its own identity within the system."
                />
                <input
                    name="agentName"
                    type="text"
                    defaultValue={defaults?.agentId ?? ""}
                    placeholder="Enter agent name"
                    disabled={true}
                />
            </div>
            <div className="input-group">
                <TooltipLabel
                    title="Agent Name"
                    text="The internal name the avatar uses for self-identification; this name participates in the working logic, influences response formation, and determines how the avatar perceives its own identity within the system."
                />
                <input
                    name="agentName"
                    type="text"
                    defaultValue={defaults?.agentName ?? ""}
                    placeholder="Enter agent name"
                />
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="Persona / Role Description"
                    text="A detailed description of the role defining the character, communication style, topic areas for responses, acceptable and unacceptable assistance formats, and the overall behavioral model of the avatar when interacting with users."
                />
                <textarea
                    name="persona"
                    defaultValue={defaults?.persona ?? ""}
                    placeholder="Enter persona details"
                />
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="System Prompt / Instructions"
                    text="The main system instruction that determines how the avatar thinks, which knowledge sources it uses, how it formulates responses, and in what format it delivers them; this is one of the key fields directly affecting the quality, stability, and predictability of responses."
                />
                <textarea
                    name="systemPrompt"
                    defaultValue={defaults?.systemPrompt ?? ""}
                    placeholder="Enter system prompt"
                />
            </div>
            <div className="input-group">
                <label htmlFor="voiceId">Voice ID</label>
                <input
                    id="voiceId"
                    name="voiceId"
                    type="text"
                    defaultValue={defaults?.voiceId ?? ""}
                    placeholder="voice_neil_basic"
                    disabled={isReadOnly}
                />
                {isReadOnly && (
                    <input
                        type="hidden"
                        name="voiceId"
                        value={defaults?.voiceId ?? ""}
                    />
                )}
            </div>
            <div className="input-group">
                <label htmlFor="voiceLanguage">Voice Language</label>
                <select
                    id="voiceLanguage"
                    name="voiceLanguage"
                    defaultValue={currentVoiceLanguage}
                    disabled={isReadOnly}
                >
                    {voiceLanguageOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
                {isReadOnly && (
                    <input
                        type="hidden"
                        name="voiceLanguage"
                        value={currentVoiceLanguage}
                    />
                )}
            </div>
            <div className="input-group">
                <label htmlFor="llmModel">LLM Model</label>
                <select
                    id="llmModel"
                    name="llmModel"
                    defaultValue={defaults?.llmModel ?? "gpt-4o-mini"}
                    disabled={isReadOnly}
                >
                    {llmModelOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
                {isReadOnly && (
                    <input
                        type="hidden"
                        name="llmModel"
                        value={defaults?.llmModel ?? "gpt-4o-mini"}
                    />
                )}
            </div>
            <div className="input-group">
                <label htmlFor="llmTemplate">LLM Template</label>
                <select
                    id="llmTemplate"
                    name="llmTemplate"
                    defaultValue={defaults?.llmTemplate ?? "rag-ungrounded"}
                    disabled={isReadOnly}
                >
                    {llmTemplateOptions.map((option) => (
                        <option key={option} value={option}>
                            {option}
                        </option>
                    ))}
                </select>
                {isReadOnly && (
                    <input
                        type="hidden"
                        name="llmTemplate"
                        value={defaults?.llmTemplate ?? "rag-ungrounded"}
                    />
                )}
            </div>
            <div className="input-group">
                <TooltipLabel
                    title="Personality Style"
                    text="A set of preset communication styles that slightly adjust the tone and manner of the avatar's responses (e.g., more formal or more friendly), without changing the knowledge content and reasoning logic."
                />
                <select
                    name="personalityStyle"
                    defaultValue={normalizePersonalityStyle(defaults?.personalityStyle)}
                    disabled={isReadOnly}
                >
                    {personalityOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                {isReadOnly && (
                    <input
                        type="hidden"
                        name="personalityStyle"
                        value={normalizePersonalityStyle(defaults?.personalityStyle)}
                    />
                )}
            </div>

            <SectionTooltipTitle
                title="Backgrounds"
                text="A set of background images used for avatars with transparent (green screen) video that can be selected by users on the frontend; backgrounds can be added and removed, and they only affect the visual design, not the avatar's behavior."
            />

            <div className="info-box">
                ℹ️ Upload background images for Green Screen mode. Users will be able to
                switch backgrounds on the frontend.
            </div>
            <div className="input-group">
                <label htmlFor="backgroundsEnabled">Enable Backgrounds</label>
                <div className="toggle-row">
                <input
                    id="backgroundsEnabled"
                    name="backgroundsEnabled"
                    type="checkbox"
                    defaultChecked={defaults?.backgroundsEnabled ?? false}
                />
                    <span>Allow background selection on the main page</span>
                </div>
            </div>
            <div className="input-group">
                <label htmlFor="backgroundKeyColor">Background Key Color</label>
                <select
                    id="backgroundKeyColor"
                    name="backgroundKeyColor"
                    defaultValue={defaults?.backgroundKeyColor ?? "white"}
                >
                    <option value="white">White screen</option>
                    <option value="green">Green screen</option>
                </select>
            </div>
            <div className="backgrounds-grid">
                {backgrounds.map((background) => (
                    <div key={background.id} className="background-card">
                        <div
                            className="background-preview"
                            style={
                                background.url
                                    ? {
                                        backgroundImage: `url(${background.url})`,
                                        backgroundSize: "cover",
                                        backgroundPosition: "center",
                                    }
                                    : undefined
                            }
                        />
                        <div className="background-title">{background.title}</div>
                        <div className="background-actions">
                            <button
                                type="button"
                                className="btn btn-secondary"
                                onClick={() => onBackgroundUpload(background)}
                            >
                                ✏️ Replace
                            </button>
                            <button
                                type="button"
                                className="btn btn-danger"
                                onClick={() => onBackgroundRemove(background.id)}
                            >
                                🗑️ Delete
                            </button>
                        </div>
                    </div>
                ))}

                {/** biome-ignore lint/a11y/useSemanticElements: 1 */}
                <div
                    className="add-background-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => onBackgroundUpload()}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ")
                            (e.currentTarget as HTMLDivElement).click();
                    }}
                >
                    <div className="add-background-content">
                        <div className="icon">➕</div>
                        <div>
                            <strong>Add New Background</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="info-box" style={{marginTop: 10}}>
                Max upload size: {25} MB
            </div>

            <div className="save-section">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    {isSaving ? "Saving..." : "💾 Save Changes"}
                </button>
                <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={onSync}
                    disabled={isSyncing || isSaving || !devModeEnabled}
                >
                    {isSyncing ? "Syncing..." : "🔄 Sync from D-ID"}
                </button>
            </div>

            <div className="delete-role-section">
                <h3>⚠️ Danger Zone</h3>
                <p>
                    Deleting this agent will permanently remove all its settings,
                    configurations, and data. This action cannot be undone.
                </p>
                <button
                    type="button"
                    className="btn btn-danger"
                    onClick={onDelete}
                    disabled={!devModeEnabled}
                >
                    🗑️ Delete This Agent
                </button>
            </div>
        </form>
    );
}
