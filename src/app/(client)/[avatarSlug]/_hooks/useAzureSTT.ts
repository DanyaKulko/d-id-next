import { useState, useEffect, useRef, useCallback } from 'react';
import * as SpeechSDK from 'microsoft-cognitiveservices-speech-sdk';
import { getAzureSpeechToken } from "@/app/actions/azure.actions";

const TOKEN_EXPIRATION_MS = 9 * 60 * 1000;

interface CachedToken {
    value: string;
    region: string;
    expiresAt: number;
}

export const useAzureSTT = (onFinalTranscript: (text: string) => void) => {
    const [listening, setListening] = useState(false);
    const [interimTranscript, setInterimTranscript] = useState('');

    const recognizerRef = useRef<SpeechSDK.SpeechRecognizer | null>(null);
    const tokenCacheRef = useRef<CachedToken | null>(null);
    const isStoppedRef = useRef(false);

    const getOrFetchToken = async () => {
        const now = Date.now();
        if (tokenCacheRef.current && now < tokenCacheRef.current.expiresAt) {
            return { token: tokenCacheRef.current.value, region: tokenCacheRef.current.region };
        }
        const { token, region, error } = await getAzureSpeechToken();
        if (error || !token || !region) throw new Error("Failed to fetch token");

        tokenCacheRef.current = { value: token, region: region, expiresAt: now + TOKEN_EXPIRATION_MS };
        return { token, region };
    };

    const startListening = useCallback(async (lang: string) => {
        if (recognizerRef.current) return;
        isStoppedRef.current = false;
        try {
            console.log('🎤 Starting Azure STT...');
            const { token, region } = await getOrFetchToken();

            if (isStoppedRef.current) return;

            const speechConfig = SpeechSDK.SpeechConfig.fromAuthorizationToken(token, region);
            speechConfig.speechRecognitionLanguage = lang;

            speechConfig.setProperty(SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs, "1500");

            const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();
            const recognizer = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

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
                    setInterimTranscript('');
                }
            };

            recognizer.canceled = (_s, e) => {
                console.warn(`STT Canceled: ${e.reason}`);
                if (!isStoppedRef.current) setListening(false);
                recognizerRef.current = null;
            };

            recognizer.sessionStopped = () => {
                console.log("STT Session Stopped");
                if (!isStoppedRef.current) setListening(false);
                recognizerRef.current = null;
            };

            await recognizer.startContinuousRecognitionAsync();
            setListening(true);
            recognizerRef.current = recognizer;

        } catch (error) {
            console.error("STT Start Error:", error);
            setListening(false);
        }
    }, [onFinalTranscript]);

    const stopListening = useCallback(() => {
        isStoppedRef.current = true;
        setListening(false);
        setInterimTranscript('');

        if (recognizerRef.current) {
            const r = recognizerRef.current;
            recognizerRef.current = null;

            console.log('🛑 Stopping Azure STT...');
            r.stopContinuousRecognitionAsync(() => {
                try { r.close(); } catch(e) {}
            });
        }
    }, []);

    useEffect(() => {
        return () => stopListening();
    }, [stopListening]);

    return { listening, startListening, stopListening, interimTranscript };
};
