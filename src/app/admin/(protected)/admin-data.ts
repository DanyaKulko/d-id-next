export type RoleId = "basic" | "tourism" | "sports" | "politics" | "space";

export type BackgroundItem = {
    id: string;
    title: string;
    theme: "forest" | "studio" | "home" | "space";
};

export type RoleSettings = {
    id: RoleId;
    displayName: string;
    description: string;
    agentName: string;
    persona: string;
    systemPrompt: string;
    personalityStyle: string;
    backgrounds: BackgroundItem[];
};

export type UserRow = {
    id: number;
    login: string;
    email: string;
    createdDate: string;
    lastLogin: string;
    status: "active" | "inactive";
};

export type TechnicalSetting = {
    title: string;
    video: string;
    voice: string;
};

export type MainAdminSettings = {
    voiceId: string;
    backgroundsEnabled: boolean;
    backgroundUploadLimitMb: number;
};

export type KnowledgeItem = {
    id: string;
    title: string;
    sourceLabel: string;
    created: string;
    status: "processing" | "error" | "active";
};

const rolePresets: Record<RoleId, RoleSettings> = {
    basic: {
        id: "basic",
        displayName: "Basic Neil",
        description: "The main version of Neil. A universal personality for general questions about life, career, and experience.",
        agentName: "Neil",
        persona:
            "You are Neil, a space enthusiast, traveler, and analyst. You share your experiences, answer questions about life, career, and hobbies. Your style is friendly but professional.",
        systemPrompt:
            "You are Neil, a knowledgeable and friendly AI avatar. Answer questions based on Neil's personal experiences, blog posts, and knowledge base. Maintain a conversational yet informative tone.",
        personalityStyle: "friendly",
        backgrounds: [
            { id: "bg-forest", title: "Background #1: Forest", theme: "forest" },
            { id: "bg-studio", title: "Background #2: Studio", theme: "studio" },
            { id: "bg-home", title: "Background #3: Home", theme: "home" },
        ],
    },
    tourism: {
        id: "tourism",
        displayName: "Tourism Neil",
        description: "Neil's tourism-focused personality. Expert in travel destinations, cultural insights, and travel tips.",
        agentName: "Neil",
        persona:
            "You are Tourism Neil, an experienced traveler and cultural explorer. Share travel insights, destination recommendations, and cultural knowledge.",
        systemPrompt: "You are Tourism Neil. Answer questions about travel destinations, cultural experiences, and tourism tips. Be enthusiastic and inspiring.",
        personalityStyle: "friendly",
        backgrounds: [],
    },
    sports: {
        id: "sports",
        displayName: "Sports Neil",
        description: "Sports focused persona",
        agentName: "Neil",
        persona: "",
        systemPrompt: "",
        personalityStyle: "friendly",
        backgrounds: [],
    },
    politics: {
        id: "politics",
        displayName: "Politics Neil",
        description: "Politics focused persona",
        agentName: "Neil",
        persona: "",
        systemPrompt: "",
        personalityStyle: "friendly",
        backgrounds: [],
    },
    space: {
        id: "space",
        displayName: "Space Neil",
        description: "Space focused persona",
        agentName: "Neil",
        persona: "",
        systemPrompt: "",
        personalityStyle: "friendly",
        backgrounds: [],
    },
};

const initialUsers: UserRow[] = [
    { id: 1, login: "user1", email: "user1@example.com", createdDate: "2025-01-15", lastLogin: "2025-01-22", status: "active" },
    { id: 2, login: "user2", email: "user2@example.com", createdDate: "2025-01-18", lastLogin: "2025-01-21", status: "active" },
    { id: 3, login: "testuser", email: "test@example.com", createdDate: "2025-01-20", lastLogin: "Never", status: "inactive" },
];

const technicalPresets: TechnicalSetting[] = [
    { title: "🎭 Basic Neil", video: "basic_neil_v1", voice: "voice_neil_basic" },
    { title: "✈ Tourism Neil", video: "tourism_neil_v1", voice: "voice_neil_tourism" },
    { title: "⚽ Sports Neil", video: "sports_neil_v1", voice: "voice_neil_sports" },
    { title: "🏛️ Politics Neil", video: "politics_neil_v1", voice: "voice_neil_politics" },
    { title: "🚀 Space Neil", video: "space_neil_v1", voice: "voice_neil_space" },
];

const knowledgePresets: KnowledgeItem[] = [
    { id: "k1", title: "Knowledge #1", sourceLabel: "Text blog", created: "01.22.2025", status: "processing" },
    { id: "k2", title: "Knowledge #2", sourceLabel: "Manual training", created: "01.22.2025", status: "error" },
    { id: "k3", title: "Knowledge #3", sourceLabel: "Manual training", created: "01.22.2025", status: "active" },
];

const mainSettingsPreset: MainAdminSettings = {
    voiceId: "voice_neil_basic",
    backgroundsEnabled: true,
    backgroundUploadLimitMb: 25,
};

const wait = (ms = 150) => new Promise((resolve) => setTimeout(resolve, ms));

export async function fetchRoleList() {
    await wait();
    return (Object.values(rolePresets) as RoleSettings[]).map(({ id, displayName }) => ({ id, displayName }));
}

export async function fetchRoleSettings(roleId: RoleId): Promise<RoleSettings> {
    await wait();
    return rolePresets[roleId];
}

export async function fetchUsers(): Promise<UserRow[]> {
    await wait();
    return initialUsers;
}

export async function fetchTechnicalSettings(): Promise<TechnicalSetting[]> {
    await wait();
    return technicalPresets;
}

export async function fetchMainAdminSettings(): Promise<MainAdminSettings> {
    await wait();
    return mainSettingsPreset;
}

export async function fetchKnowledgeArchive(): Promise<KnowledgeItem[]> {
    await wait();
    return knowledgePresets;
}

export async function fetchSafetyInstructions(): Promise<string> {
    await wait();
    return `Do not discuss:
- Political topics in aggressive form
- Personal information of third parties
- Financial advice as actionable recommendations

Always:
- Maintain a respectful tone
- Avoid categorical judgments
- Reference sources for factual claims`;
}

export async function fetchManualTrainingTemplate(): Promise<string> {
    await wait();
    return "In 1995 Neil visited Egypt and was impressed by the pyramids of Giza...";
}

export async function fetchIntegrationConfig() {
    await wait();
    return { apiKey: "sk_did_" };
}

export async function fetchExternalSourcesConfig() {
    await wait();
    return {
        textLink: "https://roliki.ua/s/json_template_s.txt",
        textCron: "0 2 * * *",
        textAccessKey: "",
        videoLink: "https://roliki.ua/s/video-transcripts-neil.txt",
        videoCron: "0 3 * * *",
        videoAccessKey: "",
    };
}
