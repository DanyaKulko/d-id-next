"use client";

import Image from "next/image";
import {useCallback, useEffect, useMemo, useRef, useState} from "react";
import {AvatarStage} from "@/app/(client)/[avatarSlug]/_components/AvatarStage/AvatarStage";
import {useAgent} from "@/app/(client)/[avatarSlug]/_hooks/useAgent";
import {useAzureSTT} from "@/app/(client)/[avatarSlug]/_hooks/useAzureSTT";
import {useIdleTimer} from "@/app/(client)/[avatarSlug]/_hooks/useIdleTimer";
import watermark from "@/assets/img/neil_avatar_watermark.png";

type DidAgentPayload = {
    id: string;
    agentId: string;
    name?: string;
    description?: string | null;
    presenter?: {
        idle_video?: string;
        idle_video_url?: string;
        image_url?: string;
        imageUrl?: string;
        thumbnail_url?: string;
        thumbnailUrl?: string;
        preview_image?: string;
        previewImage?: string;
    };
};

interface IAvatarPageClientProps {
    agent: DidAgentPayload;
    agentName?: string;
    agentDescription?: string;
    agentImageUrl?: string;
    agentIdleVideoUrl?: string;
    backgrounds?: BackgroundOption[];
    backgroundsEnabled?: boolean;
    backgroundKeyColor?: "white" | "green";
}

type BackgroundOption = {
    id: string;
    title: string;
    url: string;
    theme?: string;
};

const languages = [
    {code: "en-US", label: "🇺🇸 English"},
    {code: "es-ES", label: "🇪🇸 Spanish"},
    {code: "fr-FR", label: "🇫🇷 French"},
    {code: "de-DE", label: "🇩🇪 German"},
    {code: "ru-RU", label: "🇷🇺 Russian"},
    {code: "zh-CN", label: "🇨🇳 Chinese"},
    {code: "ja-JP", label: "🇯🇵 Japanese"},
];

