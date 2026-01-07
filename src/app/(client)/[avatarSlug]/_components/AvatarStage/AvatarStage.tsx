import React, {useState} from 'react';
import './AvatarStage.css';

import {useEffect, useMemo, useRef} from "react";

type KeyingParams = {
    // порог "насколько белое удаляем" (0..1). Чем выше, тем агрессивнее вырез.
    threshold?: number; // пример 0.20..0.35
    // мягкость перехода (0..1), чтобы не было рваных краёв
    softness?: number;  // пример 0.05..0.15
    // чуть затемнить/осветлить итог
    videoBrightness?: number; // 1.0 = без изменений
    videoContrast?: number;   // 1.0 = без изменений
};

export function useWhiteKeyWebGL(opts: {
    sourceVideoRef: React.RefObject<HTMLVideoElement | null>;
    backgroundUrl?: string;
    enabled: boolean;
    params?: KeyingParams;
}) {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const params = useMemo(() => {
        const p = opts.params ?? {};
        return {
            threshold: p.threshold ?? 0.28,
            softness: p.softness ?? 0.10,
            videoBrightness: p.videoBrightness ?? 1.0,
            videoContrast: p.videoContrast ?? 1.0,
        };
    }, [opts.params]);

    useEffect(() => {
        if (!opts.enabled) return;
        const video = opts.sourceVideoRef.current;
        const canvas = canvasRef.current;
        if (!video || !canvas) return;

        const gl = canvas.getContext("webgl", {premultipliedAlpha: false, alpha: true});
        if (!gl) return;

        // --- shaders ---
        const vsSrc = `
      attribute vec2 a_pos;
      varying vec2 v_uv;
      void main() {
        v_uv = (a_pos + 1.0) * 0.5;
        gl_Position = vec4(a_pos, 0.0, 1.0);
      }
    `;

        // Вырезаем "белое" по расстоянию до vec3(1).
        // alpha = 1 - smoothstep(threshold, threshold+softness, distToWhite)
        const fsSrc = `
      precision mediump float;
      varying vec2 v_uv;
      uniform sampler2D u_video;
      // uniform sampler2D u_bg;
      uniform float u_threshold;
      uniform float u_softness;
      uniform float u_brightness;
      uniform float u_contrast;

      vec3 applyBC(vec3 c) {
        // contrast around 0.5 then brightness
        c = (c - 0.5) * u_contrast + 0.5;
        c = c * u_brightness;
        return clamp(c, 0.0, 1.0);
      }

      void main() {
//         vec4 v = texture2D(u_video, v_uv);
//         vec4 b = texture2D(u_bg, v_uv);
//
//         vec3 vc = applyBC(v.rgb);
//
//         float distToWhite = distance(vc, vec3(1.0, 1.0, 1.0));
//
// float a = smoothstep(u_threshold, u_threshold + u_softness, distToWhite);
//
// a *= v.a;
//
// vec3 outRgb = mix(b.rgb, vc, a);
// gl_FragColor = vec4(outRgb, 1.0);

 vec4 v = texture2D(u_video, v_uv);
    vec3 vc = applyBC(v.rgb);

    float distToWhite = distance(vc, vec3(1.0, 1.0, 1.0));

    // alpha: 0 если белый, 1 если цветной
    float a = smoothstep(u_threshold, u_threshold + u_softness, distToWhite);
    
    // Учитываем исходную альфу видео, если есть
    a *= v.a;

    // Выводим пиксель видео, но управляем его прозрачностью
    // Важно: WebGL canvas должен быть инициализирован с premultipliedAlpha: false (у тебя уже так)
    gl_FragColor = vec4(vc, a); 

      }
    `;

        function compile(type: number, src: string) {
            const sh = gl.createShader(type)!;
            gl.shaderSource(sh, src);
            gl.compileShader(sh);
            if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
                throw new Error(gl.getShaderInfoLog(sh) || "shader compile failed");
            }
            return sh;
        }

        function link(vs: WebGLShader, fs: WebGLShader) {
            const pr = gl.createProgram()!;
            gl.attachShader(pr, vs);
            gl.attachShader(pr, fs);
            gl.linkProgram(pr);
            if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) {
                throw new Error(gl.getProgramInfoLog(pr) || "program link failed");
            }
            return pr;
        }

        let program: WebGLProgram;
        try {
            program = link(compile(gl.VERTEX_SHADER, vsSrc), compile(gl.FRAGMENT_SHADER, fsSrc));
        } catch {
            return;
        }

        gl.useProgram(program);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

        // fullscreen quad
        const posLoc = gl.getAttribLocation(program, "a_pos");
        const buf = gl.createBuffer()!;
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(
            gl.ARRAY_BUFFER,
            new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
            gl.STATIC_DRAW
        );
        gl.enableVertexAttribArray(posLoc);
        gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

        // textures
        function createTex(unit: number) {
            const tex = gl.createTexture()!;
            gl.activeTexture(unit);
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            return tex;
        }

        const videoTex = createTex(gl.TEXTURE0);
        const bgTex = createTex(gl.TEXTURE1);

        gl.uniform1i(gl.getUniformLocation(program, "u_video"), 0);
        // gl.uniform1i(gl.getUniformLocation(program, "u_bg"), 1);

        const uThreshold = gl.getUniformLocation(program, "u_threshold");
        const uSoftness = gl.getUniformLocation(program, "u_softness");
        const uBrightness = gl.getUniformLocation(program, "u_brightness");
        const uContrast = gl.getUniformLocation(program, "u_contrast");

        // background image loading
        const bgImg = new Image();
        bgImg.crossOrigin = "anonymous";
        let bgReady = false;

        const applyBg = () => {
            if (!bgReady) return;
            gl.activeTexture(gl.TEXTURE1);
            gl.bindTexture(gl.TEXTURE_2D, bgTex);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, bgImg);
        };

        // if (opts.backgroundUrl) {
        //     bgImg.onload = () => {
        //         bgReady = true;
        //         applyBg();
        //     };
        //     bgImg.src = opts.backgroundUrl;
        // } else {
        //     // если фона нет — заливаем черным
        //     bgReady = true;
        //     gl.activeTexture(gl.TEXTURE1);
        //     gl.bindTexture(gl.TEXTURE_2D, bgTex);
        //     const px = new Uint8Array([0, 0, 0, 255]);
        //     gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, px);
        // }

        let raf = 0;

        const resizeToVideo = () => {
            const w = video.videoWidth || canvas.clientWidth || 1280;
            const h = video.videoHeight || canvas.clientHeight || 720;
            if (canvas.width !== w || canvas.height !== h) {
                canvas.width = w;
                canvas.height = h;
                gl.viewport(0, 0, w, h);
            }
        };

        const draw = () => {
            resizeToVideo();

            // uniforms
            gl.uniform1f(uThreshold, params.threshold);
            gl.uniform1f(uSoftness, params.softness);
            gl.uniform1f(uBrightness, params.videoBrightness);
            gl.uniform1f(uContrast, params.videoContrast);

            // update video texture
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, videoTex);
            try {
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
            } catch {
                // video may not be ready on very first frames
            }

            gl.drawArrays(gl.TRIANGLES, 0, 6);
            raf = requestAnimationFrame(draw);
        };

        // Эффективнее чем rAF: если доступно
        let vfcId: number | null = null;
        const hasVFC = typeof (video as any).requestVideoFrameCallback === "function";

        if (hasVFC) {
            const loop = () => {
                draw();
                (video as any).requestVideoFrameCallback(loop);
            };
            (video as any).requestVideoFrameCallback(loop);
            vfcId = 1;
        } else {
            raf = requestAnimationFrame(draw);
        }

        return () => {
            if (raf) cancelAnimationFrame(raf);
            // vfc отменить нельзя стандартно, просто выходим по cleanup
            gl.getExtension("WEBGL_lose_context")?.loseContext();
            // освобождение canvas/program/textures здесь не критично, контекст потерян
        };
    }, [opts.enabled, opts.sourceVideoRef, opts.backgroundUrl, params.threshold, params.softness, params.videoBrightness, params.videoContrast]);

    return {canvasRef};
}


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


    const idleRef = useRef<HTMLVideoElement | null>(null);
    const {canvasRef} = useWhiteKeyWebGL({
        sourceVideoRef: videoRef,
        // backgroundUrl: 'https://static-cse.canva.com/blob/2286032/vk1776.6a43540d.avif',
        enabled: showWebRTC, // можно и true всегда, если нужно
        // enabled: true, // можно и true всегда, если нужно
        params: {threshold: 0.20, softness: 0.10, videoContrast: 1.05, videoBrightness: 1.0},
    });

    const currentBackgroundUrl = 'https://static-cse.canva.com/blob/2286032/vk1776.6a43540d.avif';

    return (
        <div className="na-stage-wrapper"
             style={{position: 'relative', width: '100%', height: '100%', overflow: 'hidden'}}>
            <div
                className="na-layer-background"
                style={{
                    opacity: showWebRTC ? 1 : 0, // Показываем только во время стрима
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
                    zIndex: 14, // Ниже чем Canvas (15)
                    backgroundImage: `url(${currentBackgroundUrl})`,
                    backgroundSize: 'cover', // Магия CSS: фон всегда заполняет экран красиво
                    backgroundPosition: 'center',
                    transition: 'opacity 0.5s ease'
                }}
            />
            {idleVideoUrl && (
                <>
                    <video
                        ref={idleRef}
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

                </>
            )}

            <video
                ref={videoRef}
                className={`na-avatar-video na-layer-stream ${isTimedOut ? 'blur-effect' : ''}`}
                autoPlay playsInline
                onPlaying={onStreamReady}
                style={{
                    opacity: 0,
                    // opacity: showWebRTC ? 1 : 0,
                    position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover',
                    transition: 'opacity 0.5s ease',
                    zIndex: 15
                }}
            />
            <canvas
                ref={canvasRef}
                style={{
                    opacity: showWebRTC ? 1 : 0,
                    position: "absolute", top: 0, left: 0, width: "100%", height: "100%",
                    transition: "opacity 0.5s ease",
                    objectFit: "contain",
                    zIndex: 15,
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
                    <div style={{fontSize: '3rem', marginBottom: '1rem'}}>
                        {showError ? '⚠️' : '💤'}
                    </div>
                    <h3 style={{margin: 0, fontSize: '1.5rem', marginBottom: '0.5rem'}}>
                        {showError ? 'Connection Error' : 'Session Timed Out'}
                    </h3>

                    <button type={'button'} className="na-btn na-btn--primary" onClick={onRestart} style={{
                        marginTop: 20,
                        height: 'auto',
                        padding: '10px 24px',
                        pointerEvents: 'auto',
                        maxHeight: '60px'
                    }}>
                        {showError ? 'Try Again' : 'Resume Conversation'}
                    </button>
                </div>
            )}
        </div>
    );
};
