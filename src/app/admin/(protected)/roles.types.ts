export type AgentKey = string;

export type BackgroundTheme = string;

export type BackgroundKeyColor = "white" | "green";

export type BackgroundItem = {
  id: string;
  title: string;
  theme: BackgroundTheme;
  url?: string;
};

export type AgentSettings = {
  key: AgentKey;
  displayName: string;
  description: string;
  agentName: string;
  persona: string;
  systemPrompt: string;
  personalityStyle: string;
  voiceId: string;
  backgroundsEnabled: boolean;
  backgroundKeyColor?: BackgroundKeyColor;
  backgrounds: BackgroundItem[];
};

export type AgentListItem = {
  key: AgentKey;
  displayName: string;
};

