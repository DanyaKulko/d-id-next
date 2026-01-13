import "dotenv/config";
import { prisma } from "@/lib/db/prisma";
import { didService } from "@/lib/services/did.service";

const [agentId, slug] = process.argv.slice(2);

if (!agentId) {
  console.error("Usage: npx tsx playground/sync-agent.ts <didAgentId> [slug]");
  process.exit(1);
}

const resolveString = (value: unknown, fallback = "") =>
  typeof value === "string" ? value : fallback;
const resolveVoiceId = (value: unknown) => resolveString(value);
const toRecord = (value: unknown) =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const run = async () => {
  const didAgent = await didService.getAgent(agentId);
  const didAgentRecord = toRecord(didAgent);
  const presenter = toRecord(didAgentRecord.presenter);
  const llm = toRecord(didAgentRecord.llm);
  const promptCustomization = toRecord(llm.prompt_customization);

  const name = resolveString(
    didAgentRecord.preview_name ?? didAgentRecord.name,
    slug ?? agentId,
  );
  const description = resolveString(didAgentRecord.description, "");
  const roleDescription = resolveString(
    didAgentRecord.role_description ??
      promptCustomization.role ??
      didAgentRecord.role ??
      didAgentRecord.agent_role ??
      didAgentRecord.persona,
    "",
  );
  const instructions = resolveString(
    llm.instructions ??
      llm.system_prompt ??
      didAgentRecord.instructions ??
      didAgentRecord.system_prompt,
    "",
  );
  const personality = resolveString(
    promptCustomization.personality ??
      didAgentRecord.personality ??
      didAgentRecord.personality_style ??
      didAgentRecord.style ??
      llm.personality ??
      llm.style,
    "",
  );
  const presenterVoice = toRecord(presenter.voice);
  const voiceId = resolveVoiceId(
    presenterVoice.voice_id ??
      didAgentRecord.voice_id ??
      didAgentRecord.voiceId,
  );
  const idleVideoUrl = resolveString(
    presenter.idle_video ?? presenter.idle_video_url ?? presenter.idleVideoUrl,
    "",
  );

  const existing = await prisma.agent.findUnique({ where: { agentId } });
  const data = {
    agentId,
    displayName: name,
    description: description || null,
    name,
    roleDescription: roleDescription || null,
    instructions: instructions || null,
    personality: personality || null,
    voiceID: voiceId || "",
    idleVideoUrl: idleVideoUrl || null,
    backgroundEnabled: existing?.backgroundEnabled ?? false,
    ...(slug ? { slug } : {}),
  };

  const record = await prisma.agent.upsert({
    where: { agentId },
    update: data,
    create: data,
  });

  console.log("Synced agent:", {
    id: record.id,
    agentId: record.agentId,
    slug: record.slug,
  });
};

run()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
