"use client";

import {type ChangeEvent, type FormEvent, useEffect, useMemo, useRef, useState, useTransition} from "react";
import toast from "react-hot-toast";

import {saveMainSettingsAction, saveRoleSettingsAction} from "@/app/admin/(protected)/actions";
import {
    type BackgroundItem,
    fetchMainAdminSettings,
    fetchRoleList,
    fetchRoleSettings,
    type MainAdminSettings,
    type RoleId,
    type RoleSettings,
} from "@/app/admin/(protected)/admin-data";

export default function RolesClient() {
    const [activeRole, setActiveRole] = useState<RoleId>("basic");
    const [rolesMeta, setRolesMeta] = useState<Record<RoleId, string>>({
        basic: "Basic Neil",
        tourism: "Tourism Neil",
        sports: "Sports Neil",
        politics: "Politics Neil",
        space: "Space Neil",
    });
    const [roleSettings, setRoleSettings] = useState<RoleSettings | null>(null);
    const [backgrounds, setBackgrounds] = useState<BackgroundItem[]>([]);
    const [isSaving, startSaving] = useTransition();
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        fetchRoleSettings(activeRole).then((settings) => {
            setRoleSettings(settings);
            setBackgrounds(settings.backgrounds);
        });
    }, [activeRole]);

    const handleSave = (event: FormEvent<HTMLFormElement>, roleId: RoleId) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        if (!formData.get("displayName") || !formData.get("agentName")) {
            toast.error("Please fill out required fields before saving.");
            return;
        }
        formData.set("roleId", roleId);
        formData.set("backgrounds", JSON.stringify(backgrounds));

        startSaving(async () => {
            await saveRoleSettingsAction(formData)
                .then(() => toast.success("Role settings saved"))
                .catch(() => toast.error("Failed to save role settings"))
        });
    };

    const removeBackground = (id: string) => {
        setBackgrounds((prev) => prev.filter((bg) => bg.id !== id));
        toast.success("Background removed");
    };

    const handleBackgroundFile = (event: ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;
        const title = window.prompt("Enter background title", file.name) || file.name;
        const themeInput = window.prompt("Enter theme (forest, studio, home, space)", "forest")?.toLowerCase();
        const theme = themeInput === "studio" || themeInput === "home" || themeInput === "space" ? themeInput : "forest";

        const newBackground: BackgroundItem = {
            id: `${Date.now()}`,
            title,
            theme,
        };

        setBackgrounds((prev) => [...prev, newBackground]);
        toast.success("Background uploaded (mock)");
        event.target.value = "";
    };

    const triggerBackgroundUpload = () => {
        fileInputRef.current?.click();
    };

    const breadcrumbRole = useMemo(() => rolesMeta[activeRole], [activeRole, rolesMeta]);

    return (
        <>
            <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                style={{display: "none"}}
                onChange={handleBackgroundFile}
            />

            {/* Role Tabs */}
            <div className="role-tabs">
                <button
                    type="button"
                    className={`role-tab ${activeRole === "basic" ? "active" : ""}`}
                    onClick={() => setActiveRole("basic")}
                >
                    <span>🎭</span> {rolesMeta.basic}
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "tourism" ? "active" : ""}`}
                    onClick={() => setActiveRole("tourism")}
                >
                    <span>✈️</span> {rolesMeta.tourism}
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "sports" ? "active" : ""}`}
                    onClick={() => setActiveRole("sports")}
                >
                    <span>⚽</span> {rolesMeta.sports}
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "politics" ? "active" : ""}`}
                    onClick={() => setActiveRole("politics")}
                >
                    <span>🏛️</span> {rolesMeta.politics}
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "space" ? "active" : ""}`}
                    onClick={() => setActiveRole("space")}
                >
                    <span>🚀</span> {rolesMeta.space}
                </button>

                <button
                    type="button"
                    className="add-role-tab"
                    onClick={() => {
                        const roleName = window.prompt("Enter the name for the new role:", "New Neil Role");
                        if (roleName?.trim()) {
                            window.alert(
                                `New role "${roleName}" would be created here.\n\nThe system would:\n- Create a new role tab\n- Generate default settings\n- Allow you to configure all parameters`
                            );
                        }
                    }}
                >
                    <span>➕</span> Add New Role
                </button>
            </div>

            {/* Breadcrumb sync (1:1 поведение) */}
            <BreadcrumbSync title={breadcrumbRole}/>

            {/* Contents */}
            <div id="basic" className={`role-content ${activeRole === "basic" ? "active" : ""}`}>
                <RoleContentBasic
                    defaults={roleSettings}
                    backgrounds={backgrounds}
                    onBackgroundUpload={triggerBackgroundUpload}
                    onBackgroundRemove={removeBackground}
                    onSubmit={(event) => handleSave(event, "basic")}
                    isSaving={isSaving}
                />
            </div>

            <div id="tourism" className={`role-content ${activeRole === "tourism" ? "active" : ""}`}>
                <RoleContentTourism
                    defaults={roleSettings}
                    backgrounds={backgrounds}
                    onBackgroundUpload={triggerBackgroundUpload}
                    onBackgroundRemove={removeBackground}
                    onSubmit={(event) => handleSave(event, "tourism")}
                    isSaving={isSaving}
                />
            </div>

            {/* Заглушки, структура аналогична */}
            <div id="sports" className={`role-content ${activeRole === "sports" ? "active" : ""}`}>
                <RoleContentPlaceholder name="Sports Neil"/>
            </div>

            <div id="politics" className={`role-content ${activeRole === "politics" ? "active" : ""}`}>
                <RoleContentPlaceholder name="Politics Neil"/>
            </div>

            <div id="space" className={`role-content ${activeRole === "space" ? "active" : ""}`}>
                <RoleContentPlaceholder name="Space Neil"/>
            </div>
        </>
    );
}

