import { requireRole } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/require";
import {
  isAxiosError,
  logExternalServiceError,
  resolveExternalErrorDetails,
} from "@/lib/logging/external-errors";
import { didService } from "@/lib/services/did.service";

export const getString = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value : "";

export const getOptionalString = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value : undefined;

export const authRequiredKey = "requireAuthentication";
export const defaultPersonalityStyle = "Friendly and Professional";
export const defaultSafetyRules = `Do not discuss:
- Political topics in aggressive form
- Personal information of third parties
- Financial advice as actionable recommendations

Always:
- Maintain a respectful tone
- Avoid categorical judgments
- Reference sources for factual claims`;

const personalityAliases: Record<string, string> = {
  friendly: defaultPersonalityStyle,
  fun: "Fun and Engaging",
  warm: "Warm and Supportive",
  direct: "Direct and Concise",
  sophisticated: "Sophisticated and Formal",
  confident: "Confident and Persuasive",
};

export const normalizePersonalityStyle = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return defaultPersonalityStyle;
  return personalityAliases[trimmed] ?? trimmed;
};

export async function requireAdmin() {
  const user = await requireUser();
  requireRole(user.roles, "ADMIN");
  return user;
}

export const formatSafetyRules = (rules: string) => {
  const trimmed = rules.trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/^safety rules\s*:?\s*/i, "").trim();
  if (!normalized) return "";
  return `Safety rules:\n${normalized}`;
};

export const splitSafetyRulesFromPrompt = (prompt: string) => {
  const trimmed = prompt.trim();
  if (!trimmed) return { prompt: "", safetyRules: "" };
  const match = trimmed.match(/(?:^|\n)\s*safety rules\s*:?\s*(?:\n|$)/i);
  if (!match || typeof match.index !== "number") {
    return { prompt: trimmed, safetyRules: "" };
  }
  const start = match.index;
  const promptPart = trimmed.slice(0, start).trim();
  const safetyPart = trimmed.slice(start + match[0].length).trim();
  return {
    prompt: promptPart,
    safetyRules: safetyPart,
  };
};

export const stripSafetyRulesFromPrompt = (prompt: string) =>
  splitSafetyRulesFromPrompt(prompt).prompt;

export const buildDidInstructions = (
  systemPrompt: string,
  safetyRules: string,
) => {
  const prompt = stripSafetyRulesFromPrompt(systemPrompt);
  const safety = formatSafetyRules(safetyRules);
  if (!prompt && !safety) return "";
  if (prompt && safety) {
    return `${prompt}\n\n${safety}`;
  }
  return prompt || safety;
};

export const resolveString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

export const extractVoiceId = (agent: Record<string, unknown>) => {
  const presenter = agent.presenter;
  if (presenter && typeof presenter === "object") {
    const presenterVoice = (presenter as Record<string, unknown>).voice;
    if (presenterVoice && typeof presenterVoice === "object") {
      return resolveString(
        (presenterVoice as Record<string, unknown>).voice_id,
        "",
      );
    }
  }
  const voice = agent.voice;
  if (voice && typeof voice === "object") {
    return resolveString(
      (voice as Record<string, unknown>).voice_id ??
        (voice as Record<string, unknown>).id,
      "",
    );
  }
  return resolveString(
    agent.voice_id ?? agent.voiceId ?? agent.preview_voice_id,
    "",
  );
};

export const extractVoiceLanguage = (agent: Record<string, unknown>) => {
  const presenter = agent.presenter;
  if (presenter && typeof presenter === "object") {
    const presenterVoice = (presenter as Record<string, unknown>).voice;
    if (presenterVoice && typeof presenterVoice === "object") {
      return resolveString(
        (presenterVoice as Record<string, unknown>).language,
        "",
      );
    }
  }
  const voice = agent.voice;
  if (voice && typeof voice === "object") {
    return resolveString((voice as Record<string, unknown>).language, "");
  }
  return resolveString(agent.language, "");
};

export const extractLlmModel = (agent: Record<string, unknown>) => {
  const llm = agent.llm;
  if (llm && typeof llm === "object") {
    return resolveString((llm as Record<string, unknown>).model, "");
  }
  return "";
};

export const extractLlmTemplate = (agent: Record<string, unknown>) => {
  const llm = agent.llm;
  if (llm && typeof llm === "object") {
    return resolveString((llm as Record<string, unknown>).template, "");
  }
  return "";
};

export const extractKnowledgeBaseId = (agent: Record<string, unknown>) => {
  const knowledge = agent.knowledge;
  if (knowledge && typeof knowledge === "object") {
    return resolveString((knowledge as Record<string, unknown>).id, "");
  }
  return resolveString(agent.knowledge_id ?? agent.knowledgeId, "");
};

export const extractIdleVideoUrl = (agent: Record<string, unknown>) => {
  const presenter = agent.presenter;
  if (!presenter || typeof presenter !== "object") return "";
  return resolveString(
    (presenter as Record<string, unknown>).idle_video ??
      (presenter as Record<string, unknown>).idle_video_url,
    "",
  );
};

export const extractAvatarImageUrl = (agent: Record<string, unknown>) => {
  const presenter = agent.presenter;
  if (!presenter || typeof presenter !== "object") return "";
  return resolveString(
    (presenter as Record<string, unknown>).source_url ??
      (presenter as Record<string, unknown>).thumbnail ??
      (presenter as Record<string, unknown>).image_url ??
      (presenter as Record<string, unknown>).imageUrl ??
      (presenter as Record<string, unknown>).thumbnail_url ??
      (presenter as Record<string, unknown>).thumbnailUrl ??
      (presenter as Record<string, unknown>).preview_image ??
      (presenter as Record<string, unknown>).previewImage,
    "",
  );
};

