import axios, { type AxiosInstance } from "axios";
import type {
  CreateStreamRequestBody,
  CreateStreamResponseBody,
} from "@/types/agent.types";

type IceCandidatePayload = {
  candidate: string;
  sdpMid?: string | null;
  sdpMLineIndex?: number | null;
};

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
  async listVoices() {
    const { data } = await client.get(`/tts/voices`);
    return Array.isArray(data) ? data : [];
  },

  async getAgent(agentId: string) {
    const { data } = await client.get(`/agents/${agentId}`);
    return data;
  },

  async updateAgent(agentId: string, payload: Record<string, unknown>) {
    const { data } = await client.patch(`/agents/${agentId}`, payload);
    return data;
  },

  async deleteAgent(agentId: string) {
    await client.delete(`/agents/${agentId}`);
    return { status: "deleted" };
  },

  async checkStatus() {
    const { data } = await client.get(`/agents`, { params: { limit: 1 } });
    return data;
  },

  async getCredits() {
    const { data } = await client.get(`/credits`);
    return data;
  },

  async listKnowledgeDocuments(knowledgeBaseId: string) {
    const { data } = await client.get(
      `/knowledge/${knowledgeBaseId}/documents`,
    );
    return Array.isArray(data?.documents) ? data.documents : data;
  },

  async createKnowledgeDocument(
    knowledgeBaseId: string,
    payload: {
      documentType: "pdf" | "text" | "powerpoint";
      source_url: string;
      title: string;
      webhook?: string;
    },
  ) {
    const { data } = await client.post(
      `/knowledge/${knowledgeBaseId}/documents`,
      payload,
    );
    return data;
  },

  async deleteKnowledgeDocument(knowledgeBaseId: string, documentId: string) {
    const resolvedId = documentId.includes("#")
      ? (documentId.split("#").pop() ?? documentId)
      : documentId;
    await client.delete(
      `/knowledge/${knowledgeBaseId}/documents/${resolvedId}`,
    );
    return { status: "deleted" };
  },

  async createSession(agentId: string) {
    const streamReq = await client.post<CreateStreamResponseBody>(
      `/agents/${agentId}/streams`,
      {
        fluent: true,
        compatibility_mode: "on",
        stream_warmup: true,
      } satisfies CreateStreamRequestBody,
    );

    const {
      id: streamId,
      offer,
      ice_servers,
      session_id: sessionId,
    } = streamReq.data;

    const chatReq = await client.post(`/agents/${agentId}/chat`);
    const { id: chatId } = chatReq.data;

    console.log(
      `Created Stream: ${streamId}, Session: ${sessionId}, Chat: ${chatId}`,
    );

    return { streamId, sessionId, chatId, offer, ice_servers };
  },

  async submitAnswer(
    agentId: string,
    streamId: string,
    sessionId: string,
    answer: Record<string, unknown>,
  ) {
    await client.post(`/agents/${agentId}/streams/${streamId}/sdp`, {
      answer,
      session_id: sessionId,
    });
    return { status: "success" };
  },

  async submitIce(
    agentId: string,
    streamId: string,
    sessionId: string,
    candidate: IceCandidatePayload,
  ) {
    await client.post(`/agents/${agentId}/streams/${streamId}/ice`, {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex,
      session_id: sessionId,
    });
    return { status: "received" };
  },

  async chat(
    agentId: string,
    chatId: string,
    streamId: string,
    sessionId: string,
    messages: {
      role: "system" | "user" | "assistant";
      content: string;
      created_at: string;
    }[],
  ) {
    const { data } = await client.post(`/agents/${agentId}/chat/${chatId}`, {
      streamId,
      sessionId,
      messages,
    });
    return data;
  },

  async sendStreamScript(
    agentId: string,
    streamId: string,
    sessionId: string | undefined,
    text: string,
  ) {
    const payload: Record<string, unknown> = {
      script: {
        type: "text",
        // provider: { type: "elevenlabs" },
        input: text,
      },
    };
    if (sessionId) {
      payload.session_id = sessionId;
    }

    const { data } = await client.post(
      `/agents/${agentId}/streams/${streamId}`,
      payload,
    );
    return data;
  },

  async closeSession(_agentId: string, _streamId: string) {
    // await client.delete(`/agents/${agentId}/streams/${streamId}`);
    return { status: "closed" };
  },
};
