import { unstable_cache } from "next/cache";
import type {
  AgentKey,
  AgentListItem,
  AgentSettings,
  BackgroundItem,
  BackgroundKeyColor,
} from "@/app/admin/(protected)/roles.types";
import { prisma } from "@/lib/db/prisma";
import {didService} from "@/lib/services/did.service";

const resolveString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;

const extractVoiceId = (agent: unknown) => {
  if (!agent || typeof agent !== "object") return "";
  const record = agent as Record<string, unknown>;
  const presenter = record.presenter;
  if (presenter && typeof presenter === "object") {
    const presenterVoice = (presenter as Record<string, unknown>).voice;
    if (presenterVoice && typeof presenterVoice === "object") {
      return resolveString(
        (presenterVoice as Record<string, unknown>).voice_id,
        "",
      );
    }
  }
  const voice = record.voice;
  if (voice && typeof voice === "object") {
    return resolveString(
      (voice as Record<string, unknown>).voice_id ??
        (voice as Record<string, unknown>).id,
      "",
    );
  }
  return resolveString(
    record.voice_id ?? record.voiceId ?? record.preview_voice_id,
    "",
  );
};

const extractVoiceLanguage = (agent: unknown) => {
  if (!agent || typeof agent !== "object") return "";
  const record = agent as Record<string, unknown>;
  const presenter = record.presenter;
  if (presenter && typeof presenter === "object") {
    const presenterVoice = (presenter as Record<string, unknown>).voice;
    if (presenterVoice && typeof presenterVoice === "object") {
      return resolveString(
        (presenterVoice as Record<string, unknown>).language,
        "",
      );
    }
  }
  const voice = record.voice;
  if (voice && typeof voice === "object") {
    return resolveString((voice as Record<string, unknown>).language, "");
  }
  return resolveString(record.language, "");
};

const extractAvatarImageUrl = (agent: unknown) => {
  if (!agent || typeof agent !== "object") return "";
  const record = agent as Record<string, unknown>;
  const presenter = record.presenter;
  if (presenter && typeof presenter === "object") {
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
  }
  return resolveString(
    record.image_url ??
      record.imageUrl ??
      record.preview_image ??
      record.previewImage,
    "",
  );
};

const toAgentSettings = (
  key: AgentKey,
  agent: {
    id: string;
    agentId: string | null;
    displayName: string;
    description: string | null;
    name: string;
    roleDescription: string | null;
    instructions: string | null;
    personality: string | null;
    voiceID: string;
    voiceLanguage: string | null;
    llmModel: string | null;
    llmTemplate: string | null;
    mobileVideoOffsetPx?: number | null;
    backgroundEnabled: boolean;
    backgroundKeyColor: string | null;
    backgrounds: {
      id: string;
      title: string;
      theme: string;
      url: string;
    }[];
  },
): AgentSettings => {
  const backgrounds: BackgroundItem[] = agent.backgrounds.map((background) => ({
    id: background.id,
    title: background.title,
    theme: background.theme as BackgroundItem["theme"],
    url: background.url,
  }));

  return {
    key,
      agentId: agent.agentId,
    displayName: agent.displayName,
    description: agent.description ?? "",
    agentName: agent.name,
    persona: agent.roleDescription ?? "",
    systemPrompt: agent.instructions ?? "",
    personalityStyle: agent.personality ?? "Friendly and Professional",
    voiceId: agent.voiceID ?? "",
    voiceLanguage: agent.voiceLanguage ?? "",
    llmModel: agent.llmModel ?? "",
    llmTemplate: agent.llmTemplate ?? "",
    mobileVideoOffsetPx: agent.mobileVideoOffsetPx ?? 0,
    backgroundsEnabled: agent.backgroundEnabled ?? false,
    backgroundKeyColor: agent.backgroundKeyColor
      ? (agent.backgroundKeyColor.toLowerCase() as BackgroundKeyColor)
      : undefined,
    backgrounds,
  };
};

const getAgentList = unstable_cache(
  async () =>
    prisma.agent.findMany({
      select: { id: true, agentId: true, slug: true, displayName: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    }),
  ["agents-list"],
  { revalidate: 60, tags: ["agents"] },
);

export async function fetchAgentListFromDb(): Promise<AgentListItem[]> {
  const agents = await getAgentList();

  return agents.map((agent) => ({
    key: agent.slug ?? agent.agentId ?? agent.id,
    displayName: agent.displayName,
  }));
}

export async function fetchAgentSettingsFromDb(
  agentKey: AgentKey,
): Promise<AgentSettings> {
  const agent = await unstable_cache(
    async () =>
      prisma.agent.findFirst({
        where: {
          OR: [{ slug: agentKey }, { id: agentKey }, { agentId: agentKey }],
        },
        include: { backgrounds: true },
      }),
    ["agent-settings", agentKey],
    { revalidate: 60, tags: ["agents", `agent:${agentKey}`] },
  )();

  if (!agent) {
    throw new Error("Agent not found");
  }

  let didAgent: Record<string, unknown> | null = null;

  if (agent.agentId) {
    didAgent = (await didService.getAgent(agent.agentId).catch(() => null)) as
      | Record<string, unknown>
      | null;
  }

  if (didAgent) {
    const voiceId = extractVoiceId(didAgent);
    const voiceLanguage = extractVoiceLanguage(didAgent).trim();
    const avatarImageUrl = extractAvatarImageUrl(didAgent);
    const updateData: {
      voiceID?: string;
      voiceLanguage?: string;
      avatarImageUrl?: string;
    } = {};
    if (voiceId && voiceId !== (agent.voiceID ?? "")) {
      updateData.voiceID = voiceId;
    }
    if (
      voiceLanguage &&
      voiceLanguage.toLowerCase() !== (agent.voiceLanguage ?? "").toLowerCase()
    ) {
      updateData.voiceLanguage = voiceLanguage;
    }
    if (avatarImageUrl && avatarImageUrl !== (agent.avatarImageUrl ?? "")) {
      updateData.avatarImageUrl = avatarImageUrl;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: updateData,
      });
      return toAgentSettings(agentKey, { ...agent, ...updateData });
    }
  }

  return toAgentSettings(agentKey, agent);
}

export async function fetchHomeAgents() {
  const agents = await prisma.agent.findMany({
    select: {
      id: true,
      agentId: true,
      slug: true,
      displayName: true,
      description: true,
      idleVideoUrl: true,
      avatarImageUrl: true,
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return agents.map((agent) => ({
    id: agent.id,
    key: agent.slug ?? agent.agentId ?? agent.id,
    name: agent.displayName,
    description: agent.description ?? "",
    videoUrl: agent.idleVideoUrl ?? "",
    imageUrl: agent.avatarImageUrl ?? "",
  }));
}

export async function findAgentByKey(agentKey: string) {
  return prisma.agent.findFirst({
    where: {
      OR: [{ slug: agentKey }, { agentId: agentKey }, { id: agentKey }],
    },
    include: { backgrounds: true },
  });
}
