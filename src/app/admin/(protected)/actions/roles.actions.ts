"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import {
  fetchAgentSettingsFromDb,
  findAgentByKey,
} from "@/lib/agents/agents.db";
import { prisma } from "@/lib/db/prisma";
import { didService } from "@/lib/services/did.service";
import type { AgentKey } from "../roles.types";
import {
  extractAvatarImageUrl,
  extractIdleVideoUrl,
  extractLlmModel,
  extractLlmTemplate,
  extractVoiceId,
  extractVoiceLanguage,
  getOptionalString,
  getString,
  normalizePersonalityStyle,
  requireAdmin,
  resolveString,
  safetyRulesKey,
  stripSafetyRulesFromPrompt,
  updateDidAgentFromRole,
  withDidLogging,
} from "./shared";

const slugify = (value: string) =>
  value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

const resolveUniqueSlug = async (value: string) => {
  const base = slugify(value);
  if (!base) return null;

  const existing = await prisma.agent.findMany({
    where: { slug: { startsWith: base } },
    select: { slug: true },
  });

  const existingSet = new Set(
    existing.map((item) => (item.slug ?? "").toLowerCase()),
  );

  if (!existingSet.has(base)) {
    return base;
  }

  let counter = 2;
  let candidate = `${base}-${counter}`;
  while (existingSet.has(candidate)) {
    counter += 1;
    candidate = `${base}-${counter}`;
  }
  return candidate;
};

const allowedLlmModels = new Set([
  "gpt-4o-global",
  "gpt-4o-mini",
  "gpt-4.1",
  "gpt-4.1-mini",
  "gpt-4.1-nano",
]);

const allowedLlmTemplates = new Set([
  "rag-grounded",
  "rag-ungrounded",
  "assistant",
]);

const normalizeVoiceLanguage = (value?: string) => {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const key = trimmed.toLowerCase();
  if (key === "multilingual" || key === "multilang" || key === "multi") {
    return "Multilingual";
  }
  return trimmed;
};

