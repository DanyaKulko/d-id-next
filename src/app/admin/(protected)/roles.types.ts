export type AgentKey = string;

export type BackgroundTheme = string;

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
  backgrounds: BackgroundItem[];
};

export type AgentListItem = {
  key: AgentKey;
  displayName: string;
};

export function isBackgroundTheme(value: string): value is BackgroundTheme {
  return value.trim().length > 0;
}