function BreadcrumbSync({title}: { title: string }) {
    // чисто визуально “как в статике”: меняем текст хлебных крошек
    // без прямого DOM: просто рендерим поверх, но у тебя в page.tsx id="current-role"
    // поэтому сделаем через эффект:
    // Можно и без эффекта — просто в page.tsx прокинуть breadcrumbRole.
    // Чтобы не переписывать page.tsx, делаем effect.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useMemo(() => {
        const el = document.getElementById("current-role");
        if (el) el.textContent = title;
    }, [title]);

    return null;
}

function TooltipLabel(props: { title: string; text: string }) {
    return (
        <label className="with-tooltip" htmlFor={'#'}>
            {props.title}
            <span className="tooltip-icon" aria-hidden="true">
                ?
            </span>
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
    defaults: RoleSettings | null;
    backgrounds: BackgroundItem[];
    onBackgroundUpload: () => void;
    onBackgroundRemove: (id: string) => void;
    onSubmit: (event: FormEvent<HTMLFormElement>) => void;
    isSaving: boolean;
};

function RoleContentBasic({
                              defaults,
                              backgrounds,
                              onBackgroundUpload,
                              onBackgroundRemove,
                              onSubmit,
                              isSaving
                          }: RoleContentProps) {
    return (
        <form className="section" onSubmit={onSubmit}>
            <h2 className="section-title">Display Settings</h2>

            <div className="form-grid">
                <div className="input-group form-full">
                    <TooltipLabel
                        title="Role Name (Frontend Display)"
                        text="The name of the role displayed to users on the frontend site and used for navigation and role selection; this name is only for visual display and user understanding and does not affect the intelligence, behavior, or logic of the avatar."
                    />
                    <input name="displayName" type="text" defaultValue={defaults?.displayName ?? ""}
                           placeholder="Enter role name"/>
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
            </div>

            <h2 className="section-title">Personalization</h2>

            <div className="input-group">
                <TooltipLabel
                    title="Agent Name"
                    text="The internal name the avatar uses for self-identification; this name participates in the working logic, influences response formation, and determines how the avatar perceives its own identity within the system."
                />
                <input name="agentName" type="text" defaultValue={defaults?.agentName ?? ""}
                       placeholder="Enter agent name"/>
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
                    // value={mainSettings.voiceId}
                    placeholder="voice_neil_basic"
                    // onChange={(event) => updateMainSettings({voiceId: event.target.value})}
                />
            </div>
            <div className="input-group">
                <TooltipLabel
                    title="Personality Style"
                    text="A set of preset communication styles that slightly adjust the tone and manner of the avatar's responses (e.g., more formal or more friendly), without changing the knowledge content and reasoning logic."
                />
                <select name="personalityStyle" defaultValue={defaults?.personalityStyle ?? "friendly"}>
                    <option value="friendly">Friendly and Professional</option>
                    <option value="fun">Fun and Engaging</option>
                    <option value="warm">Warm and Supportive</option>
                    <option value="direct">Direct and Concise</option>
                    <option value="sophisticated">Sophisticated and Formal</option>
                    <option value="confident">Confident and Persuasive</option>
                </select>
            </div>

            <SectionTooltipTitle
                title="Backgrounds"
                text="A set of background images used for avatars with transparent (green screen) video that can be selected by users on the frontend; backgrounds can be added and removed, and they only affect the visual design, not the avatar's behavior."
            />

            <div className="info-box">
                ℹ️ Upload background images for Green Screen mode. Users will be able to switch backgrounds on the
                frontend.
            </div>
            <div className="input-group">
                <label htmlFor="backgroundsEnabled">Enable Backgrounds</label>
                <div className="toggle-row">
                    <input
                        id="backgroundsEnabled"
                        name="backgroundsEnabled"
                        type="checkbox"
                        // checked={mainSettings.backgroundsEnabled}
                        // onChange={(event) => updateMainSettings({backgroundsEnabled: event.target.checked})}
                    />
                    <span>Allow background selection on the main page</span>
                </div>
                {/*<div className="info-box" style={{marginTop: 10}}>*/}
                    {/*Max upload size: {mainSettings.backgroundUploadLimitMb} MB*/}
                {/*</div>*/}
            </div>
            <div className="backgrounds-grid">
                {backgrounds.map((background) => (
                    <div key={background.id} className={`background-card ${background.theme}`}>
                        <div
                            className="background-preview">{background.theme === "forest" ? "🌲 Forest" : background.theme === "studio" ? "🎬 Studio" : background.theme === "space" ? "🚀 Space" : "🏠 Home"}</div>
                        <div className="background-title">{background.title}</div>
                        <div className="background-actions">
                            <button type="button" className="btn btn-secondary" onClick={onBackgroundUpload}>
                                ✏️ Replace
                            </button>
                            <button type="button" className="btn btn-danger"
                                    onClick={() => onBackgroundRemove(background.id)}>
                                🗑️ Delete
                            </button>
                        </div>
                    </div>
                ))}


                {/** biome-ignore lint/a11y/useSemanticElements: 1 */}
                <div className="add-background-card" role="button" tabIndex={0} onClick={onBackgroundUpload}
                     onKeyDown={(e) => {
                         if (e.key === "Enter" || e.key === " ") (e.currentTarget as HTMLDivElement).click();
                     }}>
                    <div className="add-background-content">
                        <div className="icon">➕</div>
                        <div>
                            <strong>Add New Background</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="save-section">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    {isSaving ? "Saving..." : "💾 Save Changes"}
                </button>
                <button type="reset" className="btn btn-secondary" disabled={isSaving}>
                    🔄 Reset
                </button>
            </div>

            <div className="delete-role-section">
                <h3>⚠️ Danger Zone</h3>
                <p>
                    Deleting this role will permanently remove all its settings, configurations, and data. This action
                    cannot be undone.
                </p>
                <button
                    type="button"
                    className="btn btn-danger"
                    onClick={() => {
                        const c1 = window.confirm(
                            "Are you sure you want to delete this role?\n\nThis action cannot be undone. All settings, configurations, and data for this role will be permanently removed."
                        );
                        if (!c1) return;
                        const c2 = window.confirm("Final confirmation: Delete this role permanently?");
                        if (!c2) return;
                        window.alert(
                            "Role would be deleted here.\n\nThe system would:\n- Remove the role tab\n- Delete all associated settings\n- Archive the configuration for potential recovery"
                        );
                    }}
                >
                    🗑️ Delete This Role
                </button>
            </div>
        </form>
    );
}

function RoleContentTourism({
                                defaults,
                                backgrounds,
                                onBackgroundUpload,
                                onBackgroundRemove,
                                onSubmit,
                                isSaving
                            }: RoleContentProps) {
    return (
        <form className="section" onSubmit={onSubmit}>
            <h2 className="section-title">Display Settings</h2>

            <div className="form-grid">
                <div className="input-group form-full">
                    <TooltipLabel
                        title="Role Name (Frontend Display)"
                        text="The name of the role displayed to users on the frontend site and used for navigation and role selection; this name is only for visual display and user understanding and does not affect the intelligence, behavior, or logic of the avatar."
                    />
                    <input name="displayName" type="text" defaultValue={defaults?.displayName ?? ""}
                           placeholder="Enter role name"/>
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
            </div>

            <h2 className="section-title">Personalization</h2>

            <div className="input-group">
                <TooltipLabel
                    title="Agent Name"
                    text="The internal name the avatar uses for self-identification; this name participates in the working logic, influences response formation, and determines how the avatar perceives its own identity within the system."
                />
                <input name="agentName" type="text" defaultValue={defaults?.agentName ?? ""}
                       placeholder="Enter agent name"/>
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
                <TooltipLabel
                    title="Personality Style"
                    text="A set of preset communication styles that slightly adjust the tone and manner of the avatar's responses (e.g., more formal or more friendly), without changing the knowledge content and reasoning logic."
                />
                <select name="personalityStyle" defaultValue={defaults?.personalityStyle ?? "friendly"}>
                    <option value="friendly">Friendly and Professional</option>
                    <option value="fun">Fun and Engaging</option>
                    <option value="warm">Warm and Supportive</option>
                </select>
            </div>

            <SectionTooltipTitle
                title="Backgrounds"
                text="A set of background images used for avatars with transparent (green screen) video that can be selected by users on the frontend; backgrounds can be added and removed, and they only affect the visual design, not the avatar's behavior."
            />

            <div className="info-box">
                ℹ️ Upload background images for Green Screen mode. Users will be able to switch backgrounds on the
                frontend.
            </div>

            <div className="backgrounds-grid">
                {backgrounds.map((background) => (
                    <div key={background.id} className={`background-card ${background.theme}`}>
                        <div
                            className="background-preview">{background.theme === "forest" ? "🌲 Forest" : background.theme === "studio" ? "🎬 Studio" : background.theme === "space" ? "🚀 Space" : "🏠 Home"}</div>
                        <div className="background-title">{background.title}</div>
                        <div className="background-actions">
                            <button type="button" className="btn btn-secondary" onClick={onBackgroundUpload}>
                                ✏️ Replace
                            </button>
                            <button type="button" className="btn btn-danger"
                                    onClick={() => onBackgroundRemove(background.id)}>
                                🗑️ Delete
                            </button>
                        </div>
                    </div>
                ))}

                {/** biome-ignore lint/a11y/useSemanticElements: 1 */}
                <div className="add-background-card" role="button" tabIndex={0} onClick={onBackgroundUpload}
                     onKeyDown={(e) => {
                         if (e.key === "Enter" || e.key === " ") (e.currentTarget as HTMLDivElement).click();
                     }}>
                    <div className="add-background-content">
                        <div className="icon">➕</div>
                        <div>
                            <strong>Add New Background</strong>
                        </div>
                    </div>
                </div>
            </div>

            <div className="save-section">
                <button type="submit" className="btn btn-primary" disabled={isSaving}>
                    {isSaving ? "Saving..." : "💾 Save Changes"}
                </button>
                <button type="reset" className="btn btn-secondary" disabled={isSaving}>
                    🔄 Reset
                </button>
            </div>

            <div className="delete-role-section">
                <h3>⚠️ Danger Zone</h3>
                <p>
                    Deleting this role will permanently remove all its settings, configurations, and data. This action
                    cannot be undone.
                </p>
                <button type="button" className="btn btn-danger">
                    🗑️ Delete This Role
                </button>
            </div>
        </form>
    );
}

function RoleContentPlaceholder({name}: { name: string }) {
    return (
        <div className="section">
            <h2 className="section-title">{name}</h2>
            <div className="info-box">ℹ️ This section can be ported аналогично (1:1) по тому же шаблону.</div>
        </div>
    );
}
