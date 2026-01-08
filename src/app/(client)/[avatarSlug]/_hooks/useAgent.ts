import { useCallback, useEffect, useRef, useState } from "react";
import {
  chatAction,
  createSessionAction,
  submitAnswerAction,
  submitIceAction,
} from "@/app/actions/agent.actions";

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
  const currentVideoIdRef = useRef<string | null>(null);

  const cleanup = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (dcRef.current) {
      dcRef.current.close();
      dcRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsAgentSpeaking(false);
    setStatus("idle");
  }, [videoRef]);

  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  const connect = useCallback(async () => {
    if (status === "connecting" || status === "connected") return;
    setStatus("connecting");

    try {
      const res = await createSessionAction(agentId);
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

        if (msg.includes("stream/started")) {
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
        } else if (msg.includes("stream/done")) {
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
        if (pc.iceConnectionState === "connected") setStatus("connected");
        if (
          pc.iceConnectionState === "failed" ||
          pc.iceConnectionState === "disconnected"
        ) {
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
  }, [status, cleanup, videoRef, agentId]);

  const speak = useCallback(
    (text: string) => {
      if (status !== "connected" || !idsRef.current) return;

      chatAction(agentId, {
        streamId: idsRef.current.streamId,
        sessionId: idsRef.current.sessionId,
        chatId: idsRef.current.chatId,
        text,
      });
    },
    [status, agentId],
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

  return {
    connect,
    disconnect: cleanup,
    speak,
    interrupt,
    status,
    isAgentSpeaking,
  };
};
