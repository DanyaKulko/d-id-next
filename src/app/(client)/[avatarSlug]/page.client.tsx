"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarStage } from "@/app/(client)/[avatarSlug]/_components/AvatarStage/AvatarStage";
import { DebugMediaPanel } from "@/app/(client)/[avatarSlug]/_components/DebugMediaPanel/DebugMediaPanel";
import { MediaCarousel } from "@/app/(client)/[avatarSlug]/_components/MediaCarousel/MediaCarousel";
import { MediaOverlay } from "@/app/(client)/[avatarSlug]/_components/MediaOverlay/MediaOverlay";
import { useAgent } from "@/app/(client)/[avatarSlug]/_hooks/useAgent";
import { useAzureSTT } from "@/app/(client)/[avatarSlug]/_hooks/useAzureSTT";
import { useIdleTimer } from "@/app/(client)/[avatarSlug]/_hooks/useIdleTimer";
import {
  pickTriggerPhrase,
  type TriggerType,
} from "@/app/(client)/[avatarSlug]/_lib/trigger-phrases";
import { resolveMediaIntentAction } from "@/app/actions/media.actions";
import watermark from "@/assets/img/neil_avatar_watermark.png";
import EducationalTooltip from "@/components/EducationalTooltip/EducationalTooltip";
import { useShowOncePerSession } from "@/components/EducationalTooltip/useShowOncePerSession";
import type { MediaResolveResult } from "@/lib/media/types";

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
  { code: "en-US", label: "🇺🇸 English" },
  { code: "hi-IN", label: "🇮🇳 Hindi" },
  { code: "mr-IN", label: "🇮🇳 Marathi" },
  { code: "es-ES", label: "🇪🇸 Spanish" },
  { code: "fr-FR", label: "🇫🇷 French" },
  { code: "ru-RU", label: "🇷🇺 Russian" },
  { code: "id-ID", label: "🇮🇩 Indonesian" },
];

