'use client';

import React, {useCallback, useEffect, useRef, useState} from "react";
import {useAzureSTT} from "@/app/(client)/[avatarSlug]/_hooks/useAzureSTT";
import {useAgent} from "@/app/(client)/[avatarSlug]/_hooks/useAgent";
import {useIdleTimer} from "@/app/(client)/[avatarSlug]/_hooks/useIdleTimer";
import {AvatarStage} from "@/app/(client)/[avatarSlug]/_components/AvatarStage/AvatarStage";
import watermark from '@/assets/img/neil_avatar_watermark.png';
import Image from "next/image";

interface IAvatarPageClientProps {
    agent: any;
}

const languages = [
    {code: 'en-US', label: '🇺🇸 English'},
    {code: 'es-ES', label: '🇪🇸 Spanish'},
    {code: 'fr-FR', label: '🇫🇷 French'},
    {code: 'de-DE', label: '🇩🇪 German'},
    {code: 'ru-RU', label: '🇷🇺 Russian'},
    {code: 'zh-CN', label: '🇨🇳 Chinese'},
    {code: 'ja-JP', label: '🇯🇵 Japanese'},
];

export const AvatarPageClient = ({agent}: IAvatarPageClientProps) => {
    const videoRef = useRef<HTMLVideoElement>(null);
    const hasGreetedRef = useRef(false);

    const [isVideoPlaying, setIsVideoPlaying] = useState(false);
    const [showError, setShowError] = useState(false);
    const [agentStatus, setAgentStatus] = useState<'idle' | 'preparing' | 'listening' | 'thinking' | 'speaking' | 'timed_out'>('idle');
    const [language, setLanguage] = useState(languages[0].code);
    console.log('agentStatus',agentStatus)
    const {
        connect,
        disconnect,
        speak,
        interrupt,
        status: connectionStatus,
        isAgentSpeaking
    } = useAgent(agent.id, videoRef);

    const handleIdleTimeout = useCallback(() => {
        disconnect();
        setAgentStatus('timed_out');
    }, [disconnect]);

    const {resetTimer} = useIdleTimer({
        isActive: agentStatus === 'listening',
        onTimeout: handleIdleTimeout
    });

    const handleUserSpeech = useCallback((text: string) => {
        setAgentStatus('thinking');
        resetTimer();
        speak(text);
    }, [speak, resetTimer]);

    const {listening, startListening, stopListening, interimTranscript} = useAzureSTT(handleUserSpeech);

    const handleRestart = async () => {
        setShowError(false);
        setAgentStatus('idle');
        setIsVideoPlaying(false);
        hasGreetedRef.current = false;
        try {
            await connect();
        } catch (e) {
            console.error(e);
            setShowError(true);
        }
    };

    const handleInterrupt = useCallback(() => {
        interrupt();
        resetTimer();
        setAgentStatus('listening');
    }, [interrupt, resetTimer]);

    useEffect(() => {
        if (agentStatus === 'timed_out') return;
        if (connectionStatus === 'error') {
            setShowError(true);
            return;
        }
        if (connectionStatus !== 'connected') {
            if (listening) stopListening();
            if (connectionStatus === 'idle' && !showError) {
                setAgentStatus('idle');
                setIsVideoPlaying(false);
            }
            return;
        }

        if (!hasGreetedRef.current) {
            return;
        }

        if (isAgentSpeaking) {
            setAgentStatus('speaking');
        } else {
            if (agentStatus === 'speaking' || agentStatus === 'thinking' || agentStatus === 'idle') {
                setAgentStatus('listening');
            }
        }
    }, [isAgentSpeaking, connectionStatus, listening, stopListening, showError, agentStatus]);

    useEffect(() => {
        const shouldListen = agentStatus === 'listening' && connectionStatus === 'connected' && !showError;

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
    }, [agentStatus, listening, startListening, stopListening, language, showError, connectionStatus]);


    useEffect(() => {
        if (connectionStatus === 'connected' && !hasGreetedRef.current) {
            hasGreetedRef.current = true;
            // setTimeout(() => {
            setAgentStatus('thinking');
                speak('Hello');
            // }, 500);
        }
    }, [connectionStatus, speak]);


    const getStatusText = () => {
        switch (agentStatus) {
            case 'preparing': return 'Connecting...';

            case 'thinking':
                return 'Thinking...';
            case 'speaking':
                return 'Speaking...';
            case 'listening':
                return 'Listening...';
            case 'timed_out':
                return 'Sleeping';
            default:
                return 'Ready';
        }
    };

    return (
        <div className="na-main-layout">
            <div className="na-avatar-section">
                <div className="na-avatar-container">

                    <div className="na-status-badge">
                        <span className={`na-status-indicator ${agentStatus}`}></span>
                        <span>{getStatusText()}</span>
                    </div>

                    <AvatarStage
                        videoRef={videoRef}
                        idleVideoUrl={agent.presenter.idle_video}
                        agentName="Tourism Neil"
                        agentDescription="Expert travel guide sharing experiences from adventures around the world"
                        isStreamReady={isVideoPlaying}
                        onStreamReady={() => setIsVideoPlaying(true)}
                        connectionStatus={connectionStatus}
                        agentStatus={agentStatus}
                        showError={showError}
                        isTimedOut={agentStatus === 'timed_out'}
                        onRestart={handleRestart}
                    />

                    {listening && interimTranscript && (
                        <div className="na-transcript-overlay" style={{
                            position: 'absolute',
                            bottom: '20%',
                            left: '50%',
                            transform: 'translateX(-50%)',
                            background: 'rgba(0,0,0,0.7)',
                            padding: '8px 16px',
                            borderRadius: '20px',
                            color: '#fff',
                            fontSize: '1.1rem',
                            zIndex: 50,
                            pointerEvents: 'none',
                            width: '80%',
                            textAlign: 'center'
                        }}>
                            {interimTranscript}
                        </div>
                    )}

                    <div className="na-watermark">
                        <Image src={watermark} alt={'watermark'}></Image>
                    </div>
                </div>

                <div className="na-controls">
                    <div className="na-control-group">
                        <select
                            className="na-language-select"
                            value={language}
                            onChange={(e) => {
                                setLanguage(e.target.value);
                            }}
                        >
                            {languages.map(lang => (
                                <option key={lang.code} value={lang.code}>{lang.label}</option>
                            ))}
                        </select>
                        <span className="na-control-hint">Language for communicating with the avatar</span>
                    </div>

                    <div className="na-control-group">
                        <select className="na-language-select">
                            <option value="default">🎨 Default Background</option>
                            <option value="forest">🌲 Forest</option>
                            <option value="studio">🎬 Studio</option>
                            <option value="home">🏠 Home</option>
                            <option value="office">🏢 Office</option>
                            <option value="beach">🏖️ Beach</option>
                        </select>
                        <span className="na-control-hint">Avatar background overlay</span>
                    </div>

                    {connectionStatus !== 'connected' ? (
                        <div className="na-control-group">
                            <button type={'button'} className="na-btn na-btn--primary" id="startBtn"
                                    onClick={handleRestart}>
                                🎤 Start Conversation
                            </button>
                            <span className="na-control-hint">Click to start a conversation with the avatar</span>
                        </div>
                    ) : (
                        <div className="na-control-group">
                            <button type={'button'} className="na-btn na-btn--primary" id="startBtn"
                                    onClick={disconnect}>
                                Stop
                            </button>
                            <span className="na-control-hint">Click to stop a conversation with the avatar</span>
                        </div>
                    )}

                    <div className="na-control-group">
                        <button type={'button'} className="na-btn na-btn--interrupt" id="interruptBtn"
                                onClick={handleInterrupt}
                                disabled={agentStatus !== 'speaking'}>
                            ⏸️ Interrupt Neil Avatar
                        </button>
                        <span className="na-control-hint">Click if you want to interrupt the avatar</span>
                    </div>
                </div>
            </div>
        </div>
    );
};
