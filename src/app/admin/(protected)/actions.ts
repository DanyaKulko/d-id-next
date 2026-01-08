"use server";

import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { revalidatePath, revalidateTag } from "next/cache";
import {
  fetchAgentListFromDb,
  fetchAgentSettingsFromDb,
  findAgentByKey,
} from "@/lib/agents/agents.db";
import { hashPassword, verifyPassword } from "@/lib/auth/passwords";
import { requireRole } from "@/lib/auth/rbac";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { externalSourcesSeeds } from "@/lib/external-sources/config";
import { resolveBaseUrl } from "@/lib/http/base-url";
import { didService } from "@/lib/services/did.service";
import type { AgentKey } from "./roles.types";

function toObject(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

const getString = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value : "";

const getOptionalString = (value: FormDataEntryValue | null) =>
  typeof value === "string" ? value : undefined;

const safetyRulesKey = "safetyRules";
const manualTrainingKey = "manualTrainingText";
const manualTrainingDocKey = "manualTrainingDocId";
const manualTrainingFileKey = "manualTrainingFilePath";
const authRequiredKey = "requireAuthentication";
const manualTrainingSource = "Manual training";
const textBlogSource = "Text blog";
const videoTranscriptsSource = "Video transcripts";
const defaultPersonalityStyle = "Friendly and Professional";
const personalityAliases: Record<string, string> = {
  friendly: defaultPersonalityStyle,
  fun: "Fun and Engaging",
  warm: "Warm and Supportive",
  direct: "Direct and Concise",
  sophisticated: "Sophisticated and Formal",
  confident: "Confident and Persuasive",
};

const normalizePersonalityStyle = (value: string) => {
  const trimmed = value.trim();
  if (!trimmed) return defaultPersonalityStyle;
  return personalityAliases[trimmed] ?? trimmed;
};

async function requireAdmin() {
  const user = await requireUser();
  requireRole(user.roles, "ADMIN");
  return user;
}

const formatSafetyRules = (rules: string) => {
  const trimmed = rules.trim();
  if (!trimmed) return "";
  return `Safety rules:\n${trimmed}`;
};

const normalizeKnowledgeSource = (value: string) => {
  const key = value.trim().toLowerCase();
  if (key === manualTrainingSource.toLowerCase()) return manualTrainingSource;
  if (key === textBlogSource.toLowerCase()) return textBlogSource;
  if (key === videoTranscriptsSource.toLowerCase()) {
    return videoTranscriptsSource;
  }
  return value.trim();
};

const normalizeDidDocumentId = (value: string) =>
  value.includes("#") ? (value.split("#").pop() ?? value) : value;

const matchesDidDocumentId = (value: string, candidate: string) =>
  value === candidate ||
  normalizeDidDocumentId(value) === normalizeDidDocumentId(candidate);

const knowledgeUploadRoot = path.join(
  process.cwd(),
  "public",
  "uploads",
  "knowledge",
);

async function writeManualTrainingFile(text: string) {
  await mkdir(knowledgeUploadRoot, { recursive: true });
  const filename = `manual-training-${Date.now()}-${randomUUID()}.txt`;
  const filePath = path.join(knowledgeUploadRoot, filename);
  await writeFile(filePath, text, "utf8");
  return {
    filePath,
    publicPath: `/uploads/knowledge/${filename}`,
  };
}

const buildDidInstructions = (systemPrompt: string, safetyRules: string) => {
  const prompt = systemPrompt.trim();
  const safety = formatSafetyRules(safetyRules);
  if (!prompt && !safety) return "";
  if (prompt && safety) {
    return `${prompt}\n\n${safety}`;
  }
  return prompt || safety;
};

async function updateDidAgentFromRole(
  agentId: string,
  input: {
    name: string;
    description: string;
    role: string;
    systemPrompt: string;
    safetyRules: string;
    personalityStyle: string;
    voiceId?: string;
  },
) {
  const existing = await didService.getAgent(agentId).catch(() => null);
  const existingAgent =
    existing && typeof existing === "object"
      ? (existing as Record<string, unknown>)
      : null;
  const payload: Record<string, unknown> = {};
  const llmPayload =
    existingAgent?.llm && typeof existingAgent.llm === "object"
      ? ({ ...existingAgent.llm } as Record<string, unknown>)
      : {};
  const presenterPayload =
    existingAgent?.presenter && typeof existingAgent.presenter === "object"
      ? ({ ...existingAgent.presenter } as Record<string, unknown>)
      : {};
  const promptCustomization =
    llmPayload.prompt_customization &&
    typeof llmPayload.prompt_customization === "object"
      ? ({ ...llmPayload.prompt_customization } as Record<string, unknown>)
      : {};
  let llmDirty = false;
  let presenterDirty = false;

  if (input.name) {
    payload.preview_name = input.name;
  }
  payload.description = input.description ?? "";

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
    llmDirty = true;
  }

  if (input.role) {
    promptCustomization.role = input.role;
    llmDirty = true;
  }

  if (input.personalityStyle) {
    promptCustomization.personality = input.personalityStyle;
    llmDirty = true;
  }

  if (Object.keys(promptCustomization).length > 0) {
    llmPayload.prompt_customization = promptCustomization;
  }

  if (llmDirty && Object.keys(llmPayload).length > 0) {
    payload.llm = llmPayload;
  }

  if (input.voiceId) {
    const existingVoice =
      presenterPayload.voice && typeof presenterPayload.voice === "object"
        ? ({ ...presenterPayload.voice } as Record<string, unknown>)
        : {};
    existingVoice.voice_id = input.voiceId;
    presenterPayload.voice = existingVoice;
    presenterDirty = true;
  }

  if (presenterDirty && Object.keys(presenterPayload).length > 0) {
    payload.presenter = presenterPayload;
  }

  // TODO: confirm D-ID payload field names for instructions if llm shape differs.
  if (Object.keys(payload).length === 0) return;
  await didService.updateAgent(agentId, payload);
}