const greetingByLanguage: Record<string, string> = {
  "en-US":
    "Hi there. Thank you for taking time to visit with me. I suggest starting with your questions.",
  "hi-IN":
    "नमस्ते। मुझसे मिलने के लिए समय निकालने के लिए धन्यवाद। मेरा सुझाव है कि आप अपने सवालों से शुरुआत करें।",
  "mr-IN":
    "नमस्कार. मला भेटण्यासाठी वेळ दिल्याबद्दल धन्यवाद. माझा सल्ला आहे की तुम्ही तुमच्या प्रश्नांपासून सुरुवात करा.",
  "es-ES":
    "Hola. Gracias por tomarte el tiempo de hablar conmigo. Te sugiero empezar con tus preguntas.",
  "fr-FR":
    "Bonjour. Merci de prendre le temps de venir me parler. Je vous suggère de commencer par vos questions.",
  "ru-RU":
    "Привет. Спасибо, что нашёл время поговорить со мной. Предлагаю начать с твоих вопросов.",
  "id-ID":
    "Halo. Terima kasih sudah meluangkan waktu untuk berbincang dengan saya. Saya sarankan mulai dengan pertanyaan Anda.",
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
  const silenceNudgedRef = useRef(false);
  const preconnectListeningRef = useRef(false);
  const reconnectingRef = useRef(false);

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
  const languageSelectRef = useRef<HTMLSelectElement | null>(null);
  const langTip = useShowOncePerSession("na.tip.lang");

  useEffect(() => {
    const el = languageSelectRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;

    let intersectionObserver: IntersectionObserver | null = null;
    let mutationObserver: MutationObserver | null = null;

    const startWatching = () => {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
            langTip.trigger();
            intersectionObserver?.disconnect();
          }
        },
        { threshold: 0.5 },
      );
      intersectionObserver.observe(el);
    };

    if (!document.querySelector(".na-preloader")) {
      startWatching();
    } else if (typeof MutationObserver !== "undefined") {
      mutationObserver = new MutationObserver(() => {
        if (!document.querySelector(".na-preloader")) {
          mutationObserver?.disconnect();
          startWatching();
        }
      });
      mutationObserver.observe(document.body, {
        childList: true,
        subtree: true,
      });
    } else {
      startWatching();
    }

    return () => {
      intersectionObserver?.disconnect();
      mutationObserver?.disconnect();
    };
  }, [langTip.trigger]);

  const interruptBtnRef = useRef<HTMLButtonElement | null>(null);
  const interruptTip = useShowOncePerSession("na.tip.interrupt");

  useEffect(() => {
    if (agentStatus === "speaking") interruptTip.trigger();
  }, [agentStatus, interruptTip.trigger]);

  const startBtnRef = useRef<HTMLButtonElement | null>(null);
  const startTip = useShowOncePerSession("na.tip.start");

  const [selectedBackgroundId, setSelectedBackgroundId] = useState("default");
  const [mediaResult, setMediaResult] = useState<MediaResolveResult | null>(
    null,
  );
  const [debugMediaResult, setDebugMediaResult] =
    useState<MediaResolveResult | null>(null);
  const [carouselOpen, setCarouselOpen] = useState(false);
  const [carouselIndex, setCarouselIndex] = useState(0);
  const isDebugEnabled = process.env.NODE_ENV === "development";
  const activeMediaResult = debugMediaResult ?? mediaResult;
  const isAppleMobileUa = useMemo(() => {
    if (typeof navigator === "undefined") return false;
    const ua = navigator.userAgent || "";
    return (
      /iPad|iPhone|iPod/.test(ua) ||
      (ua.includes("Mac") && navigator.maxTouchPoints > 1)
    );
  }, []);

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

    //@ts-expect-error
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
    sendStreamScript,
    interrupt,
    status: connectionStatus,
    isAgentSpeaking,
    getIds,
  } = useAgent(agent.agentId, videoRef);

  useEffect(() => {
    connectionStatusRef.current = connectionStatus;
  }, [connectionStatus]);

  useEffect(() => {
    if (connectionStatus === "connected") startTip.close();
  }, [connectionStatus, startTip.close]);

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
    setMediaResult(null);
    setCarouselOpen(false);
  }, [disconnect]);

  const { resetTimer } = useIdleTimer({
    isActive: agentStatus === "listening" && !isAppleMobileUa,
    onTimeout: handleIdleTimeout,
  });

  const ensureConnection = useCallback(async () => {
    if (reconnectingRef.current) return;
    reconnectingRef.current = true;
    setAgentStatus("preparing");
    try {
      await connect({ language });
    } finally {
      reconnectingRef.current = false;
    }
  }, [connect, language]);

  const normalizeTranscript = useCallback((text: string) => {
    return text.trim().replace(/\s+/g, " ");
  }, []);

  const speakTrigger = useCallback(
    async (
      type: TriggerType,
      options?: { skipSpeakingGuard?: boolean },
    ): Promise<boolean> => {
      if (connectionStatusRef.current !== "connected") return false;
      if (!options?.skipSpeakingGuard && isAgentSpeakingRef.current) {
        return false;
      }
      const phrase = pickTriggerPhrase(type, language);
      if (!phrase) return false;
      const res = await sendStreamScript(phrase);
      return Boolean(res?.success);
    },
    [sendStreamScript, language],
  );

  const sendTranscript = useCallback(
    async (text: string) => {
      const normalized = normalizeTranscript(text);
      if (!normalized) return;

      if (connectionStatusRef.current !== "connected") {
        pendingTranscriptRef.current = normalized;
        return;
      }

      const last = lastSentRef.current;
      if (last && last.text === normalized && Date.now() - last.time < 1500) {
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
      silenceNudgedRef.current = false;
      stopListeningRef.current?.();
      setAgentStatus("thinking");
      setMediaResult(null);
      setCarouselOpen(false);
      resetTimer();

      let res: { success: boolean; error?: string } = { success: true };
      let handledByMedia = false;
      const ids = getIds();

      if (ids?.chatId && ids.streamId && ids.sessionId) {
        try {
          const intentRes = await resolveMediaIntentAction(agent.agentId, {
            chatId: ids.chatId,
            streamId: ids.streamId,
            sessionId: ids.sessionId,
            text: normalized,
            language,
          });
          if (intentRes.success && intentRes.data.intent !== "none") {
            setMediaResult(intentRes.data);
            handledByMedia = true;
          }
        } catch (mediaError) {
          console.warn("Media intent resolution failed:", mediaError);
        }
      }

      if (!handledByMedia) {
        res = await speak(normalized, language);
      }

      if (!res?.success) {
        const errorMessage =
          "error" in (res ?? {}) ? String(res?.error ?? "") : "";
        if (errorMessage.toLowerCase().includes("not connected")) {
          pendingTranscriptRef.current = normalized;
          responsePendingRef.current = false;
          responseStartedRef.current = false;
          await ensureConnection();
          return;
        }
        responsePendingRef.current = false;
        responseStartedRef.current = false;
        // System error trigger: if the WebRTC stream is still alive we can
        // voice a short apology and keep the session going. Only fall back
        // to the hard error screen if even that fails (stream truly dead).
        const spokeApology = await speakTrigger("error", {
          skipSpeakingGuard: true,
        });
        if (spokeApology) {
          setAgentStatus("listening");
        } else {
          setShowError(true);
          setAgentStatus("idle");
        }
      }

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
    [
      normalizeTranscript,
      resetTimer,
      speak,
      language,
      ensureConnection,
      agent.agentId,
      getIds,
      speakTrigger,
    ],
  );

  const handleUserSpeech = useCallback(
    (text: string) => {
      const normalized = normalizeTranscript(text);
      if (!normalized) {
        return;
      }

      if (isAgentSpeakingRef.current) {
        pendingTranscriptRef.current = normalized;
        return;
      }

      if (connectionStatusRef.current !== "connected") {
        pendingTranscriptRef.current = normalized;
        return;
      }

      void sendTranscript(normalized);
    },
    [normalizeTranscript, sendTranscript],
  );

  const {
    listening,
    startListening,
    stopListening,
    interimTranscript,
    muted,
    toggleMute,
    warmupAudio,
    isAppleMobile,
  } = useAzureSTT(handleUserSpeech);

  const shouldListenNow = useCallback(() => {
    return (
      ((connectionStatus === "connected" && agentStatus === "listening") ||
        (isAppleMobile && preconnectListeningRef.current)) &&
      !showError &&
      micPermission === "granted" &&
      !isAgentSpeaking &&
      !sendInFlightRef.current &&
      !responsePendingRef.current
    );
  }, [
    agentStatus,
    connectionStatus,
    isAppleMobile,
    isAgentSpeaking,
    micPermission,
    showError,
  ]);

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
      } catch (_error) {}
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
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
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
      await connect({ language });
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
    setMediaResult(null);
    setCarouselOpen(false);
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
    silenceNudgedRef.current = false;
    // Acknowledge the interruption out loud ~1 of 3 times.
    if (Math.random() < 0.33) {
      void speakTrigger("interrupt", { skipSpeakingGuard: true });
    }
  }, [interrupt, resetTimer, speakTrigger]);

  // Silence nudge: if the user stays quiet for 15s while we're listening
  // (and no photos/videos are on screen), the avatar gently prompts once.
  // `interimTranscript` is a dependency on purpose: every partial word the
  // user utters (even before it's finalized / sent to D-ID) re-runs this
  // effect and restarts the 15s window, so we never interrupt mid-sentence.
  useEffect(() => {
    const mediaShown = Boolean(
      activeMediaResult && activeMediaResult.items.length > 0,
    );
    const userIsSpeaking = interimTranscript.trim().length > 0;
    const canNudge =
      connectionStatus === "connected" &&
      agentStatus === "listening" &&
      micPermission === "granted" &&
      !isAgentSpeaking &&
      !userIsSpeaking &&
      !showError &&
      !mediaShown &&
      !silenceNudgedRef.current;
    if (!canNudge) return;
    const timer = setTimeout(() => {
      silenceNudgedRef.current = true;
      void speakTrigger("silence");
    }, 15000);
    return () => clearTimeout(timer);
  }, [
    connectionStatus,
    agentStatus,
    micPermission,
    isAgentSpeaking,
    interimTranscript,
    showError,
    activeMediaResult,
    speakTrigger,
  ]);

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
      setMediaResult(null);
      setCarouselOpen(false);
      startingRef.current = false;
      responsePendingRef.current = false;
      responseStartedRef.current = false;
      preconnectListeningRef.current = false;
      reconnectingRef.current = false;
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
      setMediaResult(null);
      setCarouselOpen(false);
      responsePendingRef.current = false;
      responseStartedRef.current = false;
      preconnectListeningRef.current = false;
      reconnectingRef.current = false;
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
    reconnectingRef.current = false;

    if (isAgentSpeaking) {
      setAgentStatus("speaking");
    } else {
      if (
        agentStatus === "speaking" ||
        agentStatus === "thinking" ||
        agentStatus === "idle" ||
        agentStatus === "preparing"
      ) {
        if (!greetingPendingRef.current && !responsePendingRef.current) {
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
    const shouldListen = shouldListenNow();

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
        if (shouldListenNow() && !listening) {
          startListening(language);
        }
      }, 1500);
      return () => clearInterval(timer);
    }
  }, [
    isAppleMobile,
    connectionStatus,
    shouldListenNow,
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
      void sendStreamScript(
        greetingByLanguage[language] ?? "Hi. Let’s talk — ask me anything.",
      ).then((res) => {
        if (!res?.success) {
          greetingPendingRef.current = false;
          greetingStartedRef.current = false;
          setAgentStatus("listening");
        }
      });
      // }, 500);
    }
  }, [connectionStatus, sendStreamScript, language]);

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

          <div className="na-stage-actions">
            <button
              type="button"
              className={`na-stage-btn ${muted ? "na-stage-btn--active" : ""}`}
              onClick={toggleMute}
              aria-label={muted ? "Unmute microphone" : "Mute microphone"}
              aria-pressed={muted}
              title={
                muted
                  ? "Microphone muted — click to unmute"
                  : "Mute microphone (Neil won't hear you)"
              }
            >
              {muted ? (
                // biome-ignore lint/a11y/noSvgWithoutTitle: labelled via aria-label
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <line x1="2" y1="2" x2="22" y2="22" />
                  <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
                  <path d="M17 16.95A7 7 0 0 1 5 12v-1M12 18v4M8 22h8" />
                </svg>
              ) : (
                // biome-ignore lint/a11y/noSvgWithoutTitle: labelled via aria-label
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4M8 22h8" />
                </svg>
              )}
            </button>

            {canFullscreen && (
              <button
                type="button"
                className="na-stage-btn"
                onClick={toggleFullscreen}
                aria-label={
                  isFullscreen ? "Exit full screen" : "Enter full screen"
                }
                title={isFullscreen ? "Exit full screen" : "Enter full screen"}
              >
                {isFullscreen ? (
                  // biome-ignore lint/a11y/noSvgWithoutTitle: 1
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7" />
                  </svg>
                ) : (
                  // biome-ignore lint/a11y/noSvgWithoutTitle: 1
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                  </svg>
                )}
              </button>
            )}
          </div>

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

          <MediaOverlay
            items={activeMediaResult?.items ?? []}
            visible={Boolean(
              activeMediaResult &&
                activeMediaResult.items.length > 0 &&
                (debugMediaResult != null ||
                  (connectionStatus === "connected" && !showError)),
            )}
            onItemClick={(index) => {
              setCarouselIndex(index);
              setCarouselOpen(true);
            }}
          />

          {isDebugEnabled && (
            <DebugMediaPanel
              onLoad={(result) => {
                setDebugMediaResult(result);
                setCarouselOpen(false);
              }}
              onClear={() => {
                setDebugMediaResult(null);
                setCarouselOpen(false);
              }}
            />
          )}

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
                      minHeight: "45px",
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

          {carouselOpen &&
            activeMediaResult &&
            activeMediaResult.items.length > 0 && (
              <MediaCarousel
                items={activeMediaResult.items}
                startIndex={carouselIndex}
                onClose={() => setCarouselOpen(false)}
              />
            )}
        </div>

        <div className="na-controls">
          <div className="na-control-group">
            <select
              ref={languageSelectRef}
              className="na-language-select"
              value={language}
              onChange={(e) => {
                const nextLang = e.target.value;
                setLanguage(nextLang);
                setMediaResult(null);
                setCarouselOpen(false);
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
              <option disabled value="">
                Ask any question in any of these languages
              </option>
              {languages.map((lang) => (
                <option key={lang.code} value={lang.code}>
                  {lang.label}
                </option>
              ))}
            </select>
            <span className="na-control-hint">
              Click the &quot;English&quot; button to reveal other available
              languages
            </span>
            <EducationalTooltip
              anchorRef={languageSelectRef}
              open={langTip.show}
              onClose={langTip.close}
              position="bottom"
            >
              After you select a language, questions below remain in English.
              You must ask questions in the language you selected for the Avatar
              to speak in the same language.
            </EducationalTooltip>
          </div>

          <div className="na-control-group">
            <select
              className="na-language-select"
              value={selectedBackgroundId}
              onChange={(e) => setSelectedBackgroundId(e.target.value)}
              disabled={
                !canSelectBackground || connectionStatus !== "connected"
              }
            >
              <option disabled value="">
                Select a background from the list
              </option>
              <option value="default">🎨 Default Background</option>
              {canSelectBackground &&
                backgroundOptions.map((background) => (
                  <option key={background.id} value={background.id}>
                    {background.title}
                  </option>
                ))}
            </select>
            <span className="na-control-hint">
              {!canSelectBackground
                ? "Background selection is not available for this role."
                : connectionStatus !== "connected"
                  ? "Background selection becomes available only after you start the conversation."
                  : "Choose a background."}
            </span>
          </div>

          {connectionStatus !== "connected" ? (
            <div className="na-control-group">
              <button
                ref={startBtnRef}
                type={"button"}
                className="na-btn na-btn--primary"
                id="startBtn"
                onClick={() => {
                  startTip.trigger();
                  handleRestart();
                }}
              >
                🎤 Start Conversation
              </button>
              <span className="na-control-hint">
                Click &quot;Start Conversation&quot; to begin a session
              </span>
              <EducationalTooltip
                anchorRef={startBtnRef}
                open={startTip.show}
                onClose={startTip.close}
                position="top"
              >
                When you click Start Conversation, it takes about 20 seconds for
                the Avatar to come alive. Be patient.
              </EducationalTooltip>
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
                Click Stop to exit in case you want to take an extended break.
              </span>
            </div>
          )}

          <div className="na-control-group">
            <button
              ref={interruptBtnRef}
              type={"button"}
              className="na-btn na-btn--interrupt"
              id="interruptBtn"
              onClick={handleInterrupt}
              disabled={agentStatus !== "speaking"}
            >
              ⏸️ Interrupt Neil Avatar
            </button>
            <span className="na-control-hint">
              Click Interrupt if you want to move to another topic.
            </span>
            <EducationalTooltip
              anchorRef={interruptBtnRef}
              open={interruptTip.show}
              onClose={interruptTip.close}
              position="top"
            >
              Ask another question — the Avatar will start replying. The
              Interrupt button keeps Avatar on line.
            </EducationalTooltip>
          </div>
        </div>
      </div>
    </div>
  );
};
