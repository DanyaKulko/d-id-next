import { prisma } from "@/lib/db/prisma";
import {
  classifyIntent,
  type HistoryEntry,
} from "@/lib/media/intent-classifier";
import { phraseForIntent, phraseForNoResults } from "@/lib/media/phrases";
import {
  searchBlogPhotos,
  searchBlogVideos,
} from "@/lib/media/search/blog-search";
import { searchImages } from "@/lib/media/search/brave-images";
import { searchWeb } from "@/lib/media/search/brave-web";
import { searchVideos } from "@/lib/media/search/youtube";
import { summarizeSearch } from "@/lib/media/summarize";
import { hasAnyTrigger } from "@/lib/media/trigger-words";
import type {
  MediaIntent,
  MediaItem,
  MediaResolveResult,
} from "@/lib/media/types";
import { didService } from "@/lib/services/did.service";
import { normalizeDidChatText } from "@/lib/text/did-chat";

const MAX_HISTORY_MESSAGES = 10;

const NONE_RESULT: MediaResolveResult = { intent: "none", items: [] };

interface ResolveInput {
  agentId: string;
  chatId: string;
  streamId: string;
  sessionId: string;
  text: string;
  language?: string;
}

interface PersistedSession {
  id: string;
  agentRowId: string | null;
  userId: string | null;
  language: string | null;
}

const findChatSession = async (
  chatId: string,
): Promise<PersistedSession | null> => {
  const session = await prisma.chatSession.findUnique({
    where: { didChatId: chatId },
    select: { id: true, agentId: true, userId: true, language: true },
  });
  if (!session) return null;
  return {
    id: session.id,
    agentRowId: session.agentId,
    userId: session.userId,
    language: session.language,
  };
};

const readHistory = async (sessionRowId: string): Promise<HistoryEntry[]> => {
  const rows = await prisma.chatMessage.findMany({
    where: { sessionId: sessionRowId, role: { in: ["USER", "ASSISTANT"] } },
    orderBy: { createdAt: "desc" },
    take: MAX_HISTORY_MESSAGES,
    select: { role: true, content: true },
  });
  return rows.reverse().map((row) => ({
    role: row.role === "USER" ? "user" : "assistant",
    content:
      row.role === "ASSISTANT"
        ? normalizeDidChatText(row.content)
        : row.content,
  }));
};

const writeUserMessage = async (
  sessionRowId: string,
  text: string,
  language?: string,
) => {
  try {
    await prisma.chatMessage.create({
      data: {
        sessionId: sessionRowId,
        role: "USER",
        content: text,
        language: language?.trim() || null,
      },
    });
  } catch (error) {
    console.error("Failed to persist media-flow USER message:", error);
  }
};

const writeAssistantMessage = async (
  sessionRowId: string,
  text: string,
  language?: string,
) => {
  if (!text.trim()) return;
  try {
    await prisma.chatMessage.create({
      data: {
        sessionId: sessionRowId,
        role: "ASSISTANT",
        content: text,
        language: language?.trim() || null,
      },
    });
  } catch (error) {
    console.error("Failed to persist media-flow ASSISTANT message:", error);
  }
};

const speakScript = async (
  agentId: string,
  streamId: string,
  sessionId: string,
  text: string,
): Promise<boolean> => {
  try {
    if (!text.trim()) return false;
    await didService.sendStreamScript(agentId, streamId, sessionId, text);
    return true;
  } catch (error) {
    console.error("sendStreamScript failed:", error);
    return false;
  }
};

const PHOTO_LIMIT = 4;
const VIDEO_LIMIT = 1;

