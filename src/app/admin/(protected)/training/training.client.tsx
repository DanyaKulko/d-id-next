"use client";

import { useCallback, useMemo, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import { useAzureSTT } from "@/app/(client)/[avatarSlug]/_hooks/useAzureSTT";
import { useDevMode } from "@/app/admin/(protected)/_components/dev-mode";
import {
  deleteKnowledgeDocumentAction,
  saveManualTrainingAction,
  saveSafetyInstructionsAction,
  toggleKnowledgeDocumentEnabledAction,
  toggleTextBlogKnowledgeAction,
} from "@/app/admin/(protected)/actions";
import type { KnowledgeItem } from "@/app/admin/(protected)/admin-data";
import { trainingLimits } from "@/lib/training/knowledge-config";
import type { TrainingTabId } from "./training.tabs";

type TrainingClientProps = {
  initialTab: TrainingTabId;
  roleKey: string;
  initialKnowledge: KnowledgeItem[];
  initialSafetyRules: string;
  initialManualText: string;
  initialTextBlogEnabled: boolean;
};

type ParsedManualFile = {
  name: string;
  content: string;
  contribution: number;
};

const parseManualPayload = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { manualText: "", file: null as ParsedManualFile | null };
  }

  const match = trimmed.match(
    /^([\s\S]*?)(?:\n\n)?## File: ([^\n]+)\n\n([\s\S]+)$/,
  );
  if (!match) {
    return { manualText: trimmed, file: null as ParsedManualFile | null };
  }

  const name = match[2]?.trim() ?? "";
  const content = match[3]?.trim() ?? "";
  if (!name || !content) {
    return { manualText: trimmed, file: null as ParsedManualFile | null };
  }

  const manualText = (match[1] ?? "").trim();
  const contribution = `## File: ${name}\n\n${content}`.length;
  return {
    manualText,
    file: { name, content, contribution },
  };
};

