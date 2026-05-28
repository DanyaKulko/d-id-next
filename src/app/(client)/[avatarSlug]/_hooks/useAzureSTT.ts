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

export const useAzureSTT = (onFinalTranscript: (text: string) => void) => {
  const [listening, setListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [muted, setMuted] = useState(false);

  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const mutedRef = useRef(false);
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

  useEffect(() => {
    listeningRef.current = listening;
  }, [listening]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  // Mute = the avatar stops "hearing" the user. The recognizer keeps running
  // but recognition results are dropped while muted. Defaults to unmuted.
  const toggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      if (next) {
        if (partialTimerRef.current) {
          clearTimeout(partialTimerRef.current);
          partialTimerRef.current = null;
        }
        partialBufferRef.current = "";
        setInterimTranscript("");
      }
      return next;
    });
  }, []);

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
            resolve();
          },
          (error) => {
            reject(error);
          },
        );
      });
    },
    [],
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
        return;
      }
      if (listeningRef.current) {
        return;
      }
      startGuardRef.current = true;
      isStoppedRef.current = false;
      try {
        const { token, region } = await getOrFetchToken();

        if (isStoppedRef.current) return;

        const isAppleMobile =
          isAppleMobileRef.current ||
          (typeof navigator !== "undefined" &&
            (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
              (navigator.userAgent.includes("Mac") &&
                navigator.maxTouchPoints > 1)));

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
        } catch (_error) {
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
          isAppleMobile ? "6000" : "4000",
        );
        speechConfig.setProperty(
          SpeechSDK.PropertyId.SpeechServiceConnection_InitialSilenceTimeoutMs,
          isAppleMobile ? "30000" : "15000",
        );

        let audioConfig: SpeechSDK.AudioConfig;
        if (isAppleMobile) {
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
          } catch (error) {
            throw error;
          }
        } else {
          audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
        }
        const recognizer = new SpeechSDK.SpeechRecognizer(
          speechConfig,
          audioConfig,
        );

        recognizer.recognizing = (_s, e) => {
          if (!listeningRef.current || isStoppedRef.current || mutedRef.current)
            return;
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
        };

        recognizer.recognized = (_s, e) => {
          if (!listeningRef.current || isStoppedRef.current || mutedRef.current)
            return;

          if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            const text = e.result.text;
            if (text && text.trim().length > 0) {
              onFinalTranscript(text);
            }
            clearPartialTimer();
            partialBufferRef.current = "";
            setInterimTranscript("");
          } else if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
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
      } catch (error) {
        console.error("STT Start Error:", error);
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
      return;
    }

    isStoppedRef.current = true;
    startGuardRef.current = false;
    setListening(false);
    setInterimTranscript("");
    clearPartialTimer();
    partialBufferRef.current = "";

    if (recognizerRef.current) {
      const r = recognizerRef.current;
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
    muted,
    toggleMute,
    warmupAudio: resumeAudioContext,
    isAppleMobile: isAppleMobileRef.current,
    mediaStreamActive: Boolean(mediaStreamRef.current),
  };
};