export async function fetchAgentListAction() {
  return fetchAgentListFromDb();
}

export async function fetchAgentSettingsAction(agentKey: AgentKey) {
  return fetchAgentSettingsFromDb(agentKey);
}

export async function saveMainSettingsAction(formData: FormData) {
  await requireAdmin();
  const payload = toObject(formData);
  console.log("[admin] saveMainSettings", payload);
  revalidatePath("/admin");
  return { ok: true };
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
  const systemPrompt = getString(formData.get("systemPrompt")).trim();
  const personalityStyle = normalizePersonalityStyle(
    getString(formData.get("personalityStyle")),
  );
  const voiceIdInput = getOptionalString(formData.get("voiceId"));

  if (!displayName || !agentName) {
    throw new Error("Missing required fields");
  }

  const agent = await findAgentByKey(agentKey);
  if (!agent) {
    // TODO: decide if we should auto-create missing agent records.
    throw new Error("Agent not found in database");
  }

  const backgroundsEnabled = formData.get("backgroundsEnabled") === "on";

  const voiceId = voiceIdInput?.trim()
    ? voiceIdInput.trim()
    : (agent.voiceID ?? "");
  const safetySetting = await prisma.appSetting.findUnique({
    where: { key: safetyRulesKey },
  });
  const safetyRules = safetySetting?.value ?? "";

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
      backgroundEnabled: backgroundsEnabled,
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
    });
  } else {
    // TODO: handle D-ID updates when agentId is missing.
  }

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${agentKey}`);
  revalidatePath(`/${agentKey}`);
  revalidatePath("/");
  revalidateTag("agents");
  revalidateTag(`agent:${agentKey}`);
  return { ok: true };
}

export async function deleteRoleAction(agentKey: AgentKey) {
  await requireAdmin();
  const agent = await findAgentByKey(agentKey);
  if (!agent) throw new Error("Agent not found");

  const deletionGuard = process.env.ALLOW_AGENT_DELETE !== "true";
  if (deletionGuard) {
    // TODO: remove this guard when deletion is approved.
    return { ok: false, skipped: true };
  }

  if (agent.agentId) {
    await didService.deleteAgent(agent.agentId);
  } else {
    // TODO: handle missing D-ID agent id for delete.
  }
  await prisma.agentBackground.deleteMany({ where: { agentId: agent.id } });
  await prisma.agent.delete({ where: { id: agent.id } });

  revalidatePath("/admin/roles");
  revalidatePath("/");
  revalidateTag("agents");

  return { ok: true };
}

export async function saveIntegrationConfigAction(formData: FormData) {
  await requireAdmin();
  const payload = toObject(formData);
  console.log("[admin] saveIntegrationConfig", payload);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/integrations");
  return { ok: true };
}

export async function checkDidConnectionAction() {
  await requireAdmin();
  await didService.checkStatus();
  return { ok: true };
}

export async function saveExternalSourcesConfigAction(formData: FormData) {
  await requireAdmin();
  const textAccessKey = getString(formData.get("textAccessKey")).trim();
  const videoAccessKey = getString(formData.get("videoAccessKey")).trim();

  const textSeed = externalSourcesSeeds.find((item) => item.kind === "TEXT");
  const videoSeed = externalSourcesSeeds.find((item) => item.kind === "VIDEO");

  await prisma.externalSource.upsert({
    where: { kind: "TEXT" },
    update: { accessKey: textAccessKey },
    create: {
      kind: "TEXT",
      label: textSeed?.label ?? "Text blog",
      link: textSeed?.link ?? "",
      cron: textSeed?.cron ?? "",
      accessKey: textAccessKey,
    },
  });

  await prisma.externalSource.upsert({
    where: { kind: "VIDEO" },
    update: { accessKey: videoAccessKey },
    create: {
      kind: "VIDEO",
      label: videoSeed?.label ?? "Video transcripts",
      link: videoSeed?.link ?? "",
      cron: videoSeed?.cron ?? "",
      accessKey: videoAccessKey,
    },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/external-sources");
  return { ok: true };
}

export async function saveSafetyInstructionsAction(formData: FormData) {
  await requireAdmin();
  const safetyRules = getString(formData.get("safetyRules")).trim();
  if (!safetyRules) {
    throw new Error("Safety rules cannot be empty");
  }

  await prisma.appSetting.upsert({
    where: { key: safetyRulesKey },
    update: { value: safetyRules },
    create: { key: safetyRulesKey, value: safetyRules },
  });
  revalidatePath("/admin/training");
  revalidatePath("/admin/training/safety");
  return { ok: true };
}

export async function saveManualTrainingAction(formData: FormData) {
  await requireAdmin();
  const manualText = getString(formData.get("manualLearning")).trim();
  if (!manualText) {
    throw new Error("Manual training text is required");
  }

  await prisma.appSetting.upsert({
    where: { key: manualTrainingKey },
    update: { value: manualText },
    create: { key: manualTrainingKey, value: manualText },
  });

  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  if (!knowledgeBaseId) {
    throw new Error("DID_KNOWLEDGE_BASE_ID is missing");
  }

  const baseUrl = await resolveBaseUrl();

  const existingDoc = await prisma.appSetting.findUnique({
    where: { key: manualTrainingDocKey },
  });
  if (existingDoc?.value) {
    await didService
      .deleteKnowledgeDocument(knowledgeBaseId, existingDoc.value)
      .catch(() => undefined);
  }

  const existingFile = await prisma.appSetting.findUnique({
    where: { key: manualTrainingFileKey },
  });
  if (existingFile?.value) {
    await unlink(existingFile.value).catch(() => undefined);
  }

  const { filePath, publicPath } = await writeManualTrainingFile(manualText);
  await prisma.appSetting.upsert({
    where: { key: manualTrainingFileKey },
    update: { value: filePath },
    create: { key: manualTrainingFileKey, value: filePath },
  });

  const webhookUrl = `${baseUrl}/api/webhooks/did/knowledge`;

  const created = await didService.createKnowledgeDocument(knowledgeBaseId, {
    documentType: "text",
    source_url: `${baseUrl}${publicPath}`,
    title: manualTrainingSource,
    webhook: webhookUrl,
  });

  const docId =
    (created as Record<string, unknown>)?.id ??
    (created as Record<string, unknown>)?.document_id ??
    (created as Record<string, unknown>)?.documentId;

  if (docId) {
    await prisma.appSetting.upsert({
      where: { key: manualTrainingDocKey },
      update: { value: String(docId) },
      create: { key: manualTrainingDocKey, value: String(docId) },
    });

    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: { equals: manualTrainingSource, mode: "insensitive" },
      },
    });
    await prisma.knowledgeDocuments.create({
      data: {
        source: manualTrainingSource,
        documentId: String(docId),
        documentUrl: `${baseUrl}${publicPath}`,
        status: "PROCESSING",
      },
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  revalidatePath("/admin/training/manual");
  return { ok: true };
}

export async function deleteKnowledgeDocumentAction(formData: FormData) {
  await requireAdmin();
  const documentId = getString(formData.get("documentId")).trim();
  const sourceLabel = getString(formData.get("sourceLabel")).trim();

  if (!documentId && !sourceLabel) {
    throw new Error("Document id or source label is required");
  }

  const knowledgeBaseId = process.env.DID_KNOWLEDGE_BASE_ID ?? "";
  const normalizedSource = sourceLabel
    ? normalizeKnowledgeSource(sourceLabel)
    : "";

  const [manualDoc, manualFile, externalSources] = await Promise.all([
    prisma.appSetting.findUnique({ where: { key: manualTrainingDocKey } }),
    prisma.appSetting.findUnique({ where: { key: manualTrainingFileKey } }),
    prisma.externalSource.findMany(),
  ]);

  const textSource = externalSources.find((item) => item.kind === "TEXT");
  const videoSource = externalSources.find((item) => item.kind === "VIDEO");

  const docIdCandidates = new Map<string, string>();
  if (manualDoc?.value) {
    docIdCandidates.set(manualDoc.value, manualTrainingSource);
  }
  if (textSource?.documentId) {
    docIdCandidates.set(textSource.documentId, textBlogSource);
  }
  if (videoSource?.documentId) {
    docIdCandidates.set(videoSource.documentId, videoTranscriptsSource);
  }

  const expectedSource =
    Array.from(docIdCandidates.entries()).find(([docId]) =>
      matchesDidDocumentId(docId, documentId),
    )?.[1] ?? normalizedSource;
  const isManual = expectedSource === manualTrainingSource;
  const isText = expectedSource === textBlogSource;
  const isVideo = expectedSource === videoTranscriptsSource;

  const localDoc = documentId
    ? await prisma.knowledgeDocuments.findFirst({
        where: {
          OR: [{ documentId }, { id: documentId }],
        },
      })
    : null;

  const didDocumentId = localDoc?.documentId ?? documentId;

  if (knowledgeBaseId && didDocumentId) {
    await didService
      .deleteKnowledgeDocument(knowledgeBaseId, didDocumentId)
      .catch(() => undefined);
  }

  if (isManual) {
    if (manualFile?.value) {
      await unlink(manualFile.value).catch(() => undefined);
    }
    await prisma.appSetting.deleteMany({
      where: { key: manualTrainingDocKey },
    });
    await prisma.appSetting.deleteMany({
      where: { key: manualTrainingFileKey },
    });
    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: { equals: manualTrainingSource, mode: "insensitive" },
      },
    });
  } else if (isText || isVideo) {
    const sourceRow = isText ? textSource : videoSource;
    if (sourceRow?.filePath) {
      await unlink(sourceRow.filePath).catch(() => undefined);
    }
    if (sourceRow?.id) {
      await prisma.externalSource.update({
        where: { id: sourceRow.id },
        data: { documentId: null, filePath: null },
      });
    }
    await prisma.knowledgeDocuments.deleteMany({
      where: {
        source: {
          equals: expectedSource,
          mode: "insensitive",
        },
      },
    });
  } else if (documentId) {
    await prisma.knowledgeDocuments.deleteMany({
      where: { OR: [{ documentId }, { id: documentId }] },
    });
  }

  revalidatePath("/admin/training");
  revalidatePath("/admin/training/archive");
  return { ok: true };
}

export async function saveUserUpdateAction(formData: FormData) {
  await requireAdmin();
  const action = getString(formData.get("action"));

  if (action === "create") {
    const email = getString(formData.get("email")).trim().toLowerCase();
    const password = getString(formData.get("password"));
    if (!email || !password) {
      throw new Error("Email and password are required");
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        twoFactorEmail: true,
        roles: { create: [{ role: "USER" }] },
      },
      select: { id: true, email: true, createdAt: true, isActive: true },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/admin");
    return { ok: true, user };
  }

  if (action === "update") {
    const userId = getString(formData.get("userId"));
    const email = getString(formData.get("email")).trim().toLowerCase();
    if (!userId || !email) {
      throw new Error("User id and email are required");
    }

    const existingRoles = await prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });
    if (existingRoles.some((role) => role.role === "ADMIN")) {
      throw new Error("Cannot edit admin users here");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { email },
      select: { id: true, email: true, createdAt: true, isActive: true },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/admin");
    return { ok: true, user: updated };
  }

  if (action === "toggle-status") {
    const userId = getString(formData.get("userId"));
    const status = getString(formData.get("status"));
    if (!userId) {
      throw new Error("User id is required");
    }

    const existingRoles = await prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });
    if (existingRoles.some((role) => role.role === "ADMIN")) {
      throw new Error("Cannot edit admin users here");
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data: { isActive: status === "active" },
      select: { id: true, email: true, createdAt: true, isActive: true },
    });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/admin");
    return { ok: true, user: updated };
  }

  if (action === "delete") {
    const userId = getString(formData.get("userId"));
    if (!userId) throw new Error("User id is required");

    const existingRoles = await prisma.userRole.findMany({
      where: { userId },
      select: { role: true },
    });
    if (existingRoles.some((role) => role.role === "ADMIN")) {
      throw new Error("Cannot delete admin users here");
    }

    await prisma.user.delete({ where: { id: userId } });

    revalidatePath("/admin/settings");
    revalidatePath("/admin/settings/admin");
    return { ok: true };
  }

  throw new Error("Unsupported action");
}

export async function saveAuthRequirementAction(formData: FormData) {
  await requireAdmin();
  const enabled = getString(formData.get("enabled")) === "true";

  await prisma.appSetting.upsert({
    where: { key: authRequiredKey },
    update: { value: enabled ? "true" : "false" },
    create: { key: authRequiredKey, value: enabled ? "true" : "false" },
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/admin");
  revalidatePath("/");
  return { ok: true };
}

export async function saveAdminCredentialsAction(formData: FormData) {
  const admin = await requireAdmin();
  const email = getString(formData.get("email")).trim().toLowerCase();
  const currentPassword = getString(formData.get("currentPassword"));
  const newPassword = getString(formData.get("newPassword"));

  if (!currentPassword) {
    return { ok: false, error: "Current password is required" };
  }

  const existing = await prisma.user.findUnique({
    where: { id: admin.id },
    select: { passwordHash: true },
  });

  if (
    !existing ||
    !(await verifyPassword(existing.passwordHash, currentPassword))
  ) {
    return { ok: false, error: "Invalid current password" };
  }

  const updateData: { email?: string; passwordHash?: string } = {};
  if (email) {
    updateData.email = email;
  }

  if (newPassword) {
    updateData.passwordHash = await hashPassword(newPassword);
  }

  if (Object.keys(updateData).length === 0) {
    return { ok: true };
  }

  await prisma.user.update({
    where: { id: admin.id },
    data: updateData,
  });

  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/admin");
  return { ok: true };
}

export async function saveSessionRetentionAction(formData: FormData) {
  await requireAdmin();
  const payload = toObject(formData);
  console.log("[admin] saveSessionRetention", payload);
  revalidatePath("/admin/settings");
  revalidatePath("/admin/settings/sessions");
  return { ok: true };
}
