import { prisma } from "@/lib/db/prisma";

export type ExternalLogLevel = "INFO" | "WARNING" | "ERROR";

export type ExternalErrorDetails = {
  message: string;
  metadata?: Record<string, unknown>;
};

type ExternalErrorInput = {
  source: string;
  type: string;
  message: string;
  level?: ExternalLogLevel;
  metadata?: Record<string, unknown>;
};

type AxiosErrorLike = {
  isAxiosError: boolean;
  message?: string;
  response?: {
    status?: number;
    data?: unknown;
  };
  config?: {
    url?: string;
    method?: string;
    baseURL?: string;
  };
};

const MAX_MESSAGE_LENGTH = 1200;

export const isAxiosError = (error: unknown): error is AxiosErrorLike =>
  Boolean(
    error &&
      typeof error === "object" &&
      "isAxiosError" in error &&
      (error as AxiosErrorLike).isAxiosError,
  );

const truncateMessage = (message: string) =>
  message.length > MAX_MESSAGE_LENGTH
    ? `${message.slice(0, MAX_MESSAGE_LENGTH - 3)}...`
    : message;

const safeJson = (value: unknown) => {
  if (value === undefined) return undefined;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return { value: String(value) };
  }
};

const stringifyError = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  try {
    return JSON.stringify(error);
  } catch {
    return "Unknown error";
  }
};

export const resolveExternalErrorDetails = (
  error: unknown,
): ExternalErrorDetails => {
  if (isAxiosError(error)) {
    const url = error.config?.baseURL
      ? `${error.config.baseURL}${error.config.url ?? ""}`
      : error.config?.url;

    const message =
      typeof error.response?.data === "string"
        ? error.response.data
        : (error.message ?? "External service error");

    return {
      message,
      metadata: safeJson({
        status: error.response?.status,
        data: error.response?.data,
        url,
        method: error.config?.method,
      }),
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message,
      metadata: safeJson({ name: error.name, stack: error.stack }),
    };
  }

  return { message: stringifyError(error) };
};

export async function logExternalServiceError(input: ExternalErrorInput) {
  try {
    await prisma.externalServiceLog.create({
      data: {
        source: input.source,
        type: input.type,
        message: truncateMessage(input.message),
        level: input.level ?? "ERROR",
        metadata: safeJson(input.metadata),
      },
    });
  } catch (error) {
    console.warn("Failed to store external service log", error);
  }
}
