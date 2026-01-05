import React, {useState} from 'react';
import './AvatarStage.css';

interface AvatarStageProps {
    videoRef: React.RefObject<HTMLVideoElement | null>;
    idleVideoUrl?: string;
    isStreamReady: boolean;
    onStreamReady: () => void;
    connectionStatus: string;
    agentName: string;
    agentDescription: string;
    agentStatus: string;
    showError: boolean;
    isTimedOut: boolean;
    onRestart: () => void;
}

export const AvatarStage: React.FC<AvatarStageProps> = ({
                                                            videoRef,
                                                            idleVideoUrl,
                                                            isStreamReady,
                                                            onStreamReady,
                                                            connectionStatus,
                                                            agentName,
                                                            agentDescription,
                                                            agentStatus,
                                                            showError,
                                                            isTimedOut,
                                                            onRestart
                                                        }) => {
    const [isIdleLoaded, setIsIdleLoaded] = useState(false);

    let viewMode: 'ERROR' | 'LOADING' | 'STREAM' | 'IDLE';

    if (showError || isTimedOut) {
        viewMode = 'ERROR';
    } else if (connectionStatus === 'connecting' || (connectionStatus === 'connected' && !isStreamReady)) {
        viewMode = 'LOADING';
    } else if (connectionStatus === 'connected' && isStreamReady) {
        viewMode = 'STREAM';
    } else {
        viewMode = 'IDLE';
    }

    const showWebRTC = viewMode === 'STREAM';

    const showIdleVideo = viewMode !== 'STREAM';

    const showLoader = viewMode === 'LOADING';

    const showHeader = viewMode === 'IDLE';

    const showErrorLayer = viewMode === 'ERROR';

    return (
        <div className="na-stage-wrapper" style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>

            {idleVideoUrl && (
                <video
                    src={idleVideoUrl}
                    className="na-avatar-video na-layer-idle"
                    autoPlay loop muted playsInline
                    onLoadedData={() => setIsIdleLoaded(true)}
                    style={{
                        opacity: showIdleVideo ? 1 : 0,
                        position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover',
                        transition: 'opacity 0.5s ease',
                        zIndex: 10,
                        // Если сверху лоадер — немного размываем видео для акцента
                        filter: showLoader ? 'blur(5px) brightness(0.7)' : 'none'
                    }}
                />
            )}

            <video
                ref={videoRef}
                className={`na-avatar-video na-layer-stream ${isTimedOut ? 'blur-effect' : ''}`}
                autoPlay playsInline
                onPlaying={onStreamReady}
                style={{
                    opacity: showWebRTC ? 1 : 0,
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover',
                    transition: 'opacity 0.5s ease',
                    zIndex: 15
                }}
            />

            <div style={{
                opacity: showHeader ? 1 : 0,
                transition: 'opacity 0.3s ease',
                zIndex: 18,
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', pointerEvents: 'none'
            }}>
                <div className="na-avatar-overlay"></div>
                <div className="na-role-header-overlay" id="roleHeaderOverlay">
                    <h1 className="na-role-title">{agentName}</h1>
                    <p className="na-role-desc">{agentDescription}</p>
                </div>
            </div>

            <div className="na-video-placeholder" style={{
                opacity: showLoader ? 1 : 0,
                visibility: showLoader ? 'visible' : 'hidden',
                transition: 'opacity 0.3s ease',
                position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                zIndex: 20, pointerEvents: 'none',
                background: isIdleLoaded ? 'transparent' : '#000'
            }}>
                <div className="na-spinner"></div>
            </div>

            {showErrorLayer && (
                <div className="overlay-container" style={{
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    background: 'rgba(0,0,0,0.7)', zIndex: 30, display: 'flex', flexDirection: 'column',
                    alignItems: 'center', justifyContent: 'center', color: '#fff', textAlign: 'center'
                }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>
                        {showError ? '⚠️' : '💤'}
                    </div>
                    <h3 style={{ margin: 0, fontSize: '1.5rem', marginBottom: '0.5rem' }}>
                        {showError ? 'Connection Error' : 'Session Timed Out'}
                    </h3>

                    <button type={'button'} className="na-btn na-btn--primary" onClick={onRestart} style={{ marginTop: 20, height: 'auto', padding: '10px 24px', pointerEvents: 'auto', maxHeight: '60px' }}>
                        {showError ? 'Try Again' : 'Resume Conversation'}
                    </button>
                </div>
            )}
        </div>
    );
};