const runMediaSearch = async (
  intent: MediaIntent,
  keywords: string,
): Promise<{ items: MediaItem[]; blogFallback: boolean }> => {
  switch (intent) {
    case "photo_from_external":
      return {
        items: await searchImages(keywords, PHOTO_LIMIT),
        blogFallback: false,
      };
    case "video_from_external":
      return {
        items: await searchVideos(keywords, VIDEO_LIMIT),
        blogFallback: false,
      };
    case "photo_from_blog": {
      const blog = await searchBlogPhotos(keywords, PHOTO_LIMIT);
      if (blog.length > 0) return { items: blog, blogFallback: false };
      const fallback = await searchImages(keywords, PHOTO_LIMIT);
      return { items: fallback, blogFallback: true };
    }
    case "video_from_blog": {
      const blog = await searchBlogVideos(keywords, VIDEO_LIMIT);
      if (blog.length > 0) return { items: blog, blogFallback: false };
      const fallback = await searchVideos(keywords, VIDEO_LIMIT);
      return { items: fallback, blogFallback: true };
    }
    default:
      return { items: [], blogFallback: false };
  }
};

export const resolveMediaIntent = async (
  input: ResolveInput,
): Promise<MediaResolveResult> => {
  const { agentId, chatId, streamId, sessionId, text, language } = input;
  const trimmed = text.trim();
  const reqId = `${chatId.slice(-8)}-${Date.now().toString(36)}`;
  const log = (event: string, meta: Record<string, unknown> = {}) => {
    console.log(`[media-intent][${reqId}] ${event}`, meta);
  };

  log("start", { text: trimmed, language, agentId });

  if (!trimmed) {
    log("skip", { reason: "empty text" });
    return NONE_RESULT;
  }

  const triggered = hasAnyTrigger(trimmed);
  log("trigger_check", { triggered });
  if (!triggered) {
    return NONE_RESULT;
  }

  const session = await findChatSession(chatId);
  if (!session) {
    log("skip", { reason: "chat session not found in DB", chatId });
    return NONE_RESULT;
  }

  const history = await readHistory(session.id);
  log("history_loaded", {
    sessionId: session.id,
    historyCount: history.length,
  });

  let classification: Awaited<ReturnType<typeof classifyIntent>>;
  try {
    classification = await classifyIntent({ message: trimmed, history });
  } catch (error) {
    log("classify_threw", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NONE_RESULT;
  }

  log("classified", { ...classification });

  if (classification.intent === "none" || !classification.keywords) {
    log("resolved_none", {
      reason: classification.intent === "none" ? "intent=none" : "no keywords",
    });
    return NONE_RESULT;
  }

  try {
    if (classification.intent === "search_information") {
      const webResults = await searchWeb(classification.keywords, 5);
      log("search_information.web_results", {
        resultsCount: webResults.length,
      });
      const summary = await summarizeSearch(webResults, trimmed, language);
      const spokenText = summary || phraseForNoResults(language);
      log("search_information.summary", { spokenText });

      const spoke = await speakScript(agentId, streamId, sessionId, spokenText);
      if (!spoke) {
        log("speak_failed", { intent: classification.intent });
        return NONE_RESULT;
      }
      await writeUserMessage(session.id, trimmed, language);
      await writeAssistantMessage(session.id, spokenText, language);
      log("resolved", {
        intent: classification.intent,
        items: 0,
        spokenText,
      });
      return {
        intent: classification.intent,
        items: [],
        spokenText,
      };
    }

    const { items, blogFallback } = await runMediaSearch(
      classification.intent,
      classification.keywords,
    );
    log("search_results", {
      intent: classification.intent,
      itemsCount: items.length,
      blogFallback,
      firstItemTitle: items[0]?.title,
    });

    const phrase =
      items.length > 0
        ? phraseForIntent(classification.intent, language, { blogFallback })
        : phraseForNoResults(language);
    log("phrase_chosen", { phrase, hasResults: items.length > 0 });

    const spoke = await speakScript(agentId, streamId, sessionId, phrase);
    if (!spoke) {
      log("speak_failed", { intent: classification.intent });
      return NONE_RESULT;
    }
    await writeUserMessage(session.id, trimmed, language);
    await writeAssistantMessage(session.id, phrase, language);

    log("resolved", {
      intent: classification.intent,
      items: items.length,
      blogFallback,
      spokenText: phrase,
    });
    return {
      intent: classification.intent,
      items,
      spokenText: phrase,
      blogFallback,
    };
  } catch (error) {
    log("unexpected_error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NONE_RESULT;
  }
};
