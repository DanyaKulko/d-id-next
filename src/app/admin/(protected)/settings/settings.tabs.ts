export const settingsTabs = [
  "integrations",
  "external-sources",
  "sessions",
  "errors-debug",
  "admin-credentials",
  "user-access",
] as const;

export type SettingsTabId = (typeof settingsTabs)[number];

export const settingsTabTitles: Record<SettingsTabId, string> = {
  integrations: "Integrations",
  "external-sources": "External Sources",
  sessions: "Session Records",
  "errors-debug": "Error Log & Debug",
  "admin-credentials": "Administrator Credentials",
  "user-access": "User Access Management",
};
