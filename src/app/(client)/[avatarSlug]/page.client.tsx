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
    mobileVideoOffsetPx?: number;
}

type BackgroundOption = {
    id: string;
    title: string;
    url: string;
    theme?: string;
};

const languages = [
    {code: "en-US", label: "🇺🇸 English"},
    {code: "hi-IN", label: "🇮🇳 Hindi"},
    {code: "mr-IN", label: "🇮🇳 Marathi"},
    {code: "es-ES", label: "🇪🇸 Spanish"},
    {code: "fr-FR", label: "🇫🇷 French"},
    {code: "ru-RU", label: "🇷🇺 Russian"},
    {code: "id-ID", label: "🇮🇩 Indonesian"},
];

const greetingByLanguage: Record<string, string> = {
    "en-US": "Hello!",
    "hi-IN": "नमस्ते!",
    "mr-IN": "नमस्कार!",
    "es-ES": "¡Hola!",
    "fr-FR": "Bonjour!",
    "ru-RU": "Здравствуйте!",
    "id-ID": "Halo!",
};

export const AvatarPageClient = ({
                                     agent,
                                     agentName,
                                     agentDescription,
                                     agentImageUrl,
                                     agentIdleVideoUrl,
                                     backgrounds,
                                     backgroundsEnabled,
                                     backgroundKeyColor,
                                     mobileVideoOffsetPx,
                                 }: IAvatarPageClientProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hasGreetedRef = useRef(false);
    const stageRef = useRef<HTMLDivElement | null>(null);
    const startingRef = useRef(false);
    const pendingTranscriptRef = useRef<string | null>(null);
    const lastSentRef = useRef<{ text: string; time: number } | null>(null);
    const sendInFlightRef = useRef(false);
    const connectionStatusRef = useRef<
        "idle" | "connecting" | "connected" | "error"
    >("idle");
    const isAgentSpeakingRef = useRef(false);
    const greetingPendingRef = useRef(false);
    const greetingStartedRef = useRef(false);
    const stopListeningRef = useRef<((dispose?: boolean) => void) | null>(null);
    const responsePendingRef = useRef(false);
    const responseStartedRef = useRef(false);
    const preconnectListeningRef = useRef(false);

    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [showError, setShowError] = useState(false);
    const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
    const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
    const [canFullscreen, setCanFullscreen] = useState(false);
    const [supportsNativeFullscreen, setSupportsNativeFullscreen] = useState<
        boolean | null
    >(null);
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
    const [showSttDebug, setShowSttDebug] = useState(false);
    const [sttFlowLog, setSttFlowLog] = useState<
        { ts: string; event: string; detail?: string }[]
    >([]);

    const isFullscreen = isNativeFullscreen || isPseudoFullscreen;

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
        if (typeof document === "undefined") return;
        const className = "na-body-pseudo-fullscreen";
        if (isPseudoFullscreen) {
            document.body.classList.add(className);
        } else {
            document.body.classList.remove(className);
        }
        return () => document.body.classList.remove(className);
    }, [isPseudoFullscreen]);

    useEffect(() => {
        if (isNativeFullscreen && isPseudoFullscreen) {
            setIsPseudoFullscreen(false);
        }
    }, [isNativeFullscreen, isPseudoFullscreen]);


    useEffect(() => {
        if (micPermission === "granted") {
            setShowMicPrompt(false);
            setMicError("");
        }
    }, [micPermission]);

    const toggleFullscreen = useCallback(() => {
        const element = stageRef.current as
            | (HTMLElement & {
                  webkitRequestFullscreen?: () => Promise<void>;
                  mozRequestFullScreen?: () => Promise<void>;
                  msRequestFullscreen?: () => Promise<void>;
              })
            | null;
        if (!element) return;

        const doc = document as Document & {
            webkitFullscreenElement?: Element | null;
            mozFullScreenElement?: Element | null;
            msFullscreenElement?: Element | null;
            webkitExitFullscreen?: () => Promise<void>;
            mozCancelFullScreen?: () => Promise<void>;
            msExitFullscreen?: () => Promise<void>;
        };
        const root = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void>;
            mozRequestFullScreen?: () => Promise<void>;
            msRequestFullscreen?: () => Promise<void>;
        };

        const requestElement =
            element.requestFullscreen ||
            element.webkitRequestFullscreen ||
            element.mozRequestFullScreen ||
            element.msRequestFullscreen;
        const requestRoot =
            root.requestFullscreen ||
            root.webkitRequestFullscreen ||
            root.mozRequestFullScreen ||
            root.msRequestFullscreen;
        const request = requestElement || requestRoot;

        //@ts-ignore
        const requestTarget = requestElement ? element : root;

        const hasNativeFullscreen =
            supportsNativeFullscreen !== false && Boolean(request);

        if (!hasNativeFullscreen) {
            setIsPseudoFullscreen((prev) => !prev);
            return;
        }

        const isActive =
            doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement ||
            doc.msFullscreenElement;

        if (isActive) {
            const exit =
                doc.exitFullscreen ||
                doc.webkitExitFullscreen ||
                doc.mozCancelFullScreen ||
                doc.msExitFullscreen;
            try {
                exit?.call(doc);
            } catch (_error) {}
            return;
        }

        try {
            request?.call(requestTarget);
        } catch (_error) {}
    }, [supportsNativeFullscreen]);

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

    useEffect(() => {
        connectionStatusRef.current = connectionStatus;
    }, [connectionStatus]);

    useEffect(() => {
        isAgentSpeakingRef.current = isAgentSpeaking;
    }, [isAgentSpeaking]);

    useEffect(() => {
        if (responsePendingRef.current && isAgentSpeaking) {
            responseStartedRef.current = true;
            return;
        }
        if (responseStartedRef.current && !isAgentSpeaking) {
            responseStartedRef.current = false;
            responsePendingRef.current = false;
        }
    }, [isAgentSpeaking]);

    const handleIdleTimeout = useCallback(() => {
        disconnect();
        setAgentStatus("timed_out");
    }, [disconnect]);

    const {resetTimer} = useIdleTimer({
        isActive: agentStatus === "listening",
        onTimeout: handleIdleTimeout,
    });

    const normalizeTranscript = useCallback((text: string) => {
        return text.trim().replace(/\s+/g, " ");
    }, []);

    const sendTranscript = useCallback(
        async (text: string) => {
            const normalized = normalizeTranscript(text);
            if (!normalized) return;

            const last = lastSentRef.current;
            if (
                last &&
                last.text === normalized &&
                Date.now() - last.time < 1500
            ) {
                return;
            }

            if (sendInFlightRef.current) {
                pendingTranscriptRef.current = normalized;
                return;
            }

            sendInFlightRef.current = true;
            lastSentRef.current = { text: normalized, time: Date.now() };
            responsePendingRef.current = true;
            responseStartedRef.current = false;
            stopListeningRef.current?.();
            setAgentStatus("thinking");
            resetTimer();

            const ts = new Date().toISOString().split("T")[1]?.replace("Z", "") ?? "";
            setSttFlowLog((prev) => [
                { ts, event: "send_start", detail: normalized },
                ...prev,
            ].slice(0, 50));

            const res = await speak(normalized, language);
            if (!res?.success) {
                setShowError(true);
                setAgentStatus("idle");
                responsePendingRef.current = false;
                responseStartedRef.current = false;
            }

            setSttFlowLog((prev) => [
                {
                    ts,
                    event: "send_done",
                    // @ts-ignore
                    detail: res?.success ? "ok" : `fail:${res?.error ?? "unknown"}`,
                },
                ...prev,
            ].slice(0, 50));

            sendInFlightRef.current = false;
            const pending = pendingTranscriptRef.current;
            if (
                pending &&
                connectionStatusRef.current === "connected" &&
                !isAgentSpeakingRef.current
            ) {
                pendingTranscriptRef.current = null;
                void sendTranscript(pending);
            }
        },
        [normalizeTranscript, resetTimer, speak, language],
    );

    const handleUserSpeech = useCallback(
        (text: string) => {
            const ts = new Date().toISOString().split("T")[1]?.replace("Z", "") ?? "";
            if (agentStatus !== "listening") {
                setSttFlowLog((prev) => [
                    { ts, event: "transcript_drop", detail: `status=${agentStatus}` },
                    ...prev,
                ].slice(0, 50));
                return;
            }
            const normalized = normalizeTranscript(text);
            if (!normalized) {
                setSttFlowLog((prev) => [
                    { ts, event: "transcript_drop", detail: "empty" },
                    ...prev,
                ].slice(0, 50));
                return;
            }

            if (isAgentSpeakingRef.current) {
                setSttFlowLog((prev) => [
                    { ts, event: "transcript_hold", detail: "agent_speaking" },
                    ...prev,
                ].slice(0, 50));
                pendingTranscriptRef.current = normalized;
                return;
            }

            if (connectionStatusRef.current !== "connected") {
                setSttFlowLog((prev) => [
                    { ts, event: "transcript_hold", detail: `conn=${connectionStatusRef.current}` },
                    ...prev,
                ].slice(0, 50));
                pendingTranscriptRef.current = normalized;
                return;
            }

            setSttFlowLog((prev) => [
                { ts, event: "transcript_ok", detail: normalized },
                ...prev,
            ].slice(0, 50));
            void sendTranscript(normalized);
        },
        [normalizeTranscript, sendTranscript, agentStatus],
    );

    const {
        listening,
        startListening,
        stopListening,
        interimTranscript,
        warmupAudio,
        debugLog,
        clearDebug,
        isAppleMobile,
        mediaStreamActive,
    } = useAzureSTT(handleUserSpeech);

    const shouldListenDebug =
        ((connectionStatus === "connected" && agentStatus === "listening") ||
            (isAppleMobile && preconnectListeningRef.current)) &&
        !showError &&
        micPermission === "granted" &&
        !isAgentSpeaking &&
        !sendInFlightRef.current &&
        !responsePendingRef.current;

    useEffect(() => {
        stopListeningRef.current = stopListening;
    }, [stopListening]);


    useEffect(() => {
        if (typeof document === "undefined") return;

        const doc = document as Document & {
            webkitFullscreenEnabled?: boolean;
            webkitFullscreenElement?: Element | null;
            mozFullScreenEnabled?: boolean;
            mozFullScreenElement?: Element | null;
            msFullscreenEnabled?: boolean;
            msFullscreenElement?: Element | null;
        };

        const element = stageRef.current as
            | (HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void>;
            mozRequestFullScreen?: () => Promise<void>;
            msRequestFullscreen?: () => Promise<void>;
        })
            | null;
        const root = document.documentElement as HTMLElement & {
            webkitRequestFullscreen?: () => Promise<void>;
            mozRequestFullScreen?: () => Promise<void>;
            msRequestFullscreen?: () => Promise<void>;
        };

        const nativeFlag =
            doc.fullscreenEnabled ??
            doc.webkitFullscreenEnabled ??
            doc.mozFullScreenEnabled ??
            doc.msFullscreenEnabled;

        const elementSupports = Boolean(
            element?.requestFullscreen ||
            element?.webkitRequestFullscreen ||
            element?.mozRequestFullScreen ||
            element?.msRequestFullscreen ||
            root.requestFullscreen ||
            root.webkitRequestFullscreen ||
            root.mozRequestFullScreen ||
            root.msRequestFullscreen,
        );

        const isEnabled = nativeFlag === false ? false : elementSupports;

        setSupportsNativeFullscreen(isEnabled);
        setCanFullscreen(Boolean(element));

        const getFullscreenElement = () =>
            doc.fullscreenElement ||
            doc.webkitFullscreenElement ||
            doc.mozFullScreenElement ||
            doc.msFullscreenElement ||
            null;

        const handleChange = () => {
            setIsNativeFullscreen(Boolean(getFullscreenElement()));
        };

        const events = [
            "fullscreenchange",
            "webkitfullscreenchange",
            "mozfullscreenchange",
            "MSFullscreenChange",
        ] as const;

        // biome-ignore lint/suspicious/useIterableCallbackReturn: <explanation>
        events.forEach((e) => document.addEventListener(e, handleChange));
        handleChange();

        return () => {
            // biome-ignore lint/suspicious/useIterableCallbackReturn: <explanation>
            events.forEach((e) => document.removeEventListener(e, handleChange));
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

    const requestMicrophoneAccess = useCallback(async () => {
        setMicError("");
        if (!navigator.mediaDevices?.getUserMedia) {
            setMicPermission("denied");
            setMicError("Microphone is not available in this browser.");
            return false;
        }
        setMicRequesting(true);
        try {
            await warmupAudio();
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
    }, [warmupAudio]);

    const ensureMicrophoneAccess = useCallback(async () => {
        if (micPermission === "granted") return true;
        const ok = await requestMicrophoneAccess();
        if (!ok) setShowMicPrompt(true);
        return ok;
    }, [micPermission, requestMicrophoneAccess]);

    const startConversation = useCallback(async () => {
        setAgentStatus("preparing");
        startingRef.current = true;
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
        preconnectListeningRef.current = false;
        const hasMic = await ensureMicrophoneAccess();
        if (!hasMic) {
            setPendingStart(true);
            setShowMicPrompt(true);
            return;
        }
        setPendingStart(false);
        if (isAppleMobile && !listening) {
            preconnectListeningRef.current = true;
            startListening(language);
        }
        await startConversation();
    };

    const handleInterrupt = useCallback(() => {
        interrupt();
        resetTimer();
        setAgentStatus("listening");
    }, [interrupt, resetTimer]);

    useEffect(() => {
        if (!greetingPendingRef.current) return;
        if (isAgentSpeaking) {
            greetingStartedRef.current = true;
            return;
        }
        if (greetingStartedRef.current && !isAgentSpeaking) {
            greetingPendingRef.current = false;
            greetingStartedRef.current = false;
            setAgentStatus("listening");
        }
    }, [isAgentSpeaking]);

    useEffect(() => {
        if (agentStatus === "timed_out") return;
        if (connectionStatus === "error") {
            setShowError(true);
            startingRef.current = false;
            responsePendingRef.current = false;
            responseStartedRef.current = false;
            preconnectListeningRef.current = false;
            if (listening) stopListening();
            return;
        }
        if (connectionStatus === "idle") {
            if (startingRef.current) {
                return;
            }
            if (listening) stopListening();
            if (!showError) {
                setAgentStatus("idle");
                setIsVideoPlaying(false);
            }
            responsePendingRef.current = false;
            responseStartedRef.current = false;
            preconnectListeningRef.current = false;
            return;
        }
        if (connectionStatus === "connecting") {
            if (agentStatus !== "preparing") {
                setAgentStatus("preparing");
            }
            return;
        }
        startingRef.current = false;
        preconnectListeningRef.current = false;

        if (isAgentSpeaking) {
            setAgentStatus("speaking");
        } else {
            if (
                agentStatus === "speaking" ||
                agentStatus === "thinking" ||
                agentStatus === "idle" ||
                agentStatus === "preparing"
            ) {
                if (
                    !greetingPendingRef.current &&
                    !responsePendingRef.current
                ) {
                    setAgentStatus("listening");
                }
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
            ((connectionStatus === "connected" && agentStatus === "listening") ||
                (isAppleMobile && preconnectListeningRef.current)) &&
            !showError &&
            micPermission === "granted" &&
            !isAgentSpeaking &&
            !sendInFlightRef.current &&
            !responsePendingRef.current;

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
        listening,
        startListening,
        stopListening,
        language,
        showError,
        connectionStatus,
        micPermission,
        isAgentSpeaking,
        agentStatus,
        isAppleMobile,
    ]);

    useEffect(() => {
        if (isAppleMobile && connectionStatus === "connected") {
            const timer = setInterval(() => {
                if (shouldListenDebug && !listening) {
                    startListening(language);
                }
            }, 1500);
            return () => clearInterval(timer);
        }
    }, [
        isAppleMobile,
        connectionStatus,
        shouldListenDebug,
        listening,
        startListening,
        language,
    ]);

    useEffect(() => {
        if (
            connectionStatus !== "connected" ||
            isAgentSpeaking ||
            sendInFlightRef.current
        ) {
            return;
        }
        const pending = pendingTranscriptRef.current;
        if (pending) {
            pendingTranscriptRef.current = null;
            void sendTranscript(pending);
        }
    }, [connectionStatus, isAgentSpeaking, sendTranscript]);

    useEffect(() => {
        if (connectionStatus === "connected" && !hasGreetedRef.current) {
            hasGreetedRef.current = true;
            greetingPendingRef.current = true;
            greetingStartedRef.current = false;
            // setTimeout(() => {
            setAgentStatus("thinking");
            void speak(greetingByLanguage[language] ?? "Hello!", language).then(
                (res) => {
                    if (!res?.success) {
                        greetingPendingRef.current = false;
                        greetingStartedRef.current = false;
                        setAgentStatus("listening");
                    }
                },
            );
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
            if (isAppleMobile && !listening) {
                preconnectListeningRef.current = true;
                startListening(language);
            }
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
        isAppleMobile,
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
                <div
                    className={`na-avatar-container ${isPseudoFullscreen ? "na-avatar-container--pseudo-fullscreen" : ""}`}
                    ref={stageRef}
                >
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
                            {isFullscreen ? (
                                // biome-ignore lint/a11y/noSvgWithoutTitle: 1
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>
                                </svg>
                            ) : (
                                // biome-ignore lint/a11y/noSvgWithoutTitle: 1
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                                </svg>
                            )}
                        </button>
                    )}

                    <AvatarStage
                        videoRef={videoRef}
                        idleVideoUrl={idleVideoUrl}
                        idleImageUrl={idleImageUrl}
                        backgroundUrl={activeBackgroundUrl}
                        backgroundKeyColor={backgroundKeyColor}
                        mobileVideoOffsetPx={mobileVideoOffsetPx}
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

                    {agentStatus === "listening" && listening && interimTranscript && (
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
                                    stopListening(true);
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

                    <div className="na-control-group">
                        <button
                            type="button"
                            className="na-btn na-btn--secondary"
                            onClick={() => setShowSttDebug((prev) => !prev)}
                        >
                            {showSttDebug ? "Hide STT Debug" : "Show STT Debug"}
                        </button>
                        <span className="na-control-hint">
              Show microphone / STT debug log (iOS troubleshooting)
            </span>
                    </div>
                </div>
            </div>

            {showSttDebug && (
                <div
                    className="na-stt-debug"
                    style={{
                        position: "fixed",
                        right: 20,
                        bottom: 20,
                        width: 360,
                        maxWidth: "90vw",
                        maxHeight: "50vh",
                        overflow: "auto",
                        background: "rgba(0,0,0,0.85)",
                        color: "#fff",
                        padding: 12,
                        borderRadius: 12,
                        zIndex: 9999,
                        fontSize: 12,
                    }}
                >
                    <div style={{display: "flex", justifyContent: "space-between", marginBottom: 8}}>
                        <strong>STT Debug</strong>
                        <button
                            type="button"
                            className="na-btn na-btn--secondary"
                            onClick={clearDebug}
                            style={{padding: "4px 8px", fontSize: 11}}
                        >
                            Clear
                        </button>
                    </div>
                    <div style={{marginBottom: 8}}>
                        <div>Device: {isAppleMobile ? "Apple mobile" : "Other"}</div>
                        <div>Listening: {listening ? "yes" : "no"}</div>
                        <div>Status: {agentStatus}</div>
                        <div>Connection: {connectionStatus}</div>
                        <div>Agent speaking: {isAgentSpeaking ? "yes" : "no"}</div>
                        <div>Send in flight: {sendInFlightRef.current ? "yes" : "no"}</div>
                        <div>
                            Pending transcript:{" "}
                            {pendingTranscriptRef.current ? "yes" : "no"}
                        </div>
                        <div>
                            Last sent:{" "}
                            {lastSentRef.current?.text
                                ? `"${lastSentRef.current.text}"`
                                : "—"}
                        </div>
                        <div>Mic permission: {micPermission}</div>
                        <div>Mic requesting: {micRequesting ? "yes" : "no"}</div>
                        <div>Mic prompt: {showMicPrompt ? "shown" : "hidden"}</div>
                        <div>Mic error: {micError || "—"}</div>
                        <div>Should listen: {shouldListenDebug ? "yes" : "no"}</div>
                        <div>
                            Preconnect listening:{" "}
                            {preconnectListeningRef.current ? "yes" : "no"}
                        </div>
                        <div>
                            MediaStream: {mediaStreamActive ? "active" : "none"}
                        </div>
                        <div>
                            MediaDevices:{" "}
                            {typeof navigator !== "undefined" &&
                            Boolean(navigator.mediaDevices?.getUserMedia)
                                ? "available"
                                : "missing"}
                        </div>
                    </div>
                    {debugLog.length === 0 && <div>No events yet.</div>}
                    {debugLog.map((entry, index) => (
                        <div key={`${entry.ts}-${index}`}>
                            [{entry.ts}] {entry.event}
                            {entry.detail ? ` — ${entry.detail}` : ""}
                        </div>
                    ))}
                    <div style={{marginTop: 10, opacity: 0.8}}>Flow</div>
                    {sttFlowLog.length === 0 && <div>No flow events yet.</div>}
                    {sttFlowLog.map((entry, index) => (
                        <div key={`flow-${entry.ts}-${index}`}>
                            [{entry.ts}] {entry.event}
                            {entry.detail ? ` — ${entry.detail}` : ""}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