const logDidError = async (error: unknown, context: string) => {
  if (!isAxiosError(error)) return;
  const details = resolveExternalErrorDetails(error);
  await logExternalServiceError({
    source: "D-ID",
    type: context,
    message: details.message,
    metadata: details.metadata,
  });
};

export const withDidLogging = async <T>(
  context: string,
  operation: () => Promise<T>,
) => {
  try {
    return await operation();
  } catch (error) {
    await logDidError(error, context);
    throw error;
  }
};

export async function updateDidAgentFromRole(
  agentId: string,
  input: {
    name: string;
    description: string;
    role: string;
    systemPrompt: string;
    safetyRules: string;
    personalityStyle: string;
    voiceId?: string;
    voiceLanguage?: string;
    clearVoiceLanguage?: boolean;
    maxResponseLength?: number;
    llmModel?: string;
    llmTemplate?: string;
    knowledgeBaseId?: string;
  },
) {
  const existing = await withDidLogging("Get Agent", () =>
    didService.getAgent(agentId),
  ).catch(() => null);
  const existingAgent =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : null;
  if (!existingAgent) return;

  const payload: Record<string, unknown> = {};
  const llmPayload =
    existingAgent.llm && typeof existingAgent.llm === "object"
      ? ({ ...existingAgent.llm } as Record<string, unknown>)
      : {};
  const presenterPayload =
    existingAgent.presenter && typeof existingAgent.presenter === "object"
      ? ({ ...existingAgent.presenter } as Record<string, unknown>)
      : {};
  const promptCustomization =
    llmPayload.prompt_customization &&
    typeof llmPayload.prompt_customization === "object"
      ? ({ ...llmPayload.prompt_customization } as Record<string, unknown>)
      : {};

  if ("preview_name" in existingAgent) {
    payload.preview_name = input.name || existingAgent.preview_name;
  } else if (input.name) {
    payload.preview_name = input.name;
  }
  payload.description = input.description ?? existingAgent.description ?? "";

  const instructions = buildDidInstructions(
    input.systemPrompt,
    input.safetyRules,
  );
  if (instructions) {
    if ("instructions" in llmPayload) {
      llmPayload.instructions = instructions;
    } else if ("system_prompt" in llmPayload) {
      llmPayload.system_prompt = instructions;
    } else {
      llmPayload.instructions = instructions;
    }
  }

  const trimmedRole = input.role.trim();
  const normalizedRole = /^\d+$/.test(trimmedRole) ? "" : trimmedRole;
  if (normalizedRole) {
    promptCustomization.role = normalizedRole;
  } else if ("role" in promptCustomization) {
    delete promptCustomization.role;
  }

  if (input.personalityStyle) {
    promptCustomization.personality = input.personalityStyle;
  }

  if (
    typeof input.maxResponseLength === "number" &&
    Number.isFinite(input.maxResponseLength)
  ) {
    promptCustomization.max_response_length = Math.trunc(
      input.maxResponseLength,
    );
  }

  if (Object.keys(promptCustomization).length > 0) {
    llmPayload.prompt_customization = promptCustomization;
  } else if ("prompt_customization" in llmPayload) {
    delete llmPayload.prompt_customization;
  }

  if (input.llmModel) {
    llmPayload.model = input.llmModel;
  }

  if (input.llmTemplate) {
    llmPayload.template = input.llmTemplate;
  }

  if (Object.keys(llmPayload).length > 0) {
    payload.llm = llmPayload;
  }

  if (input.voiceId || input.voiceLanguage || input.clearVoiceLanguage) {
    const existingVoice =
      presenterPayload.voice && typeof presenterPayload.voice === "object"
        ? ({ ...presenterPayload.voice } as Record<string, unknown>)
        : {};
    if (input.voiceId) {
      existingVoice.voice_id = input.voiceId;
    }
    if (input.voiceLanguage) {
      existingVoice.language = input.voiceLanguage;
    } else if (input.clearVoiceLanguage && "language" in existingVoice) {
      delete existingVoice.language;
    }
    presenterPayload.voice = existingVoice;
  }

  if (Object.keys(presenterPayload).length > 0) {
    payload.presenter = presenterPayload;
  }

  const fullPayload: Record<string, unknown> = {};
  const allowedFields = [
    "embed",
    "triggers",
    "llm",
    "preview_thumbnail",
    "presenter",
    "preview_name",
    "description",
    "access",
    "starter_message",
    "greetings",
    "use_case",
    "knowledge",
  ];

  for (const field of allowedFields) {
    if (field in payload) {
      fullPayload[field] = payload[field];
      continue;
    }
    if (field in existingAgent) {
      fullPayload[field] = existingAgent[field];
    }
  }
  const existingKnowledgeBaseId = extractKnowledgeBaseId(existingAgent);
  const resolvedKnowledgeBaseId =
    input.knowledgeBaseId?.trim() || existingKnowledgeBaseId;
  if (resolvedKnowledgeBaseId) {
    fullPayload.knowledge = { id: resolvedKnowledgeBaseId };
  }

  if (Object.keys(fullPayload).length === 0) return;
  await withDidLogging("Update Agent", () =>
    didService.updateAgent(agentId, fullPayload),
  );
}