export async function addAgentFromDidAction(formData: FormData) {
  await requireAdmin();
  const displayName = getString(formData.get("displayName")).trim();
  const description = getString(formData.get("description")).trim();
  const agentId = getString(formData.get("agentId")).trim();

  if (!displayName || !agentId) {
    throw new Error("Display name and agent ID are required");
  }

  const existing = await prisma.agent.findFirst({ where: { agentId } });
  if (existing) {
    throw new Error("Agent with this ID already exists");
  }

  const didAgentRaw = await withDidLogging("Get Agent", () =>
    didService.getAgent(agentId),
  );

  if (!didAgentRaw || typeof didAgentRaw !== "object") {
    throw new Error("D-ID agent not found");
  }

  const didAgent = didAgentRaw as Record<string, unknown>;
  const llm =
    didAgent.llm && typeof didAgent.llm === "object"
      ? (didAgent.llm as Record<string, unknown>)
      : {};
  const promptCustomization =
    llm.prompt_customization && typeof llm.prompt_customization === "object"
      ? (llm.prompt_customization as Record<string, unknown>)
      : {};

  const previewName = resolveString(
    didAgent.preview_name ?? didAgent.previewName ?? didAgent.name,
  ).trim();
  const didDescription = resolveString(didAgent.description).trim();
  const role = resolveString(promptCustomization.role).trim();
  const personalityRaw = resolveString(promptCustomization.personality).trim();
  const personality = personalityRaw
    ? normalizePersonalityStyle(personalityRaw)
    : "";
  const instructionsRaw = resolveString(
    llm.instructions ?? llm.system_prompt ?? llm.systemPrompt,
  ).trim();
  const instructions = stripSafetyRulesFromPrompt(instructionsRaw);

  const voiceId = extractVoiceId(didAgent);
  const voiceLanguage = extractVoiceLanguage(didAgent);
  const idleVideoUrl = extractIdleVideoUrl(didAgent);
  const avatarImageUrl = extractAvatarImageUrl(didAgent);
  const llmModel = extractLlmModel(didAgent);
  const llmTemplate = extractLlmTemplate(didAgent);

  const slug =
    (await resolveUniqueSlug(displayName)) ??
    (await resolveUniqueSlug(previewName || agentId)) ??
    null;

  const maxOrder = await prisma.agent.aggregate({
    _max: { sortOrder: true },
  });
  const nextSortOrder = (maxOrder._max.sortOrder ?? 0) + 1;

  const created = await prisma.agent.create({
    data: {
      agentId,
      slug,
      displayName,
      description: description || didDescription,
      name: previewName || displayName,
      roleDescription: role || null,
      instructions: instructions || null,
      personality: personality || null,
      voiceID: voiceId || "",
      voiceLanguage: voiceLanguage || null,
      llmModel: llmModel || null,
      llmTemplate: llmTemplate || null,
      backgroundEnabled: false,
      idleVideoUrl: idleVideoUrl || null,
      avatarImageUrl: avatarImageUrl || null,
      sortOrder: nextSortOrder,
    },
  });

  const safetySetting = await prisma.appSetting.findUnique({
    where: { key: safetyRulesKey },
  });
  const safetyRules = safetySetting?.value ?? "";

  await updateDidAgentFromRole(created.agentId, {
    name: created.name,
    description: created.description ?? "",
    role: created.roleDescription ?? "",
    systemPrompt: created.instructions ?? "",
    safetyRules,
    personalityStyle: created.personality ?? "",
    voiceId: created.voiceID || undefined,
  });

  const agentKey = created.slug ?? created.agentId ?? created.id;
  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${agentKey}`);
  revalidatePath(`/${agentKey}`);
  revalidateTag("agents", { expire: 0 });
  revalidateTag(`agent:${agentKey}`, { expire: 0 });

  return { ok: true, agentKey };
}

export async function syncAgentFromDidAction(agentKey: AgentKey) {
  await requireAdmin();
  const agent = await findAgentByKey(agentKey);
  if (!agent?.agentId) {
    throw new Error("Agent is missing a D-ID id");
  }

  const didAgentRaw = await withDidLogging("Get Agent", () =>
    didService.getAgent(agent.agentId),
  );
  if (!didAgentRaw || typeof didAgentRaw !== "object") {
    throw new Error("D-ID agent not found");
  }

  const didAgent = didAgentRaw as Record<string, unknown>;
  const llm =
    didAgent.llm && typeof didAgent.llm === "object"
      ? (didAgent.llm as Record<string, unknown>)
      : {};
  const promptCustomization =
    llm.prompt_customization && typeof llm.prompt_customization === "object"
      ? (llm.prompt_customization as Record<string, unknown>)
      : {};

  const updateData: {
    name?: string;
    description?: string;
    roleDescription?: string;
    instructions?: string;
    personality?: string;
    voiceID?: string;
    voiceLanguage?: string;
    llmModel?: string;
    llmTemplate?: string;
    idleVideoUrl?: string;
    avatarImageUrl?: string;
  } = {};

  const previewName = resolveString(
    didAgent.preview_name ?? didAgent.previewName ?? didAgent.name,
  ).trim();
  if (previewName) updateData.name = previewName;

  const description = resolveString(didAgent.description).trim();
  if (description) updateData.description = description;

  const role = resolveString(promptCustomization.role).trim();
  if (role) updateData.roleDescription = role;

  const personalityRaw = resolveString(promptCustomization.personality).trim();
  if (personalityRaw) {
    updateData.personality = normalizePersonalityStyle(personalityRaw);
  }

  const instructionsRaw = resolveString(
    llm.instructions ?? llm.system_prompt ?? llm.systemPrompt,
  ).trim();
  const instructions = stripSafetyRulesFromPrompt(instructionsRaw);
  if (instructions) updateData.instructions = instructions;

  const voiceId = extractVoiceId(didAgent);
  if (voiceId) updateData.voiceID = voiceId;

  const voiceLanguage = extractVoiceLanguage(didAgent);
  if (voiceLanguage) updateData.voiceLanguage = voiceLanguage;

  const llmModel = extractLlmModel(didAgent);
  if (llmModel) updateData.llmModel = llmModel;

  const llmTemplate = extractLlmTemplate(didAgent);
  if (llmTemplate) updateData.llmTemplate = llmTemplate;

  const idleVideoUrl = extractIdleVideoUrl(didAgent);
  if (idleVideoUrl) updateData.idleVideoUrl = idleVideoUrl;

  const avatarImageUrl = extractAvatarImageUrl(didAgent);
  if (avatarImageUrl) updateData.avatarImageUrl = avatarImageUrl;

  if (Object.keys(updateData).length > 0) {
    await prisma.agent.update({
      where: { id: agent.id },
      data: updateData,
    });
  }

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${agentKey}`);
  revalidatePath(`/${agentKey}`);
  revalidateTag("agents", { expire: 0 });
  revalidateTag(`agent:${agentKey}`, { expire: 0 });

  const settings = await fetchAgentSettingsFromDb(agentKey);
  return { ok: true, settings };
}

