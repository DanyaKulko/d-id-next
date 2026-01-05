"use server";

import { didService } from "@/lib/services/did.service";
import {
    chatSchema,
    closeSessionSchema,
    submitAnswerSchema,
    submitIceSchema
} from "@/lib/validators/agent.schema";
import { z } from "zod";

function handleError(error: any) {
    const msg = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    console.error("Action Error:", msg);
    return { success: false, error: msg };
}

export async function getAgentAction(agentId: string) {
    try {
        const data = await didService.getAgent(agentId);
        return { success: true, data };
    } catch (error) {
        return handleError(error);
    }
}

export async function createSessionAction(agentId: string) {
    try {
        const data = await didService.createSession(agentId);
        return { success: true, data };
    } catch (error) {
        return handleError(error);
    }
}

export async function submitAnswerAction(agentId: string, payload: z.infer<typeof submitAnswerSchema>) {
    const result = submitAnswerSchema.safeParse(payload);
    if (!result.success) return { success: false, error: "Validation failed" };

    try {
        const { streamId, sessionId, answer } = result.data;
        const data = await didService.submitAnswer(agentId, streamId, sessionId, answer);
        return { success: true, data };
    } catch (error) {
        return handleError(error);
    }
}

export async function submitIceAction(agentId: string, payload: z.infer<typeof submitIceSchema>) {
    // Валидация
    const result = submitIceSchema.safeParse(payload);
    if (!result.success) return { success: false, error: "Validation failed" };

    try {
        const { streamId, sessionId, candidate } = result.data;
        const data = await didService.submitIce(agentId, streamId, sessionId, candidate);
        return { success: true, data };
    } catch (error) {
        // ICE кандидаты часто фейлятся, это нормально для WebRTC, можно просто логировать
        console.warn("ICE Warning:", error);
        return { success: false, error: "ICE failed but continued" };
    }
}

export async function chatAction(agentId: string, payload: z.infer<typeof chatSchema>) {
    const result = chatSchema.safeParse(payload);
    if (!result.success) return { success: false, error: "Validation failed" };

    try {
        const { chatId, streamId, sessionId, text } = result.data;
        const data = await didService.chat(agentId, chatId, streamId, sessionId, text);
        return { success: true, data };
    } catch (error) {
        return handleError(error);
    }
}

export async function closeSessionAction(agentId: string, payload: z.infer<typeof closeSessionSchema>) {
    const result = closeSessionSchema.safeParse(payload);
    if (!result.success) return { success: false, error: "Validation failed" };

    try {
        await didService.closeSession(agentId, result.data.streamId);
        return { success: true, status: "closed" };
    } catch (error) {
        return handleError(error);
    }
}
