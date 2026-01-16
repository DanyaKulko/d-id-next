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

  const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
  const tokenCacheRef = useRef<CachedToken | null>(null);
  const isStoppedRef = useRef(false);
  const listeningRef = useRef(false);
  const startGuardRef = useRef(false);

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

  const startListening = useCallback(
    async (lang: string) => {
      if (startGuardRef.current) return;
      if (recognizerRef.current) {
        if (listeningRef.current) return;
        try {
          recognizerRef.current.close();
        } catch (_error) {}
        recognizerRef.current = null;
      }
      startGuardRef.current = true;
      isStoppedRef.current = false;
      try {
        console.log("🎤 Starting Azure STT...");
        const { token, region } = await getOrFetchToken();

        if (isStoppedRef.current) return;

        await resumeAudioContext();

        const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(
          token,
          region,
        );
        speechConfig.speechRecognitionLanguage = lang;

        const isAppleMobile =
          typeof navigator !== "undefined" &&
          (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
            (navigator.userAgent.includes("Mac") &&
              navigator.maxTouchPoints > 1));

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

        recognizer.recognizing = (_s, e) => {
          if (!isStoppedRef.current && e.result.text) {
            setInterimTranscript(e.result.text);
          }
        };

        recognizer.recognized = (_s, e) => {
          if (isStoppedRef.current) return;

          if (e.result.reason === SpeechSDK.ResultReason.RecognizedSpeech) {
            const text = e.result.text;
            if (text && text.trim().length > 0) {
              console.log("✅ Final phrase:", text);
              onFinalTranscript(text);
              // Не останавливаем здесь! Пусть родитель решит остановить,
              // когда перейдет в статус 'thinking'.
            }
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
          recognizerRef.current = null;
        };

        recognizer.sessionStopped = () => {
          console.log("STT Session Stopped");
          if (!isStoppedRef.current) {
            setListening(false);
          }
          setInterimTranscript("");
          recognizerRef.current = null;
        };

        await recognizer.startContinuousRecognitionAsync();
        setListening(true);
        recognizerRef.current = recognizer;
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
    [onFinalTranscript, getOrFetchToken, logSttError, resumeAudioContext],
  );

  const stopListening = useCallback(() => {
    isStoppedRef.current = true;
    startGuardRef.current = false;
    setListening(false);
    setInterimTranscript("");

    if (recognizerRef.current) {
      const r = recognizerRef.current;
      recognizerRef.current = null;

      console.log("🛑 Stopping Azure STT...");
      r.stopContinuousRecognitionAsync(() => {
        try {
          r.close();
        } catch (_error) {}
      });
    }
  }, []);

  useEffect(() => {
    return () => stopListening();
  }, [stopListening]);

  return { listening, startListening, stopListening, interimTranscript };
};
