import { redirect } from "next/navigation";
import {
  fetchAuthRequirement,
  fetchExternalSourcesConfig,
  fetchIntegrationConfig,
  fetchUsers,
  type UserRow,
} from "@/app/admin/(protected)/admin-data";
import { getCurrentUser } from "@/lib/auth/require";
import SettingsClient from "../settings.client";
import {
  type SettingsTabId,
  settingsTabs,
  settingsTabTitles,
} from "../settings.tabs";
import "../page.css";

type SettingsTabPageProps = {
  params: Promise<{ tab: string }>;
};

type IntegrationConfig = Awaited<ReturnType<typeof fetchIntegrationConfig>>;
type ExternalSourcesConfig = Awaited<
  ReturnType<typeof fetchExternalSourcesConfig>
>;

export default async function SettingsTabPage({
  params,
}: SettingsTabPageProps) {
  const { tab: rawTab } = await params;
  const tab = rawTab as SettingsTabId;
  if (!settingsTabs.includes(tab)) {
    redirect("/admin/settings/integrations");
  }

  const title = settingsTabTitles[tab];
  let users: UserRow[] | undefined;
  let integrationConfig: IntegrationConfig | undefined;
  let externalSourcesConfig: ExternalSourcesConfig | undefined;
  let authRequired: boolean | undefined;
  let adminEmail: string | undefined;

  if (tab === "integrations") {
    integrationConfig = await fetchIntegrationConfig();
  }

  if (tab === "external-sources") {
    externalSourcesConfig = await fetchExternalSourcesConfig();
  }

  if (tab === "admin") {
    [users, authRequired] = await Promise.all([
      fetchUsers(),
      fetchAuthRequirement(),
    ]);
    const session = await getCurrentUser();
    adminEmail = session?.user.email ?? "";
  }

  return (
    <div className="container">
      <div className="breadcrumbs">
        <div className="breadcrumb-item">Settings</div>
        <span className="breadcrumb-separator">›</span>
        <div className="breadcrumb-item" id="current-section">
          {title}
        </div>
      </div>

      <h1 className="page-title">{title}</h1>

      <SettingsClient
        key={tab}
        initialTab={tab}
        initialUsers={users}
        initialIntegrationConfig={integrationConfig}
        initialExternalSourcesConfig={externalSourcesConfig}
        initialAuthRequired={authRequired}
        initialAdminEmail={adminEmail}
      />
    </div>
  );
}
