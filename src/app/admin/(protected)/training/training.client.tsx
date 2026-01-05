"use client";

import {useCallback, useEffect, useMemo, useState, useTransition} from "react";
import toast from "react-hot-toast";

import {saveManualTrainingAction, saveSafetyInstructionsAction} from "@/app/admin/(protected)/actions";
import {fetchKnowledgeArchive, fetchManualTrainingTemplate, fetchSafetyInstructions, KnowledgeItem} from "@/app/admin/(protected)/admin-data";
import {useAzureSTT} from "@/app/(client)/[avatarSlug]/_hooks/useAzureSTT";

type TabId = "archive" | "prerendered" | "safety" | "manual";

const tabTitles: Record<TabId, string> = {
    archive: "Knowledge Archive",
    prerendered: "Pre-rendered Templates",
    safety: "Safety",
    manual: "Manual Training",
};

function setBreadcrumb(level2: string) {
    const el = document.getElementById("current-section");
    if (el) el.textContent = level2;

    const h1 = document.querySelector(".page-title");
    if (h1) h1.textContent = level2;
}

export default function LearningClient() {
    const [activeTab, setActiveTab] = useState<TabId>("archive");
    const [search, setSearch] = useState("");
    const [knowledge, setKnowledge] = useState<KnowledgeItem[]>([]);
    const [safetyRules, setSafetyRules] = useState("");
    const [manualText, setManualText] = useState("");
    const [isSaving, startSaving] = useTransition();

    const handleDictationFinal = useCallback((text: string) => {
        setManualText((prev) => (prev ? `${prev.trim()} ${text}` : text));
        toast.success("Dictation captured");
    }, []);

    const {listening, startListening, stopListening, interimTranscript} = useAzureSTT(handleDictationFinal);

    useEffect(() => {
        fetchKnowledgeArchive().then(setKnowledge);
        fetchSafetyInstructions().then(setSafetyRules);
        fetchManualTrainingTemplate().then((template) => {
            setManualText(template);
        });
    }, []);

    const filteredKnowledge = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return knowledge;

        return knowledge.filter((k) => {
            const hay = `${k.title} ${k.sourceLabel} ${k.created} ${k.status}`.toLowerCase();
            return hay.includes(q);
        });
    }, [knowledge, search]);

    const switchTab = (tab: TabId) => {
        setActiveTab(tab);
        setBreadcrumb(tabTitles[tab]);
    };

    return (
        <>
            <div className="tabs">
                <button
                    type="button"
                    className={`tab ${activeTab === "archive" ? "active" : ""}`}
                    onClick={() => switchTab("archive")}
                >
                    📚 Knowledge Archive
                </button>

                {/*<button*/}
                {/*    type="button"*/}
                {/*    className={`tab ${activeTab === "prerendered" ? "active" : ""}`}*/}
                {/*    onClick={() => switchTab("prerendered")}*/}
                {/*>*/}
                {/*    🎬 Pre-rendered Templates*/}
                {/*</button>*/}

                <button
                    type="button"
                    className={`tab ${activeTab === "safety" ? "active" : ""}`}
                    onClick={() => switchTab("safety")}
                >
                    🛡️ Safety
                </button>

                <button
                    type="button"
                    className={`tab ${activeTab === "manual" ? "active" : ""}`}
                    onClick={() => switchTab("manual")}
                >
                    ✍️ Manual Training
                </button>
            </div>

            {/* Knowledge Archive */}
            <div id="archive" className={`tab-content ${activeTab === "archive" ? "active" : ""}`}>
                <div className="section">
                    <h2 className="section-title-with-tooltip" style={{ position: "relative" }}>
                        Knowledge Archive
                        <span className="section-tooltip-icon">?</span>
                        <span className="section-tooltip-text">
              A section storing the entire knowledge base of the avatar with indication of sources and addition dates; the
              avatar formulates responses based on this data, so deleting or changing knowledge directly affects its behavior
              and requires caution.
            </span>
                    </h2>

                    <div className="info-box">ℹ️ Search and manage all knowledge entries that power the avatar&apos;s responses</div>

                    <div className="input-group" style={{ maxWidth: 600, marginBottom: 25 }}>
                        <label>Search Knowledge</label>
                        <input
                            type="text"
                            value={search}
                            placeholder="Search by keywords, phrases, or content..."
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>

                    {filteredKnowledge.map((k) => (
                        <div key={k.id} className={`knowledge-item ${k.status}`}>
                            <h3>{k.title}</h3>

                            <div className="knowledge-meta">
                <span>
                  {k.sourceLabel === "Text blog" ? "📝" : "✍️"} Source: <strong>{k.sourceLabel}</strong>
                </span>
                                <span>
                  📅 Created: <strong>{k.created}</strong>
                </span>
                                <span className={`status-badge ${k.status}`}>
                  {k.status === "processing" ? "Training" : k.status === "error" ? "Error" : "Active"}
                </span>
                            </div>

                            <div className="btn-group">
                                <button type="button" className="btn btn-primary">
                                    👁️ View / Edit
                                </button>
                                <button type="button" className="btn btn-danger">
                                    🗑️ Delete
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Pre-rendered Templates */}
            {/*<div id="prerendered" className={`tab-content ${activeTab === "prerendered" ? "active" : ""}`}>*/}
            {/*    <div className="section">*/}
            {/*        <h2 className="section-title-with-tooltip" style={{ position: "relative" }}>*/}
            {/*            Pre-rendered Emotions / Jokes by Triggers*/}
            {/*            <span className="section-tooltip-icon">?</span>*/}
            {/*            <span className="section-tooltip-text">*/}
            {/*  Pre-prepared video reactions that automatically play during specific events (e.g., error, waiting for response,*/}
            {/*  or interruption) and are used to maintain liveliness and naturalness of communication.*/}
            {/*</span>*/}
            {/*        </h2>*/}

            {/*        <div className="trigger-info">*/}
            {/*            <strong>Triggers:</strong>*/}
            {/*            <br />– User remains silent for a long time*/}
            {/*            <br />– User interrupted*/}
            {/*            <br />– System error (no connection to D-ID, ChatGPT/external sources down, response timeout)*/}
            {/*            <br />*/}
            {/*            <strong>Selection logic:</strong> Displayed cyclically when trigger activates*/}
            {/*        </div>*/}

            {/*        <div className="video-list">*/}
            {/*            <VideoCard title="Joke about silence" meta="Trigger: Silence | 5 sec" />*/}
            {/*            <VideoCard title="Reaction to interruption" meta="Trigger: Interruption | 4 sec" />*/}
            {/*            <VideoCard title="Apology for delay" meta="Trigger: System error | 8 sec" />*/}
            {/*        </div>*/}

            {/*        <button type="button" className="btn btn-primary" style={{ marginTop: 15 }}>*/}
            {/*            ➕ Add New Video*/}
            {/*        </button>*/}

            {/*        <hr style={{ margin: "40px 0", border: "none", borderTop: "1px solid #e2e8f0" }} />*/}

            {/*        <h2 className="section-title-with-tooltip" style={{ position: "relative" }}>*/}
            {/*            Pre-rendered Prepared Answers*/}
            {/*            <span className="section-tooltip-icon">?</span>*/}
            {/*            <span className="section-tooltip-text">*/}
            {/*  Pre-recorded video answers that are triggered based on semantic matching to the user&apos;s question and are*/}
            {/*  displayed instead of regular synchronized video, enhancing the feeling of realistic dialogue.*/}
            {/*</span>*/}
            {/*        </h2>*/}

            {/*        <div className="trigger-info">*/}
            {/*            <strong>Trigger:</strong> Routing determined that this question can be answered with a video template*/}
            {/*            <br />*/}
            {/*            <strong>Selection logic:</strong> Semantic search by user question*/}
            {/*        </div>*/}

            {/*        <div className="video-list">*/}
            {/*            <VideoCard title="Answer about travel" meta="Keywords: travel, trips | 12 sec" />*/}
            {/*            <VideoCard title="Story about sports" meta="Keywords: sports, football | 15 sec" />*/}
            {/*        </div>*/}

            {/*        <button type="button" className="btn btn-primary" style={{ marginTop: 15 }}>*/}
            {/*            ➕ Add New Video*/}
            {/*        </button>*/}
            {/*    </div>*/}
            {/*</div>*/}

            {/* Safety */}
            <div id="safety" className={`tab-content ${activeTab === "safety" ? "active" : ""}`}>
                <form
                    className="section"
                    onSubmit={(event) => {
                        event.preventDefault();
                        const formData = new FormData(event.currentTarget);
                        const rules = (formData.get("safetyRules") as string) ?? "";
                        if (!rules.trim()) {
                            toast.error("Safety rules cannot be empty");
                            return;
                        }

                        startSaving(() =>
                            saveSafetyInstructionsAction(formData)
                                .then(() => toast.success("Safety instructions saved"))
                                .catch(() => toast.error("Failed to save safety"))
                        );
                    }}
                >
                    <h2 className="section-title-with-tooltip" style={{ position: "relative" }}>
                        Safety
                        <span className="section-tooltip-icon">?</span>
                        <span className="section-tooltip-text">
              A section with safety and moderation instructions that determines which topics, formulations, and types of
              content the avatar is prohibited from using to avoid undesirable, dangerous, or incorrect behavior.
            </span>
                    </h2>

                    <div className="info-box">ℹ️ Safety instructions common to all roles</div>

                    <div className="input-group">
                        <label htmlFor="safetyRules">Content Safety and Filtering Rules</label>
                        <textarea
                            id="safetyRules"
                            name="safetyRules"
                            defaultValue={safetyRules}
                            placeholder="Enter safety instructions for all avatar roles..."
                        />
                    </div>

                    <button type="submit" className="btn btn-primary" disabled={isSaving}>
                        {isSaving ? "Saving..." : "💾 Save Settings"}
                    </button>
                </form>
            </div>

            {/* Manual Training */}
            <div id="manual" className={`tab-content ${activeTab === "manual" ? "active" : ""}`}>
                <form
                    className="section"
                    onSubmit={(event) => {
                        event.preventDefault();
                        if (!manualText.trim()) {
                            toast.error("Manual training text is required");
                            return;
                        }

                        const formData = new FormData(event.currentTarget);
                        formData.set("manualLearning", manualText);

                        startSaving(() =>
                            saveManualTrainingAction(formData)
                                .then(() => toast.success("Manual training saved"))
                                .catch(() => toast.error("Failed to save training"))
                        );
                    }}
                >
                    <h2 className="section-title-with-tooltip" style={{ position: "relative" }}>
                        Manual Training
                        <span className="section-tooltip-icon">?</span>
                        <span className="section-tooltip-text">
              A tool for manually adding new knowledge to the avatar using text or voice input; such data undergoes
              processing and over time becomes part of the knowledge base, affecting future responses.
            </span>
                    </h2>

                    <div className="info-box">
                        💡 Use this field to manually add new knowledge. You can type text or use voice input via Azure STT.
                    </div>

                    <div className="input-group">
                        <label htmlFor="manualLearning">Enter Training Text</label>
                        <div className="voice-input-wrapper">
              <textarea
                  id="manualLearning"
                  name="manualLearning"
                  value={manualText}
                  onChange={(event) => setManualText(event.target.value)}
                  placeholder="Enter text to train the avatar... For example: 'In 1995 Neil visited Egypt and was impressed by the pyramids of Giza...'"
              />
                            <button
                                type="button"
                                className={`voice-btn ${listening ? "recording" : ""}`}
                                id="voiceBtn"
                                title="Voice Input (Azure STT)"
                                onClick={() => {
                                    if (listening) {
                                        stopListening();
                                        toast.success("Dictation stopped");
                                    } else {
                                        startListening("en-US");
                                    }
                                }}
                            >
                                {listening ? "⏹" : "🎤"}
                            </button>
                        </div>
                        {interimTranscript && <div className="info-box" style={{ marginTop: 8 }}>🎙️ {interimTranscript}</div>}
                    </div>

                    <div className="btn-group">
                        <button type="submit" className="btn btn-primary" disabled={isSaving}>
                            {isSaving ? "Saving..." : "💾 Save Knowledge"}
                        </button>
                        <button
                            type="button"
                            className="btn btn-secondary"
                            onClick={() => {
                                setManualText("");
                                stopListening();
                            }}
                        >
                            🔄 Clear Field
                        </button>
                    </div>
                </form>
            </div>
        </>
    );
}

function VideoCard(props: { title: string; meta: string }) {
    return (
        <div className="video-card">
            <div className="video-placeholder">🎬 Video</div>
            <div className="video-title">{props.title}</div>
            <div className="video-meta">{props.meta}</div>
            <button
                type="button"
                className="btn btn-danger btn-small"
                style={{ width: "100%", marginTop: 8 }}
                onClick={() => window.alert("Video would be deleted here.")}
            >
                🗑️ Delete
            </button>
        </div>
    );
}
