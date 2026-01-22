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
  const mediaStreamRef = useRef<MediaStream | null>(null);

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
    logDebug("hook_init", `ua=${typeof navigator !== "undefined" ? navigator.userAgent : "n/a"}`);
  }, [logDebug]);

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

  const startRecognition = useCallback(
    (recognizer: SpeechSDK.SpeechRecognizer) => {
      return new Promise<void>((resolve, reject) => {
        recognizer.startContinuousRecognitionAsync(
          () => {
            logDebug("start_async_ok");
            resolve();
          },
          (error) => {
            logDebug("start_async_err", String(error));
            reject(error);
          },
        );
      });
    },
    [logDebug],
  );

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
      if (startGuardRef.current) {
        logDebug("start_skip_guard");
        return;
      }
      if (listeningRef.current) {
        logDebug("start_skip_listening");
        return;
      }
      startGuardRef.current = true;
      isStoppedRef.current = false;
      try {
        logDebug("start", `lang=${lang}`);
        const { token, region } = await getOrFetchToken();
        logDebug("token_ok", `region=${region}`);

        if (isStoppedRef.current) return;

        const isAppleMobile =
          isAppleMobileRef.current ||
          (typeof navigator !== "undefined" &&
            (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.userAgent.includes("Mac") &&
                navigator.maxTouchPoints > 1)));
        logDebug("device_check", `apple=${isAppleMobile ? "yes" : "no"}`);

        const resumeTimeoutMs = 4000;
        let resumeTimeout: ReturnType<typeof setTimeout> | null = null;
        try {
          await Promise.race([
            resumeAudioContext(),
            new Promise<never>((_resolve, reject) => {
              resumeTimeout = setTimeout(
                () => reject(new Error("audio_context_timeout")),
                resumeTimeoutMs,
              );
            }),
          ]);
          logDebug("audio_context_ready");
        } catch (error) {
          logDebug(
            "audio_context_error",
            error instanceof Error ? error.message : String(error),
          );
        } finally {
          if (resumeTimeout) clearTimeout(resumeTimeout);
        }
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

        let audioConfig: SpeechSDK.AudioConfig;
        if (isAppleMobile) {
          logDebug("getusermedia_request");
          try {
            if (!mediaStreamRef.current) {
              const gumTimeoutMs = 6000;
              let gumTimeout: ReturnType<typeof setTimeout> | null = null;
              mediaStreamRef.current = await Promise.race([
                navigator.mediaDevices.getUserMedia({ audio: true }),
                new Promise<never>((_resolve, reject) => {
                  gumTimeout = setTimeout(
                    () => reject(new Error("getusermedia_timeout")),
                    gumTimeoutMs,
                  );
                }),
              ]).finally(() => {
                if (gumTimeout) clearTimeout(gumTimeout);
              });
            }
            audioConfig = SpeechSDK.AudioConfig.fromStreamInput(
              mediaStreamRef.current,
            );
            logDebug("getusermedia_ok");
          } catch (error) {
            logDebug(
              "getusermedia_err",
              error instanceof Error ? error.message : String(error),
            );
            throw error;
          }
        } else {
          audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
        }
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

        const startTimeoutMs = 6000;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        await Promise.race([
          startRecognition(recognizer),
          new Promise<never>((_resolve, reject) => {
            timeoutId = setTimeout(() => {
              reject(new Error("start_timeout"));
            }, startTimeoutMs);
          }),
        ]).finally(() => {
          if (timeoutId) clearTimeout(timeoutId);
        });
        setListening(true);
        recognizerRef.current = recognizer;
        activeLangRef.current = lang;
        recognizerRunningRef.current = true;
        logDebug("started", `lang=${lang}`);
      } catch (error) {
        console.error("STT Start Error:", error);
        logDebug(
          "start_error_full",
          error instanceof Error ? error.message : "start failed",
        );
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

    if (dispose && mediaStreamRef.current) {
      for (const track of mediaStreamRef.current.getTracks()) {
        track.stop();
      }
      mediaStreamRef.current = null;
      logDebug("media_stream_closed");
    }
  }, [clearPartialTimer]);

  useEffect(() => {
    return () => stopListening(true);
  }, [stopListening]);

  useEffect(() => {
    logDebug(
      "state",
      `listening=${listeningRef.current} running=${recognizerRunningRef.current} stopped=${isStoppedRef.current}`,
    );
  }, [listening, logDebug]);

  return {
    listening,
    startListening,
    stopListening,
    interimTranscript,
    warmupAudio: resumeAudioContext,
    debugLog,
    clearDebug: () => setDebugLog([]),
    isAppleMobile: isAppleMobileRef.current,
    mediaStreamActive: Boolean(mediaStreamRef.current),
  };
};
