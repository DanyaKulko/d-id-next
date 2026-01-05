import axios, { AxiosInstance } from "axios";
import { CreateStreamResponseBody, CreateStreamRequestBody } from "@/types/agent.types";

const createDidClient = (): AxiosInstance => {
    const baseURL = process.env.DID_API_URL || "https://api.d-id.com";
    const apiKey = process.env.DID_API_KEY;

    if (!apiKey) throw new Error("DID_API_KEY is missing");

    return axios.create({
        baseURL,
        headers: {
            Authorization: `Basic ${apiKey}`,
            "Content-Type": "application/json",
        },
    });
};

const client = createDidClient();

export const didService = {
    async getAgent(agentId: string) {
        const { data } = await client.get(`/agents/${agentId}`);
        return data;
    },

    async createSession(agentId: string) {
        const streamReq = await client.post<CreateStreamResponseBody>(
            `/agents/${agentId}/streams`,
            {
                fluent: true,
                compatibility_mode: "on",
                stream_warmup: true,
            } satisfies CreateStreamRequestBody
        );

        const { id: streamId, offer, ice_servers, session_id: sessionId } = streamReq.data;

        const chatReq = await client.post(`/agents/${agentId}/chat`);
        const { id: chatId } = chatReq.data;

        console.log(`Created Stream: ${streamId}, Session: ${sessionId}, Chat: ${chatId}`);

        return { streamId, sessionId, chatId, offer, ice_servers };
    },

    async submitAnswer(agentId: string, streamId: string, sessionId: string, answer: any) {
        await client.post(`/agents/${agentId}/streams/${streamId}/sdp`, {
            answer,
            session_id: sessionId,
        });
        return { status: "success" };
    },

    async submitIce(agentId: string, streamId: string, sessionId: string, candidate: any) {
        await client.post(`/agents/${agentId}/streams/${streamId}/ice`, {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex,
            session_id: sessionId,
        });
        return { status: "received" };
    },

    async chat(agentId: string, chatId: string, streamId: string, sessionId: string, text: string) {
        const { data } = await client.post(`/agents/${agentId}/chat/${chatId}`, {
            streamId,
            sessionId,
            messages: [
                {
                    role: "user",
                    content: text,
                    created_at: new Date().toISOString(),
                },
            ],
        });
        return data;
    },

    async closeSession(agentId: string, streamId: string) {
        await client.delete(`/agents/${agentId}/streams/${streamId}`);
        return { status: "closed" };
    }
};
