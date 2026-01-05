"use client";

import {useMemo, useState} from "react";

type RoleId = "basic" | "tourism" | "sports" | "politics" | "space";

const roleNames: Record<RoleId, string> = {
    basic: "Basic Neil",
    tourism: "Tourism Neil",
    sports: "Sports Neil",
    politics: "Politics Neil",
    space: "Space Neil",
};

export default function RolesClient() {
    const [activeRole, setActiveRole] = useState<RoleId>("basic");

    const breadcrumbRole = useMemo(() => roleNames[activeRole], [activeRole]);

    return (
        <>
            {/* Role Tabs */}
            <div className="role-tabs" aria-label="Role tabs">
                <button
                    type="button"
                    className={`role-tab ${activeRole === "basic" ? "active" : ""}`}
                    onClick={() => setActiveRole("basic")}
                >
                    <span>🎭</span> Basic Neil
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "tourism" ? "active" : ""}`}
                    onClick={() => setActiveRole("tourism")}
                >
                    <span>✈️</span> Tourism Neil
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "sports" ? "active" : ""}`}
                    onClick={() => setActiveRole("sports")}
                >
                    <span>⚽</span> Sports Neil
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "politics" ? "active" : ""}`}
                    onClick={() => setActiveRole("politics")}
                >
                    <span>🏛️</span> Politics Neil
                </button>

                <button
                    type="button"
                    className={`role-tab ${activeRole === "space" ? "active" : ""}`}
                    onClick={() => setActiveRole("space")}
                >
                    <span>🚀</span> Space Neil
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
                <RoleContentBasic/>
            </div>

            <div id="tourism" className={`role-content ${activeRole === "tourism" ? "active" : ""}`}>
                <RoleContentTourism/>
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
        <label className="with-tooltip">
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

function RoleContentBasic() {
    return (
        <div className="section">
            <h2 className="section-title">Display Settings</h2>

            <div className="form-grid">
                <div className="input-group form-full">
                    <TooltipLabel
                        title="Role Name (Frontend Display)"
                        text="The name of the role displayed to users on the frontend site and used for navigation and role selection; this name is only for visual display and user understanding and does not affect the intelligence, behavior, or logic of the avatar."
                    />
                    <input type="text" defaultValue="Basic Neil" placeholder="Enter role name"/>
                </div>

                <div className="input-group form-full">
                    <TooltipLabel
                        title="Brief Description"
                        text="A short text description of the role shown to users on the frontend that helps them understand what topics and questions can be addressed to this role; used exclusively for the interface and does not affect the avatar's responses or behavior."
                    />
                    <textarea
                        defaultValue="The main version of Neil. A universal personality for general questions about life, career, and experience."/>
                </div>
            </div>

            <h2 className="section-title">Personalization</h2>

            <div className="input-group">
                <TooltipLabel
                    title="Agent Name"
                    text="The internal name the avatar uses for self-identification; this name participates in the working logic, influences response formation, and determines how the avatar perceives its own identity within the system."
                />
                <input type="text" defaultValue="Neil" placeholder="Enter agent name"/>
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="Persona / Role Description"
                    text="A detailed description of the role defining the character, communication style, topic areas for responses, acceptable and unacceptable assistance formats, and the overall behavioral model of the avatar when interacting with users."
                />
                <textarea
                    defaultValue="You are Neil, a space enthusiast, traveler, and analyst. You share your experiences, answer questions about life, career, and hobbies. Your style is friendly but professional."/>
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="System Prompt / Instructions"
                    text="The main system instruction that determines how the avatar thinks, which knowledge sources it uses, how it formulates responses, and in what format it delivers them; this is one of the key fields directly affecting the quality, stability, and predictability of responses."
                />
                <textarea
                    defaultValue="You are Neil, a knowledgeable and friendly AI avatar. Answer questions based on Neil's personal experiences, blog posts, and knowledge base. Maintain a conversational yet informative tone."/>
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="Personality Style"
                    text="A set of preset communication styles that slightly adjust the tone and manner of the avatar's responses (e.g., more formal or more friendly), without changing the knowledge content and reasoning logic."
                />
                <select defaultValue="friendly">
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

            <div className="backgrounds-grid">
                <div className="background-card forest">
                    <div className="background-preview">🌲 Forest</div>
                    <div className="background-title">Background #1: Forest</div>
                    <div className="background-actions">
                        <button type="button" className="btn btn-secondary">
                            ✏️ Edit
                        </button>
                        <button type="button" className="btn btn-danger">
                            🗑️ Delete
                        </button>
                    </div>
                </div>

                <div className="background-card studio">
                    <div className="background-preview">🎬 Studio</div>
                    <div className="background-title">Background #2: Studio</div>
                    <div className="background-actions">
                        <button type="button" className="btn btn-secondary">
                            ✏️ Edit
                        </button>
                        <button type="button" className="btn btn-danger">
                            🗑️ Delete
                        </button>
                    </div>
                </div>

                <div className="background-card home">
                    <div className="background-preview">🏠 Home</div>
                    <div className="background-title">Background #3: Home</div>
                    <div className="background-actions">
                        <button type="button" className="btn btn-secondary">
                            ✏️ Edit
                        </button>
                        <button type="button" className="btn btn-danger">
                            🗑️ Delete
                        </button>
                    </div>
                </div>

                <div
                    className="add-background-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                        window.alert(
                            "Background upload dialog would open here.\n\nYou would be able to:\n- Upload an image file\n- Enter a background name\n- Preview the background"
                        );
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") (e.currentTarget as HTMLDivElement).click();
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

            <div className="save-section">
                <button type="button" className="btn btn-primary">
                    💾 Save Changes
                </button>
                <button type="button" className="btn btn-secondary">
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
        </div>
    );
}

function RoleContentTourism() {
    return (
        <div className="section">
            <h2 className="section-title">Display Settings</h2>

            <div className="form-grid">
                <div className="input-group form-full">
                    <TooltipLabel
                        title="Role Name (Frontend Display)"
                        text="The name of the role displayed to users on the frontend site and used for navigation and role selection; this name is only for visual display and user understanding and does not affect the intelligence, behavior, or logic of the avatar."
                    />
                    <input type="text" defaultValue="Tourism Neil" placeholder="Enter role name"/>
                </div>

                <div className="input-group form-full">
                    <TooltipLabel
                        title="Brief Description"
                        text="A short text description of the role shown to users on the frontend that helps them understand what topics and questions can be addressed to this role; used exclusively for the interface and does not affect the avatar's responses or behavior."
                    />
                    <textarea
                        defaultValue="Neil's tourism-focused personality. Expert in travel destinations, cultural insights, and travel tips."/>
                </div>
            </div>

            <h2 className="section-title">Personalization</h2>

            <div className="input-group">
                <TooltipLabel
                    title="Agent Name"
                    text="The internal name the avatar uses for self-identification; this name participates in the working logic, influences response formation, and determines how the avatar perceives its own identity within the system."
                />
                <input type="text" defaultValue="Neil" placeholder="Enter agent name"/>
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="Persona / Role Description"
                    text="A detailed description of the role defining the character, communication style, topic areas for responses, acceptable and unacceptable assistance formats, and the overall behavioral model of the avatar when interacting with users."
                />
                <textarea
                    defaultValue="You are Tourism Neil, an experienced traveler and cultural explorer. Share travel insights, destination recommendations, and cultural knowledge."/>
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="System Prompt / Instructions"
                    text="The main system instruction that determines how the avatar thinks, which knowledge sources it uses, how it formulates responses, and in what format it delivers them; this is one of the key fields directly affecting the quality, stability, and predictability of responses."
                />
                <textarea
                    defaultValue="You are Tourism Neil. Answer questions about travel destinations, cultural experiences, and tourism tips. Be enthusiastic and inspiring."/>
            </div>

            <div className="input-group">
                <TooltipLabel
                    title="Personality Style"
                    text="A set of preset communication styles that slightly adjust the tone and manner of the avatar's responses (e.g., more formal or more friendly), without changing the knowledge content and reasoning logic."
                />
                <select defaultValue="friendly">
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
                <div
                    className="add-background-card"
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                        window.alert(
                            "Background upload dialog would open here.\n\nYou would be able to:\n- Upload an image file\n- Enter a background name\n- Preview the background"
                        );
                    }}
                    onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") (e.currentTarget as HTMLDivElement).click();
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

            <div className="save-section">
                <button type="button" className="btn btn-primary">
                    💾 Save Changes
                </button>
                <button type="button" className="btn btn-secondary">
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
        </div>
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
