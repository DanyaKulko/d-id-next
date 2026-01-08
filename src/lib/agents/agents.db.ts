import { unstable_cache } from "next/cache";
import type {
  AgentKey,
  AgentListItem,
  AgentSettings,
  BackgroundItem,
} from "@/app/admin/(protected)/roles.types";
import { prisma } from "@/lib/db/prisma";

const fallbackVideoUrl = "https://neilavatar.com/data/neilcycle.mp4";

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

const toAgentSettings = (
  key: AgentKey,
  agent: {
    id: string;
    displayName: string;
    description: string | null;
    name: string;
    roleDescription: string | null;
    instructions: string | null;
    personality: string | null;
    voiceID: string;
    backgroundEnabled: boolean;
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
    displayName: agent.displayName,
    description: agent.description ?? "",
    agentName: agent.name,
    persona: agent.roleDescription ?? "",
    systemPrompt: agent.instructions ?? "",
    personalityStyle: agent.personality ?? "Friendly and Professional",
    voiceId: agent.voiceID ?? "",
    backgroundsEnabled: agent.backgroundEnabled ?? false,
    backgrounds,
  };
};

const getAgentList = unstable_cache(
  async () =>
    prisma.agent.findMany({
      select: { id: true, agentId: true, slug: true, displayName: true },
      orderBy: { createdAt: "asc" },
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

  if ((!agent.voiceID || !agent.voiceID.trim()) && agent.agentId) {
    const { didService } = await import("@/lib/services/did.service");
    const didAgent = await didService.getAgent(agent.agentId).catch(() => null);
    const voiceId = extractVoiceId(didAgent);
    if (voiceId) {
      await prisma.agent.update({
        where: { id: agent.id },
        data: { voiceID: voiceId },
      });
      return toAgentSettings(agentKey, { ...agent, voiceID: voiceId });
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
    },
    orderBy: { createdAt: "asc" },
  });

  return agents.map((agent) => ({
    id: agent.id,
    key: agent.slug ?? agent.agentId ?? agent.id,
    name: agent.displayName,
    description: agent.description ?? "",
    videoUrl: agent.idleVideoUrl ?? fallbackVideoUrl,
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