export default function LearningClient({
  initialTab,
  roleKey,
  initialKnowledge,
  initialSafetyRules,
  initialManualText,
  initialTextBlogEnabled,
}: TrainingClientProps) {
  const initialParsedManual = useMemo(
    () => parseManualPayload(initialManualText),
    [initialManualText],
  );
  const activeTab = initialTab;
  const [search, setSearch] = useState("");
  const [knowledge, setKnowledge] = useState<KnowledgeItem[]>(initialKnowledge);
  const [safetyRules, setSafetyRules] = useState(initialSafetyRules);
  const [manualText, setManualText] = useState(initialParsedManual.manualText);
  const [savedManualFile, setSavedManualFile] =
    useState<ParsedManualFile | null>(initialParsedManual.file);
  const [selectedManualFile, setSelectedManualFile] = useState<File | null>(
    null,
  );
  const [selectedManualFileContribution, setSelectedManualFileContribution] =
    useState(0);
  const [textBlogEnabled, setTextBlogEnabled] = useState(
    initialTextBlogEnabled,
  );
  const [isSaving, startSaving] = useTransition();
  const [isToggling, startToggling] = useTransition();
  const [deleteCandidate, setDeleteCandidate] = useState<KnowledgeItem | null>(
    null,
  );
  const { enabled: devModeEnabled } = useDevMode();
  const manualFilesInputRef = useRef<HTMLInputElement | null>(null);
  const canEditKnowledgeArchive = devModeEnabled;
  const notifyDevModeRequired = useCallback(() => {
    toast.error("Enable Dev Mode to manage knowledge files");
  }, []);

  const handleDictationFinal = useCallback((text: string) => {
    setManualText((prev) => (prev ? `${prev.trim()} ${text}` : text));
    toast.success("Dictation captured");
  }, []);

  const { listening, startListening, stopListening, interimTranscript } =
    useAzureSTT(handleDictationFinal);

  const filteredKnowledge = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return knowledge;

    return knowledge.filter((k) => {
      const hay =
        `${k.title} ${k.sourceLabel} ${k.created} ${k.status}`.toLowerCase();
      return hay.includes(q);
    });
  }, [knowledge, search]);

  const visibleKnowledge = filteredKnowledge;
  const selectedManualFilePreviews = useMemo(
    () =>
      selectedManualFile
        ? [
            {
              key: `${selectedManualFile.name}-${selectedManualFile.size}-${selectedManualFile.lastModified}`,
              name: selectedManualFile.name,
              sizeBytes: selectedManualFile.size,
            },
          ]
        : [],
    [selectedManualFile],
  );
  const activeManualFileContribution =
    selectedManualFileContribution || savedManualFile?.contribution || 0;
  const manualCombinedCharCount =
    manualText.trim().length + activeManualFileContribution;
  const manualCombinedLimit = trainingLimits.manualTrainingCharLimit;
  const manualRemainingChars = manualCombinedLimit - manualCombinedCharCount;
  const manualLimitRatio =
    manualCombinedLimit > 0 ? manualCombinedCharCount / manualCombinedLimit : 0;
  const manualCounterState =
    manualRemainingChars < 0
      ? "over"
      : manualLimitRatio >= 0.9
        ? "warning"
        : "normal";

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleDelete = (item: KnowledgeItem) => {
    if (!canEditKnowledgeArchive) {
      notifyDevModeRequired();
      return;
    }
    setDeleteCandidate(item);
  };

  const handleToggleKnowledge = (item: KnowledgeItem, enabled: boolean) => {
    if (!canEditKnowledgeArchive) {
      notifyDevModeRequired();
      return;
    }

    const formData = new FormData();
    formData.set("documentId", item.id);
    formData.set("enabled", String(enabled));
    formData.set("roleKey", roleKey);

    startSaving(async () => {
      const promise = toggleKnowledgeDocumentEnabledAction(formData);
      toast.promise(promise, {
        loading: enabled ? "Enabling knowledge..." : "Disabling knowledge...",
        success: enabled ? "Knowledge enabled" : "Knowledge disabled",
        error: "Failed to update knowledge status",
      });

      try {
        await promise;
        setKnowledge((prev) =>
          prev.map((doc) =>
            doc.id === item.id
              ? {
                  ...doc,
                  isEnabled: enabled,
                  status: enabled ? "processing" : doc.status,
                }
              : doc,
          ),
        );
      } catch (_error) {}
    });
  };

  const confirmDelete = () => {
    if (!canEditKnowledgeArchive) {
      notifyDevModeRequired();
      return;
    }

    const item = deleteCandidate;
    if (!item) return;
    const formData = new FormData();
    formData.set("documentId", item.id);
    formData.set("sourceLabel", item.sourceLabel);
    formData.set("roleKey", roleKey);

    startSaving(async () => {
      await deleteKnowledgeDocumentAction(formData)
        .then(() => {
          setKnowledge((prev) => prev.filter((doc) => doc.id !== item.id));
          toast.success("Document deleted");
          setDeleteCandidate(null);
        })
        .catch(() => toast.error("Failed to delete document"));
    });
  };

  const handleTextBlogToggle = (enabled: boolean) => {
    if (!canEditKnowledgeArchive) {
      notifyDevModeRequired();
      return;
    }

    const formData = new FormData();
    formData.set("enabled", String(enabled));
    formData.set("roleKey", roleKey);

    startToggling(async () => {
      try {
        await toast.promise(toggleTextBlogKnowledgeAction(formData), {
          loading: enabled
            ? "Enabling blog knowledge..."
            : "Disabling blog knowledge...",
          success: enabled
            ? "Blog knowledge enabled(uploading started)"
            : "Blog knowledge disabled(removal started)",
          error: "Failed to update blog knowledge setting",
        });

        setTextBlogEnabled(enabled);
        setKnowledge((prev) =>
          prev.map((item) => {
            if (item.sourceLabel.trim().toLowerCase() !== "text blog") {
              return item;
            }
            return {
              ...item,
              isEnabled: enabled,
              status: enabled ? "processing" : item.status,
            };
          }),
        );
      } catch (_error) {}
    });
  };

  return (
    <>
      {activeTab === "archive" && (
        <div className="section">
          <h2
            className="section-title-with-tooltip"
            style={{ position: "relative" }}
          >
            Knowledge Archive
            <span className="section-tooltip-icon">?</span>
            <span className="section-tooltip-text">
              A section storing the entire knowledge base of the avatar with
              indication of sources and addition dates; the avatar formulates
              responses based on this data, so deleting or changing knowledge
              directly affects its behavior and requires caution.
            </span>
          </h2>

          <div className="info-box">
            ℹ️ Search and manage all knowledge entries that power the
            avatar&apos;s responses
          </div>

          <div
            className={`toggle-container ${!canEditKnowledgeArchive ? "is-readonly" : ""}`}
          >
            <label className="toggle-switch">
              <input
                type="checkbox"
                checked={textBlogEnabled}
                disabled={isToggling}
                onClick={(event) => {
                  if (canEditKnowledgeArchive) return;
                  event.preventDefault();
                  notifyDevModeRequired();
                }}
                onChange={(e) => handleTextBlogToggle(e.target.checked)}
              />
              <span className="slider" />
            </label>
            <div>
              <div className="toggle-label">Include blog knowledge</div>
              <div className="toggle-description">
                When disabled, blog documents are removed from D-ID but the
                processed text is preserved locally for quick re-enable.
              </div>
            </div>
          </div>

          <div
            className="input-group"
            style={{ maxWidth: 600, marginBottom: 25 }}
          >
            <label htmlFor={"searchKnowledge"}>Search Knowledge</label>
            <input
              id="searchKnowledge"
              type="text"
              value={search}
              placeholder="Search by title"
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {visibleKnowledge.map((k) => (
            <div
              key={k.id}
              className={`knowledge-item ${k.isEnabled ? k.status : "disabled"}`}
            >
              <h3>{k.title}</h3>

              <div className="knowledge-meta">
                <span>
                  {k.sourceLabel === "Text blog" ? "📝" : "✍️"} Source:{" "}
                  <strong>{k.sourceLabel}</strong>
                </span>
                <span>
                  📅 Created: <strong>{k.created}</strong>
                </span>
                <span
                  className={`status-badge ${k.isEnabled ? k.status : "disabled"}`}
                >
                  {!k.isEnabled
                    ? "Disabled"
                    : k.status.toLowerCase() === "processing"
                      ? "Training"
                      : k.status.toLowerCase() === "error"
                        ? "Error"
                        : "Active"}
                </span>
              </div>

              <div className="btn-group">
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    if (k.url) {
                      window.open(k.url, "_blank", "noopener,noreferrer");
                    } else {
                      toast.error("Document URL is missing");
                    }
                  }}
                >
                  👁️ View
                </button>
                <button
                  type="button"
                  className={`btn btn-primary ${!canEditKnowledgeArchive ? "is-readonly" : ""}`}
                  onClick={() => handleToggleKnowledge(k, !k.isEnabled)}
                  disabled={isSaving}
                  aria-disabled={!canEditKnowledgeArchive}
                >
                  {k.isEnabled ? "🚫 Disable" : "✅ Enable"}
                </button>
                <button
                  type="button"
                  className={`btn btn-danger ${!canEditKnowledgeArchive ? "is-readonly" : ""}`}
                  onClick={() => handleDelete(k)}
                  disabled={isSaving}
                  aria-disabled={!canEditKnowledgeArchive}
                >
                  🗑️ Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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

      {activeTab === "safety" && (
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
            formData.set("roleKey", roleKey);

            startSaving(() => {
              saveSafetyInstructionsAction(formData)
                .then(() => toast.success("Safety instructions saved"))
                .catch(() => toast.error("Failed to save safety"));
            });
          }}
        >
          <h2
            className="section-title-with-tooltip"
            style={{ position: "relative" }}
          >
            Safety
            <span className="section-tooltip-icon">?</span>
            <span className="section-tooltip-text">
              A section with safety and moderation instructions that determines
              which topics, formulations, and types of content the avatar is
              prohibited from using to avoid undesirable, dangerous, or
              incorrect behavior.
            </span>
          </h2>

          <div className="info-box">
            ℹ️ Safety instructions for the selected avatar role
          </div>

          <div className="input-group">
            <label htmlFor="safetyRules">
              Content Safety and Filtering Rules
            </label>
            <textarea
              id="safetyRules"
              name="safetyRules"
              value={safetyRules}
              placeholder="Enter safety instructions for this avatar role..."
              onChange={(event) => setSafetyRules(event.target.value)}
            />
          </div>

          <button type="submit" className="btn btn-primary" disabled={isSaving}>
            {isSaving ? "Saving..." : "💾 Save Settings"}
          </button>
        </form>
      )}

      {activeTab === "manual" && (
        <form
          className="section"
          onSubmit={(event) => {
            event.preventDefault();
            const formData = new FormData(event.currentTarget);
            formData.set("manualLearning", manualText);
            formData.set("roleKey", roleKey);
            if (savedManualFile && !selectedManualFile) {
              formData.set("existingManualFileName", savedManualFile.name);
              formData.set(
                "existingManualFileContent",
                savedManualFile.content,
              );
            }
            formData.set(
              "removeExistingManualFile",
              String(!savedManualFile && !selectedManualFile),
            );

            startSaving(async () => {
              await saveManualTrainingAction(formData)
                .then((result) => {
                  const parsed = parseManualPayload(result.manualText);
                  setManualText(parsed.manualText);
                  setSavedManualFile(parsed.file);
                  setSelectedManualFile(null);
                  setSelectedManualFileContribution(0);
                  if (manualFilesInputRef.current) {
                    manualFilesInputRef.current.value = "";
                  }
                  toast.success("Manual training saved");
                })
                .catch((error) =>
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : "Failed to save training",
                  ),
                );
            });
          }}
        >
          <h2
            className="section-title-with-tooltip"
            style={{ position: "relative" }}
          >
            Manual Training
            <span className="section-tooltip-icon">?</span>
            <span className="section-tooltip-text">
              A tool for manually adding new knowledge to the avatar using text
              or voice input; such data undergoes processing and over time
              becomes part of the knowledge base, affecting future responses.
            </span>
          </h2>

          <div className="info-box">
            💡 Use this field to manually add new knowledge. You can type text
            or use voice input via Azure STT.
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
            {interimTranscript && (
              <div className="info-box" style={{ marginTop: 8 }}>
                🎙️ {interimTranscript}
              </div>
            )}
          </div>

          <div className="input-group">
            <label htmlFor="manualFiles">Upload text file (.txt, .md)</label>
            <input
              ref={manualFilesInputRef}
              id="manualFiles"
              name="manualFiles"
              type="file"
              accept=".txt,.md,text/plain,text/markdown"
              onChange={async (event) => {
                const file = event.target.files?.[0] ?? null;
                setSelectedManualFile(file);
                if (!file) {
                  setSelectedManualFileContribution(0);
                  return;
                }

                try {
                  const content = (await file.text()).trim();
                  if (!content) {
                    setSelectedManualFile(null);
                    setSelectedManualFileContribution(0);
                    if (manualFilesInputRef.current) {
                      manualFilesInputRef.current.value = "";
                    }
                    toast.error("Selected file is empty");
                    return;
                  }
                  const fileBlockPrefix = `## File: ${file.name}\n\n`;
                  setSelectedManualFileContribution(
                    fileBlockPrefix.length + content.length,
                  );
                } catch {
                  setSelectedManualFile(null);
                  setSelectedManualFileContribution(0);
                  if (manualFilesInputRef.current) {
                    manualFilesInputRef.current.value = "";
                  }
                  toast.error("Failed to read selected file");
                }
              }}
            />
            <div className="manual-file-picker-actions">
              {selectedManualFile && (
                <button
                  type="button"
                  className="manual-file-clear-btn"
                  onClick={() => {
                    setSelectedManualFile(null);
                    setSelectedManualFileContribution(0);
                    if (manualFilesInputRef.current) {
                      manualFilesInputRef.current.value = "";
                    }
                  }}
                >
                  Cancel selected file
                </button>
              )}
              {!selectedManualFile && savedManualFile && (
                <div className="manual-file-picker-hint">
                  Saved file: <strong>{savedManualFile.name}</strong>
                </div>
              )}
            </div>
          </div>

          <div
            className={`manual-char-counter manual-char-counter-${manualCounterState}`}
          >
            <span>
              Combined manual input:{" "}
              <strong>
                {manualCombinedCharCount.toLocaleString("en-US")} /{" "}
                {manualCombinedLimit.toLocaleString("en-US")}
              </strong>
            </span>
            <span>
              {manualRemainingChars >= 0
                ? `${manualRemainingChars.toLocaleString("en-US")} left`
                : `${Math.abs(manualRemainingChars).toLocaleString("en-US")} over limit`}
            </span>
          </div>

          {selectedManualFilePreviews.length > 0 && (
            <div className="input-group">
              <div className="manual-files-label">
                Selected File (Pending Save)
              </div>
              <div className="manual-files-grid">
                {selectedManualFilePreviews.map((file) => (
                  <div
                    key={file.key}
                    className="manual-file-card manual-file-card-pending"
                  >
                    <div className="manual-file-title">{file.name}</div>
                    <div className="manual-file-meta">
                      New upload · {formatFileSize(file.sizeBytes)}
                    </div>
                    <button
                      type="button"
                      className="manual-file-clear-btn"
                      onClick={() => {
                        setSelectedManualFile(null);
                        setSelectedManualFileContribution(0);
                        if (manualFilesInputRef.current) {
                          manualFilesInputRef.current.value = "";
                        }
                      }}
                    >
                      Remove selection
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {!selectedManualFile && savedManualFile && (
            <div className="input-group">
              <div className="manual-files-label">Current Uploaded File</div>
              <div className="manual-files-grid">
                <div className="manual-file-card manual-file-card-static">
                  <div className="manual-file-title">
                    {savedManualFile.name}
                  </div>
                  <div className="manual-file-meta">
                    Saved ·{" "}
                    {savedManualFile.contribution.toLocaleString("en-US")} chars
                  </div>
                  <button
                    type="button"
                    className="manual-file-clear-btn"
                    onClick={() => setSavedManualFile(null)}
                  >
                    Remove saved file (save to apply)
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="btn-group">
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
            >
              {isSaving ? "Saving..." : "💾 Save Knowledge"}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setManualText("");
                setSavedManualFile(null);
                setSelectedManualFile(null);
                setSelectedManualFileContribution(0);
                if (manualFilesInputRef.current) {
                  manualFilesInputRef.current.value = "";
                }
                stopListening();
              }}
            >
              🔄 Clear Field
            </button>
          </div>
        </form>
      )}

      {deleteCandidate && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="modal-header">
              <div>
                <div className="modal-title">Delete Document</div>
                <div className="modal-subtitle">
                  This action cannot be undone.
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteCandidate(null)}
              >
                ✕
              </button>
            </div>
            <div className="modal-body">
              <p>
                Delete &quot;{deleteCandidate.title}&quot; from the knowledge
                base?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteCandidate(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={confirmDelete}
                disabled={isSaving}
              >
                {isSaving ? "Deleting..." : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
