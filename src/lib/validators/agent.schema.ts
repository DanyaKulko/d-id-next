import { z } from "zod";

export const submitAnswerSchema = z.object({
  sessionId: z.string().min(1),
  streamId: z.string().min(1),
  answer: z.any(), // SDP object
});

export const submitIceSchema = z.object({
  sessionId: z.string().min(1),
  streamId: z.string().min(1),
  candidate: z.object({
    candidate: z.string(),
    sdpMid: z.string().optional(),
    sdpMLineIndex: z.number().optional(),
  }),
});

export const chatSchema = z.object({
  sessionId: z.string().min(1),
  streamId: z.string().min(1),
  chatId: z.string().min(1),
  text: z.string().min(1),
});

export const closeSessionSchema = z.object({
  streamId: z.string().min(1),
  chatId: z.string().optional(),
});