export const AvatarPageClient = ({
                                     agent,
                                     agentName,
                                     agentDescription,
                                     agentImageUrl,
                                     agentIdleVideoUrl,
                                     backgrounds,
                                     backgroundsEnabled,
                                     backgroundKeyColor,
                                 }: IAvatarPageClientProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hasGreetedRef = useRef(false);
    const stageRef = useRef<HTMLDivElement | null>(null);

    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [showError, setShowError] = useState(false);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [canFullscreen, setCanFullscreen] = useState(false);
    const [micPermission, setMicPermission] = useState<
        "unknown" | "granted" | "denied" | "prompt"
    >("unknown");
    const [micRequesting, setMicRequesting] = useState(false);
    const [showMicPrompt, setShowMicPrompt] = useState(false);
    const [pendingStart, setPendingStart] = useState(false);
    const [micError, setMicError] = useState("");
    const [agentStatus, setAgentStatus] = useState<
        "idle" | "preparing" | "listening" | "thinking" | "speaking" | "timed_out"
    >("idle");
    const [language, setLanguage] = useState(languages[0].code);
    const [selectedBackgroundId, setSelectedBackgroundId] = useState("default");

    const backgroundOptions = useMemo(
        () => (backgrounds ?? []).filter((bg) => bg.url),
        [backgrounds],
    );
    const canSelectBackground =
        (backgroundsEnabled ?? false) && backgroundOptions.length > 0;
    const selectedBackground = useMemo(
        () => backgroundOptions.find((bg) => bg.id === selectedBackgroundId),
        [backgroundOptions, selectedBackgroundId],
    );
    const activeBackgroundUrl =
        canSelectBackground && selectedBackgroundId !== "default"
            ? selectedBackground?.url
            : undefined;

    useEffect(() => {
        if (selectedBackgroundId === "default") return;
        if (!backgroundOptions.some((bg) => bg.id === selectedBackgroundId)) {
            setSelectedBackgroundId("default");
        }
    }, [backgroundOptions, selectedBackgroundId]);

    useEffect(() => {
        setCanFullscreen(Boolean(document.fullscreenEnabled));
        const handleFullscreenChange = () => {
            setIsFullscreen(Boolean(document.fullscreenElement));
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () => {
            document.removeEventListener("fullscreenchange", handleFullscreenChange);
        };
    }, []);

    useEffect(() => {
        const checkPermission = async () => {
            if (!navigator.permissions?.query) return;
            try {
                const status = await navigator.permissions.query({
                    // PermissionName does not include "microphone" in TS lib yet.
                    name: "microphone" as PermissionName,
                });
                setMicPermission(status.state);
            } catch (_error) {
            }
        };
        void checkPermission();
    }, []);

    useEffect(() => {
        if (micPermission === "granted") {
            setShowMicPrompt(false);
            setMicError("");
        }
    }, [micPermission]);
    console.log('micPermission', micPermission);
    console.log('showMicPrompt', showMicPrompt);

    const toggleFullscreen = useCallback(() => {
        const element = stageRef.current;
        if (!element) return;

        if (document.fullscreenElement) {
            document.exitFullscreen().catch(() => undefined);
        } else {
            element.requestFullscreen().catch(() => undefined);
        }
    }, []);

    const idleVideoUrl =
        agentIdleVideoUrl ??
        agent?.presenter?.idle_video ??
        agent?.presenter?.idle_video_url ??
        "";
    const idleImageUrl =
        agentImageUrl ??
        agent?.presenter?.image_url ??
        agent?.presenter?.imageUrl ??
        agent?.presenter?.thumbnail_url ??
        agent?.presenter?.thumbnailUrl ??
        agent?.presenter?.preview_image ??
        agent?.presenter?.previewImage ??
        "";

    const {
        connect,
        disconnect,
        speak,
        interrupt,
        status: connectionStatus,
        isAgentSpeaking,
    } = useAgent(agent.agentId, videoRef);

    const handleIdleTimeout = useCallback(() => {
        disconnect();
        setAgentStatus("timed_out");
    }, [disconnect]);

    const {resetTimer} = useIdleTimer({
        isActive: agentStatus === "listening",
        onTimeout: handleIdleTimeout,
    });

    const handleUserSpeech = useCallback(
        (text: string) => {
            setAgentStatus("thinking");
            resetTimer();
            void speak(text, language).then((res) => {
                if (!res?.success) {
                    setShowError(true);
                    setAgentStatus("idle");
                }
            });
        },
        [speak, resetTimer, language],
    );

    const {listening, startListening, stopListening, interimTranscript} =
        useAzureSTT(handleUserSpeech);

    const requestMicrophoneAccess = useCallback(async () => {
        setMicError("");
        if (!navigator.mediaDevices?.getUserMedia) {
            setMicPermission("denied");
            setMicError("Microphone is not available in this browser.");
            return false;
        }
        setMicRequesting(true);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({audio: true});
            for (const track of stream.getTracks()) {
                track.stop();
            }
            setMicPermission("granted");
            setShowMicPrompt(false);
            return true;
        } catch (_error) {
            setMicPermission("denied");
            setShowMicPrompt(true);
            setMicError(
                "Microphone access is blocked. Please allow it in your browser settings.",
            );
            return false;
        } finally {
            setMicRequesting(false);
        }
    }, []);

    const ensureMicrophoneAccess = useCallback(async () => {
        if (micPermission === "granted") return true;
        const ok = await requestMicrophoneAccess();
        if (!ok) setShowMicPrompt(true);
        return ok;
    }, [micPermission, requestMicrophoneAccess]);

    const startConversation = useCallback(async () => {
        setAgentStatus("preparing");
        try {
            await connect({language});
        } catch (e) {
            console.error(e);
            setShowError(true);
            setAgentStatus("idle");
        }
    }, [connect, language]);

    const handleRestart = async () => {
        setShowError(false);
        setAgentStatus("idle");
        setIsVideoPlaying(false);
        hasGreetedRef.current = false;
        const hasMic = await ensureMicrophoneAccess();
        if (!hasMic) {
            setPendingStart(true);
            setShowMicPrompt(true);
            return;
        }
        setPendingStart(false);
        await startConversation();
    };

    const handleInterrupt = useCallback(() => {
        interrupt();
        resetTimer();
        setAgentStatus("listening");
    }, [interrupt, resetTimer]);

    useEffect(() => {
        if (agentStatus === "timed_out") return;
        if (connectionStatus === "error") {
            setShowError(true);
            return;
        }
        if (connectionStatus !== "connected") {
            if (listening) stopListening();
            if (connectionStatus === "idle" && !showError) {
                setAgentStatus("idle");
                setIsVideoPlaying(false);
            }
            return;
        }

        if (!hasGreetedRef.current) {
            return;
        }

        if (isAgentSpeaking) {
            setAgentStatus("speaking");
        } else {
            if (
                agentStatus === "speaking" ||
                agentStatus === "thinking" ||
                agentStatus === "idle"
            ) {
                setAgentStatus("listening");
            }
        }
    }, [
        isAgentSpeaking,
        connectionStatus,
        listening,
        stopListening,
        showError,
        agentStatus,
    ]);

    useEffect(() => {
        if (!pendingStart || micPermission !== "granted") return;
        setPendingStart(false);
        void startConversation();
    }, [pendingStart, micPermission, startConversation]);

    useEffect(() => {
        if (
            connectionStatus === "connected" &&
            agentStatus === "listening" &&
            micPermission !== "granted"
        ) {
            setShowMicPrompt(true);
        }
    }, [agentStatus, connectionStatus, micPermission]);

    useEffect(() => {
        const shouldListen =
            agentStatus === "listening" &&
            connectionStatus === "connected" &&
            !showError &&
            micPermission === "granted";

        if (shouldListen) {
            if (!listening) {
                const timer = setTimeout(() => startListening(language), 200);
                return () => clearTimeout(timer);
            }
        } else {
            if (listening) {
                stopListening();
            }
        }
    }, [
        agentStatus,
        listening,
        startListening,
        stopListening,
        language,
        showError,
        connectionStatus,
        micPermission,
    ]);

    useEffect(() => {
        if (connectionStatus === "connected" && !hasGreetedRef.current) {
            hasGreetedRef.current = true;
            // setTimeout(() => {
            setAgentStatus("thinking");
            speak("Hello", language);
            // }, 500);
        }
    }, [connectionStatus, speak, language]);

    const handleMicEnable = useCallback(async () => {
        const ok = await requestMicrophoneAccess();
        if (!ok) return;
        if (connectionStatus === "connected" && agentStatus === "listening") {
            if (!listening) {
                startListening(language);
            }
            return;
        }
        if (connectionStatus === "idle" || pendingStart) {
            setPendingStart(false);
            await startConversation();
        }
    }, [
        requestMicrophoneAccess,
        connectionStatus,
        agentStatus,
        listening,
        startListening,
        language,
        pendingStart,
        startConversation,
    ]);

    const getStatusText = () => {
        switch (agentStatus) {
            case "preparing":
                return "Connecting...";

            case "thinking":
                return "Thinking...";
            case "speaking":
                return "Speaking...";
            case "listening":
                return "Listening...";
            case "timed_out":
                return "Sleeping";
            default:
                return "Ready";
        }
    };

    return (
        <div className="na-main-layout">
            <div className="na-avatar-section">
                <div className="na-avatar-container" ref={stageRef}>
                    <div className="na-status-badge">
                        <span className={`na-status-indicator ${agentStatus}`}></span>
                        <span>{getStatusText()}</span>
                    </div>

                    {canFullscreen && (
                        <button
                            type="button"
                            className="na-fullscreen-btn"
                            onClick={toggleFullscreen}
                            aria-label={
                                isFullscreen ? "Exit full screen" : "Enter full screen"
                            }
                            title={isFullscreen ? "Exit full screen" : "Enter full screen"}
                        >
                            {isFullscreen ? "⤡" : "⤢"}
                        </button>
                    )}

                    <AvatarStage
                        videoRef={videoRef}
                        idleVideoUrl={idleVideoUrl}
                        idleImageUrl={idleImageUrl}
                        backgroundUrl={activeBackgroundUrl}
                        backgroundKeyColor={backgroundKeyColor}
                        agentName={agentName ?? agent?.name ?? "Neil Avatar"}
                        agentDescription={agentDescription ?? agent?.description ?? ""}
                        isStreamReady={isVideoPlaying}
                        onStreamReady={() => setIsVideoPlaying(true)}
                        connectionStatus={connectionStatus}
                        showError={showError}
                        isTimedOut={agentStatus === "timed_out"}
                        onRestart={handleRestart}
                    />

                    {showMicPrompt && !showError && (
                        <div className="na-mic-overlay">
                            <div className="na-mic-card">
                                <div className="na-mic-icon" aria-hidden="true">
                                    🎙️
                                </div>
                                <h3 className="na-mic-title">Enable microphone</h3>
                                <p className="na-mic-text">
                                    We need microphone access to start the conversation.
                                </p>
                                {micError && <p className="na-mic-error">{micError}</p>}
                                <div className="na-mic-actions">
                                    <button
                                        type="button"
                                        className="na-btn na-btn--primary"
                                        style={{
                                            minHeight: '45px'
                                        }}
                                        onClick={handleMicEnable}
                                        disabled={micRequesting}
                                    >
                                        {micRequesting ? "Requesting access..." : "Enable mic"}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {listening && interimTranscript && (
                        <div
                            className="na-transcript-overlay"
                            style={{
                                position: "absolute",
                                bottom: "20%",
                                left: "50%",
                                transform: "translateX(-50%)",
                                background: "rgba(0,0,0,0.7)",
                                padding: "8px 16px",
                                borderRadius: "20px",
                                color: "#fff",
                                fontSize: "1.1rem",
                                zIndex: 50,
                                pointerEvents: "none",
                                width: "80%",
                                textAlign: "center",
                            }}
                        >
                            {interimTranscript}
                        </div>
                    )}

                    <div className="na-watermark">
                        <Image src={watermark} alt={"watermark"}></Image>
                    </div>
                </div>

                <div className="na-controls">
                    <div className="na-control-group">
                        <select
                            className="na-language-select"
                            value={language}
                            onChange={(e) => {
                                const nextLang = e.target.value;
                                setLanguage(nextLang);
                                if (listening) {
                                    stopListening();
                                    if (micPermission === "granted") {
                                        setTimeout(() => {
                                            startListening(nextLang);
                                        }, 150);
                                    } else {
                                        setShowMicPrompt(true);
                                    }
                                }
                            }}
                        >
                            {languages.map((lang) => (
                                <option key={lang.code} value={lang.code}>
                                    {lang.label}
                                </option>
                            ))}
                        </select>
                        <span className="na-control-hint">
              Language for communicating with the avatar
            </span>
                    </div>

                    <div className="na-control-group">
                        <select
                            className="na-language-select"
                            value={selectedBackgroundId}
                            onChange={(e) => setSelectedBackgroundId(e.target.value)}
                        >
                            <option value="default">🎨 Default Background</option>
                            {canSelectBackground &&
                                backgroundOptions.map((background) => (
                                    <option key={background.id} value={background.id}>
                                        {background.title}
                                    </option>
                                ))}
                        </select>
                        <span className="na-control-hint">Avatar background overlay</span>
                    </div>

                    {connectionStatus !== "connected" ? (
                        <div className="na-control-group">
                            <button
                                type={"button"}
                                className="na-btn na-btn--primary"
                                id="startBtn"
                                onClick={handleRestart}
                            >
                                🎤 Start Conversation
                            </button>
                            <span className="na-control-hint">
                Click to start a conversation with the avatar
              </span>
                        </div>
                    ) : (
                        <div className="na-control-group">
                            <button
                                type={"button"}
                                className="na-btn na-btn--primary"
                                id="startBtn"
                                onClick={disconnect}
                            >
                                Stop
                            </button>
                            <span className="na-control-hint">
                Click to stop a conversation with the avatar
              </span>
                        </div>
                    )}

                    <div className="na-control-group">
                        <button
                            type={"button"}
                            className="na-btn na-btn--interrupt"
                            id="interruptBtn"
                            onClick={handleInterrupt}
                            disabled={agentStatus !== "speaking"}
                        >
                            ⏸️ Interrupt Neil Avatar
                        </button>
                        <span className="na-control-hint">
              Click if you want to interrupt the avatar
            </span>
                    </div>
                </div>
            </div>
        </div>
    );
};