export async function saveRoleSettingsAction(formData: FormData) {
  await requireAdmin();
  const agentKeyRaw = formData.get("agentKey") ?? formData.get("roleId");
  const agentKey = typeof agentKeyRaw === "string" ? agentKeyRaw : null;
  if (!agentKey) throw new Error("Invalid agent key");

  const displayName = getString(formData.get("displayName")).trim();
  const description = getString(formData.get("description")).trim();
  const agentName = getString(formData.get("agentName")).trim();
  const persona = getString(formData.get("persona")).trim();
  const systemPrompt = stripSafetyRulesFromPrompt(
    getString(formData.get("systemPrompt")).trim(),
  );
  const personalityStyle = normalizePersonalityStyle(
    getString(formData.get("personalityStyle")),
  );
  const voiceIdInput = getOptionalString(formData.get("voiceId"));
  const llmModelRaw = getOptionalString(formData.get("llmModel"));
  const llmTemplateRaw = getOptionalString(formData.get("llmTemplate"));
  const voiceLanguageRaw = getOptionalString(formData.get("voiceLanguage"));
  const mobileOffsetRaw = getOptionalString(formData.get("mobileVideoOffsetPx"));
  const mobileVideoOffsetPx = Number.isFinite(Number(mobileOffsetRaw))
    ? Math.trunc(Number(mobileOffsetRaw))
    : 0;

  if (!displayName || !agentName) {
    throw new Error("Missing required fields");
  }

  const agent = await findAgentByKey(agentKey);
  if (!agent) {
    throw new Error("Agent not found in database");
  }

  const backgroundsEnabled = formData.get("backgroundsEnabled") === "on";
  const backgroundKeyColorRaw = getOptionalString(
    formData.get("backgroundKeyColor"),
  );
  const backgroundKeyColor = backgroundKeyColorRaw
    ? backgroundKeyColorRaw.trim().toUpperCase()
    : "";
  const normalizedBackgroundKeyColor =
    backgroundKeyColor === "GREEN"
      ? "GREEN"
      : backgroundKeyColor === "WHITE"
        ? "WHITE"
        : null;

  const voiceId = voiceIdInput?.trim()
    ? voiceIdInput.trim()
    : (agent.voiceID ?? "");
  const llmModel = llmModelRaw?.trim()
    ? allowedLlmModels.has(llmModelRaw.trim())
      ? llmModelRaw.trim()
      : undefined
    : undefined;
  const llmTemplate = llmTemplateRaw?.trim()
    ? allowedLlmTemplates.has(llmTemplateRaw.trim())
      ? llmTemplateRaw.trim()
      : undefined
    : undefined;
  const voiceLanguage = normalizeVoiceLanguage(voiceLanguageRaw ?? undefined);
  const safetySetting = await prisma.appSetting.findUnique({
    where: { key: safetyRulesKey },
  });
  const safetyRules = safetySetting?.value ?? "";

  if (voiceId && voiceLanguage) {
    const voices = await withDidLogging("List Voices", () =>
      didService.listVoices(),
    );
    const matchedVoice = voices.find((voice) => {
      if (!voice || typeof voice !== "object") return false;
      return (
        String((voice as Record<string, unknown>).id ?? "").trim() === voiceId
      );
    }) as Record<string, unknown> | undefined;

    if (matchedVoice) {
      const languages = Array.isArray(matchedVoice.languages)
        ? (matchedVoice.languages as Record<string, unknown>[])
        : [];

      if (languages.length > 0) {
        const supportedNames = languages
          .map((entry) =>
            typeof entry.language === "string" ? entry.language.trim() : "",
          )
          .filter((value) => value.length > 0);
        const supportedLocales = languages
          .map((entry) =>
            typeof entry.locale === "string" ? entry.locale.trim() : "",
          )
          .filter((value) => value.length > 0);

        const normalizedVoiceLanguage = voiceLanguage.toLowerCase();
        if (normalizedVoiceLanguage === "multilingual") {
          if (new Set(supportedLocales.map((value) => value.toLowerCase())).size <= 1) {
            const supportedLabel = supportedNames.join(", ") || supportedLocales.join(", ");
            throw new Error(
              `Selected voice does not support multilingual mode. Supported languages: ${supportedLabel}`,
            );
          }
        } else {
          const supportsLanguage =
            supportedNames.some(
              (value) => value.toLowerCase() === normalizedVoiceLanguage,
            ) ||
            supportedLocales.some(
              (value) => value.toLowerCase() === normalizedVoiceLanguage,
            );

          if (!supportsLanguage) {
            const supportedLabel = supportedNames.join(", ") || supportedLocales.join(", ");
            throw new Error(
              `Selected voice does not support "${voiceLanguage}". Supported languages: ${supportedLabel}`,
            );
          }
        }
      }
    }
  }

  await prisma.agent.update({
    where: { id: agent.id },
    data: {
      displayName,
      description,
      name: agentName,
      roleDescription: persona,
      instructions: systemPrompt,
      personality: personalityStyle,
      voiceID: voiceId,
      voiceLanguage: voiceLanguage ?? null,
      llmModel: llmModel ?? null,
      llmTemplate: llmTemplate ?? null,
      mobileVideoOffsetPx,
      backgroundEnabled: backgroundsEnabled,
      backgroundKeyColor: normalizedBackgroundKeyColor,
    },
  });

  if (agent.agentId) {
    await updateDidAgentFromRole(agent.agentId, {
      name: agentName,
      description,
      role: persona, // Persona/Role Description maps to D-ID agent role.
      systemPrompt,
      safetyRules,
      personalityStyle,
      voiceId,
      voiceLanguage,
      llmModel,
      llmTemplate,
    });
  } else {
  }

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${agentKey}`);
  revalidatePath(`/${agentKey}`);
  revalidatePath("/");
  revalidateTag("agents", {expire: 0});
  revalidateTag(`agent:${agentKey}`, {expire: 0});
  return { ok: true };
}

export async function updateAgentOrderAction(order: AgentKey[]) {
  await requireAdmin();
  if (!Array.isArray(order) || order.length === 0) {
    return { ok: false };
  }

  const agents = await prisma.agent.findMany({
    select: { id: true, slug: true, agentId: true },
  });

  const keyToId = new Map(
    agents.map((agent) => [agent.slug ?? agent.agentId ?? agent.id, agent.id]),
  );

  const updates = order.flatMap((key, index) => {
    const id = keyToId.get(key);
    if (!id) return [];
    return [
      prisma.agent.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ];
  });

  if (updates.length === 0) {
    return { ok: false };
  }

  await prisma.$transaction(updates);

  revalidatePath("/admin/roles");
  revalidatePath("/");
  revalidateTag("agents", { expire: 0 });
  return { ok: true };
}

export async function deleteRoleAction(agentKey: AgentKey) {
  await requireAdmin();
  const agent = await findAgentByKey(agentKey);
  if (!agent) throw new Error("Agent not found");

  if (agent.agentId) {
    await withDidLogging("Delete Agent", () =>
      didService.deleteAgent(agent.agentId),
    );
  } else {
  }
  await prisma.agentBackground.deleteMany({ where: { agentId: agent.id } });
  await prisma.agent.delete({ where: { id: agent.id } });

  revalidatePath("/admin/roles");
  revalidatePath("/");
  revalidateTag("agents", {expire: 0});

  return { ok: true };
}
