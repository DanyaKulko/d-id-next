import { useRef, useCallback, useEffect } from 'react';

const IDLE_TIMEOUT_MS = 30000;

interface UseIdleTimerProps {
    isActive: boolean; // Таймер должен тикать только когда true (listening)
    onTimeout: () => void;
}

export const useIdleTimer = ({ isActive, onTimeout }: UseIdleTimerProps) => {
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    const startTimer = useCallback(() => {
        if (timerRef.current) clearTimeout(timerRef.current);
        console.log("⏳ Timer Started");
        timerRef.current = setTimeout(() => {
            console.warn("💤 Timeout Triggered");
            onTimeout();
        }, IDLE_TIMEOUT_MS);
    }, [onTimeout]);

    const stopTimer = useCallback(() => {
        if (timerRef.current) {
            console.log("⏸️ Timer Stopped");
            clearTimeout(timerRef.current);
            timerRef.current = null;
        }
    }, []);

    // Реакция на изменение активности (например, статус listening)
    useEffect(() => {
        if (isActive) {
            console.log("🟢 Timer Active");
            startTimer();
        } else {
            console.log("🔴 Timer Inactive");
            stopTimer();
        }
        return () => stopTimer();
    }, [isActive, startTimer, stopTimer]);

    // Метод для ручного сброса (когда юзер говорит)
    const resetTimer = useCallback(() => {
        if (isActive) {
            startTimer();
            console.log("🔄 Timer Reset")
        }
    }, [isActive, startTimer]);

    return { resetTimer };
};
