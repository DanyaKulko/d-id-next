import * as SpeechSDK from "microsoft-cognitiveservices-speech-sdk";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAzureSpeechToken } from "@/app/actions/azure.actions";
import { logExternalErrorAction } from "@/app/actions/logging.actions";

const TOKEN_EXPIRATION_MS = 9 * 60 * 1000;

interface CachedToken {
  value: string;
  region: string;
  expiresAt: number;
}

type DebugEntry = {
  ts: string;
  event: string;
  detail?: string;
};

export const useAzureSTT = (onFinalTranscript: (text: string) => void) => {
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [debugLog, setDebugLog] = useState<DebugEntry[]>([]);

  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const tokenCacheRef = useRef<CachedToken | null>(null);
  const activeLangRef = useRef<string | null>(null);
  const isStoppedRef = useRef(false);
  const listeningRef = useRef(false);
  const startGuardRef = useRef(false);
  const isAppleMobileRef = useRef(false);
  const recognizerRunningRef = useRef(false);
  const partialBufferRef = useRef("");
  const partialTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const getOrFetchToken = useCallback(async () => {
    const now = Date.now();
    if (tokenCacheRef.current && now < tokenCacheRef.current.expiresAt) {
      return {
        token: tokenCacheRef.current.value,
        region: tokenCacheRef.current.region,
      };
    }
    const { token, region, error } = await getAzureSpeechToken();
    if (error || !token || !region) throw new Error("Failed to fetch token");

    tokenCacheRef.current = {
      value: token,
      region: region,
      expiresAt: now + TOKEN_EXPIRATION_MS,
    };
    return { token, region };
  }, []);

  const logSttError = useCallback(
    async (
      type: string,
      message: string,
      metadata?: Record<string, unknown>,
    ) => {
      await logExternalErrorAction({
        source: "Azure STT",
        type,
        message,
        level: "ERROR",
        metadata,
      });
    },
    [],
  );

  const resumeAudioContext = useCallback(async () => {
    if (typeof window === "undefined") return;
    const AudioCtx =
      window.AudioContext ||
      (window as typeof window & { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return;
    try {
      const ctx = new AudioCtx();
      if (ctx.state === "suspended") {
        await ctx.resume();
      }
      await ctx.close();
    } catch (_error) {}
  }, []);

  const logDebug = useCallback((event: string, detail?: string) => {
    const entry = {
      ts: new Date().toISOString().split("T")[1]?.replace("Z", "") ?? "",
      event,
      detail,
    };
    setDebugLog((prev) => {
      const next = [entry, ...prev];
      return next.slice(0, 50);
    });
  }, []);

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    const ua = navigator.userAgent || "";
    isAppleMobileRef.current =
      /iPad|iPhone|iPod/.test(ua) ||
      (ua.includes("Mac") && navigator.maxTouchPoints > 1);
  }, []);

  const startRecognition = useCallback((recognizer: SpeechSDK.SpeechRecognizer) => {
    return new Promise<void>((resolve, reject) => {
      recognizer.startContinuousRecognitionAsync(
        () => resolve(),
        (error) => reject(error),
      );
    });
  }, []);

  const stopRecognition = useCallback((recognizer: SpeechSDK.SpeechRecognizer) => {
    return new Promise<void>((resolve) => {
      recognizer.stopContinuousRecognitionAsync(() => resolve(), () => resolve());
    });
  }, []);

  const clearPartialTimer = useCallback(() => {
    if (partialTimerRef.current) {
      clearTimeout(partialTimerRef.current);
      partialTimerRef.current = null;
    }
  }, []);

  const startListening = useCallback(
    async (lang: string) => {
      if (startGuardRef.current) return;
      if (listeningRef.current) return;
      startGuardRef.current = true;
      isStoppedRef.current = false;
      try {
        logDebug("start", `lang=${lang}`);
        const { token, region } = await getOrFetchToken();

        if (isStoppedRef.current) return;

        await resumeAudioContext();

        const isAppleMobile = isAppleMobileRef.current;
        const sameLanguage = activeLangRef.current === lang;

        if (recognizerRef.current && sameLanguage) {
          if (!recognizerRunningRef.current) {
            await startRecognition(recognizerRef.current);
            recognizerRunningRef.current = true;
          }
          setListening(true);
          logDebug("resume", `lang=${lang}`);
          return;
        }

        if (recognizerRef.current) {
          try {
            await stopRecognition(recognizerRef.current);
          } catch (_error) {}
          try {
            recognizerRef.current.close();
          } catch (_error) {}
          recognizerRef.current = null;
          activeLangRef.current = null;
        }

        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
          token,
          region,
        );
        speechConfig.speechRecognitionLanguage = lang;

        speechConfig.setProperty(
          SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
          isAppleMobile ? "5000" : "3000",
        );
        speechConfig.setProperty(
          SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
          isAppleMobile ? "30000" : "15000",
        );

        const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
        const recognizer = new SpeechSDK.SpeechRecognizer(
          speechConfig,
          audioConfig,
        );

        recognizer.sessionStarted = () => {
          logDebug("session_started");
        };

        recognizer.speechStartDetected = () => {
          logDebug("speech_start");
        };

        recognizer.speechEndDetected = () => {
          logDebug("speech_end");
        };

        recognizer.recognizing = (_s, e) => {
          if (!listeningRef.current || isStoppedRef.current) return;
          if (e.result.text) {
            setInterimTranscript(e.result.text);
            partialBufferRef.current = e.result.text;
            clearPartialTimer();
            partialTimerRef.current = setTimeout(() => {
              if (!listeningRef.current || isStoppedRef.current) return;
              const fallbackText = partialBufferRef.current.trim();
              if (fallbackText) {
                onFinalTranscript(fallbackText);
              }
              partialBufferRef.current = "";
              setInterimTranscript("");
            }, 1400);
          }
          logDebug("recognizing", e.result.text ?? "");
        };

        recognizer.recognized = (_s, e) => {
          if (!listeningRef.current || isStoppedRef.current) return;

          if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            const text = e.result.text;
            if (text && text.trim().length > 0) {
              console.log("✅ Final phrase:", text);
              onFinalTranscript(text);
              // Не останавливаем здесь! Пусть родитель решит остановить,
              // когда перейдет в статус 'thinking'.
            }
            clearPartialTimer();
            partialBufferRef.current = "";
            setInterimTranscript("");
            logDebug("recognized", text ?? "");
          } else if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
            logDebug("no_match");
            const fallbackText = partialBufferRef.current.trim();
            if (fallbackText) {
              onFinalTranscript(fallbackText);
            }
            clearPartialTimer();
            partialBufferRef.current = "";
            setInterimTranscript("");
          }
        };

        recognizer.canceled = (_s, e) => {
          console.warn(`STT Canceled: ${e.reason}`);
          logDebug(
            "canceled",
            `${e.reason}${e.errorDetails ? `: ${e.errorDetails}` : ""}`,
          );
          if (e.reason === SpeechSDK.CancellationReason.Error) {
            void logSttError(
              "STT Canceled",
              e.errorDetails ?? "Speech recognition canceled",
              { reason: e.reason },
            );
          }
          if (!isStoppedRef.current) {
            setListening(false);
          }
          setInterimTranscript("");
          clearPartialTimer();
          partialBufferRef.current = "";
          recognizerRef.current = null;
          activeLangRef.current = null;
          recognizerRunningRef.current = false;
        };

        recognizer.sessionStopped = () => {
          logDebug("session_stopped");
          if (!isStoppedRef.current) {
            setListening(false);
          }
          setInterimTranscript("");
          clearPartialTimer();
          partialBufferRef.current = "";
          recognizerRef.current = null;
          activeLangRef.current = null;
          recognizerRunningRef.current = false;
        };

        await startRecognition(recognizer);
        setListening(true);
        recognizerRef.current = recognizer;
        activeLangRef.current = lang;
        recognizerRunningRef.current = true;
        logDebug("started", `lang=${lang}`);
      } catch (error) {
        console.error("STT Start Error:", error);
        logDebug(
          "start_error",
          error instanceof Error ? error.message : "start failed",
        );
        void logSttError(
          "STT Start Error",
          error instanceof Error ? error.message : "Failed to start STT",
          { lang },
        );
        setListening(false);
      } finally {
        startGuardRef.current = false;
      }
    },
    [
      onFinalTranscript,
      getOrFetchToken,
      logSttError,
      resumeAudioContext,
      startRecognition,
      stopRecognition,
    ],
  );

  const stopListening = useCallback((dispose?: boolean) => {
    const keepAlive = isAppleMobileRef.current && !dispose;
    if (keepAlive) {
      startGuardRef.current = false;
      setListening(false);
      setInterimTranscript("");
      clearPartialTimer();
      partialBufferRef.current = "";
      logDebug("stop", "pause_ios_keepalive");
      return;
    }

    isStoppedRef.current = true;
    startGuardRef.current = false;
    setListening(false);
    setInterimTranscript("");
    clearPartialTimer();
    partialBufferRef.current = "";
    logDebug("stop", dispose ? "dispose" : "pause");

    if (recognizerRef.current) {
      const r = recognizerRef.current;
      console.log("🛑 Stopping Azure STT...");
      r.stopContinuousRecognitionAsync(
        () => {
          if (dispose || !isAppleMobileRef.current) {
            try {
              r.close();
            } catch (_error) {}
            recognizerRef.current = null;
            activeLangRef.current = null;
            recognizerRunningRef.current = false;
          } else {
            recognizerRunningRef.current = false;
          }
        },
        () => {
          if (dispose || !isAppleMobileRef.current) {
            try {
              r.close();
            } catch (_error) {}
            recognizerRef.current = null;
            activeLangRef.current = null;
            recognizerRunningRef.current = false;
          } else {
            recognizerRunningRef.current = false;
          }
        },
      );
    }
  }, [clearPartialTimer]);

  useEffect(() => {
    return () => stopListening(true);
  }, [stopListening]);

  return {
    listening,
    startListening,
    stopListening,
    interimTranscript,
    warmupAudio: resumeAudioContext,
    debugLog,
    clearDebug: () => setDebugLog([]),
    isAppleMobile: isAppleMobileRef.current,
  };
};
