import { useCallback, useEffect, useRef, useState } from "react";
import {
  appendAssistantMessageAction,
  chatAction,
  closeSessionAction,
  createSessionAction,
  sendStreamScriptAction,
  submitAnswerAction,
  submitIceAction,
} from "@/app/actions/agent.actions";
import { normalizeDidChatText } from "@/lib/text/did-chat";

type ConnectionStatus = "idle" | "connecting" | "connected" | "error";

export const useAgent = (
  agentId: string,
  videoRef: React.RefObject<HTMLVideoElement | null>,
) => {
  const [status, setStatus] = useState<ConnectionStatus>("idle");
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const idsRef = useRef<{
    streamId: string;
    sessionId: string;
    chatId: string;
  } | null>(null);
  const iceDisconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const currentVideoIdRef = useRef<string | null>(null);
  const lastAssistantRef = useRef<string | null>(null);

  const decodeChatAnswer = useCallback((raw: string) => {
    if (!raw.startsWith("chat/answer")) return null;
    const decoded = normalizeDidChatText(raw);
    return decoded || null;
  }, []);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (iceDisconnectTimerRef.current) {
      clearTimeout(iceDisconnectTimerRef.current);
      iceDisconnectTimerRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    idsRef.current = null;
    currentVideoIdRef.current = null;
    setIsAgentSpeaking(false);
    setStatus("idle");
  }, [videoRef]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const connect = useCallback(
    async (metadata?: { language?: string }) => {
      if (status === "connecting" || status === "connected") return;
      setStatus("connecting");

      try {
        const res = await createSessionAction(agentId, metadata);
        if (!res.success) {
          console.error("Session creation failed:", res);
          setStatus("error");
          return;
        }

        // @ts-expect-error D-ID stream payload shape is validated at runtime.
        const { streamId, sessionId, chatId, offer, ice_servers } = res.data;
        idsRef.current = { streamId, sessionId, chatId };

        const pc = new RTCPeerConnection({
          iceServers: ice_servers || [{ urls: "stun:stun.l.google.com:19302" }],
          iceTransportPolicy: "all",
        });
        pcRef.current = pc;

        const dc = pc.createDataChannel("JanusDataChannel");
        dcRef.current = dc;

        dc.onmessage = (event) => {
          const msg = event.data;
          console.log("dc.onmessage", msg);

          if (typeof msg === "string") {
            const answer = decodeChatAnswer(msg);
            if (answer && idsRef.current) {
              if (lastAssistantRef.current !== answer) {
                lastAssistantRef.current = answer;
                appendAssistantMessageAction(agentId, {
                  streamId: idsRef.current.streamId,
                  sessionId: idsRef.current.sessionId,
                  chatId: idsRef.current.chatId,
                  message: answer,
                });
              }
            }
          }

          if (typeof msg === "string" && msg.includes("stream/started")) {
            console.log("⚡ D-ID Event: START Talking");
            setIsAgentSpeaking(true);

            const match = msg.match(/{.*}/);
            if (match) {
              try {
                const parsed = JSON.parse(match[0]);
                currentVideoIdRef.current = parsed.metadata?.videoId;
              } catch (e) {
                console.error("Parse videoId error", e);
              }
            }
          } else if (typeof msg === "string" && msg.includes("stream/done")) {
            console.log("⚡ D-ID Event: STOP Talking");
            setIsAgentSpeaking(false);
            currentVideoIdRef.current = null;
          }
        };

        pc.ontrack = (event) => {
          if (event.streams?.[0] && videoRef.current) {
            if (videoRef.current.srcObject !== event.streams[0]) {
              videoRef.current.srcObject = event.streams[0];
              videoRef.current.muted = false;
              videoRef.current
                .play()
                .catch((e) => console.warn("Video play error:", e));
            }
          }
        };

        pc.onicecandidate = (event) => {
          if (event.candidate && idsRef.current) {
            const candidatePlain = {
              candidate: event.candidate.candidate,
              sdpMid: event.candidate.sdpMid,
              sdpMLineIndex: event.candidate.sdpMLineIndex,
            };

            submitIceAction(agentId, {
              streamId: idsRef.current.streamId,
              sessionId: idsRef.current.sessionId,
              // @ts-expect-error Candidate shape is validated before transport.
              candidate: candidatePlain,
            });
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("ICE State:", pc.iceConnectionState);
          if (
            pc.iceConnectionState === "connected" ||
            pc.iceConnectionState === "completed"
          ) {
            if (iceDisconnectTimerRef.current) {
              clearTimeout(iceDisconnectTimerRef.current);
              iceDisconnectTimerRef.current = null;
            }
            setStatus("connected");
          }
          if (pc.iceConnectionState === "disconnected") {
            if (!iceDisconnectTimerRef.current) {
              iceDisconnectTimerRef.current = setTimeout(() => {
                console.warn("ICE disconnected timeout");
                setStatus("error");
                cleanup();
              }, 8000);
            }
          }
          if (pc.iceConnectionState === "failed") {
            setStatus("error");
            cleanup();
          }
        };

        pc.onconnectionstatechange = () => {
          console.log("Connection State:", pc.connectionState);
          if (pc.connectionState === "connected") {
            if (iceDisconnectTimerRef.current) {
              clearTimeout(iceDisconnectTimerRef.current);
              iceDisconnectTimerRef.current = null;
            }
            setStatus("connected");
          }
          if (pc.connectionState === "disconnected") {
            if (!iceDisconnectTimerRef.current) {
              iceDisconnectTimerRef.current = setTimeout(() => {
                console.warn("Connection disconnected timeout");
                setStatus("error");
                cleanup();
              }, 8000);
            }
          }
          if (pc.connectionState === "failed") {
            setStatus("error");
            cleanup();
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await submitAnswerAction(agentId, {
          streamId,
          sessionId,
          answer: { type: "answer", sdp: answer.sdp },
        });
      } catch (e) {
        console.error("Connection failed:", e);
        setStatus("error");
        cleanup();
      }
    },
    [status, cleanup, videoRef, agentId, decodeChatAnswer],
  );

  const speak = useCallback(
    async (text: string, language?: string) => {
      if (!idsRef.current) {
        return { success: false, error: "Not connected" };
      }

      return chatAction(agentId, {
        streamId: idsRef.current.streamId,
        sessionId: idsRef.current.sessionId,
        chatId: idsRef.current.chatId,
        text,
        language,
      });
    },
    [agentId],
  );

  const sendStreamScript = useCallback(
    async (text: string) => {
      if (!idsRef.current) {
        return { success: false, error: "Not connected" };
      }

      return sendStreamScriptAction(agentId, {
        streamId: idsRef.current.streamId,
        sessionId: idsRef.current.sessionId,
        text,
      });
    },
    [agentId],
  );

  const interrupt = useCallback(() => {
    if (
      dcRef.current &&
      dcRef.current.readyState === "open" &&
      currentVideoIdRef.current
    ) {
      const msg = JSON.stringify({
        type: "stream/interrupt",
        videoId: currentVideoIdRef.current,
        timestamp: Date.now(),
      });
      dcRef.current.send(msg);
      console.log("⚡ Sent Interrupt command");
    }
    setIsAgentSpeaking(false);
  }, []);

  const disconnect = useCallback(async () => {
    const ids = idsRef.current;
    if (ids) {
      await closeSessionAction(agentId, {
        streamId: ids.streamId,
        chatId: ids.chatId,
      });
    }
    cleanup();
  }, [agentId, cleanup]);

  const getIds = useCallback(
    () => (idsRef.current ? { ...idsRef.current } : null),
    [],
  );

  return {
    connect,
    disconnect,
    speak,
    sendStreamScript,
    interrupt,
    status,
    isAgentSpeaking,
    getIds,
  };
};
