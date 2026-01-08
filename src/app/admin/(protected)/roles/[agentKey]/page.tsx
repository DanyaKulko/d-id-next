import { redirect } from "next/navigation";
import {
  fetchAgentListFromDb,
  fetchAgentSettingsFromDb,
} from "@/lib/agents/agents.db";
import RolesClient from "../../roles.client";
import "../../page.css";

type RolesPageProps = {
  params: Promise<{ agentKey: string }>;
};

export default async function RolesPage({ params }: RolesPageProps) {
  const agents = await fetchAgentListFromDb();
  const { agentKey } = await params;

  if (agents.length === 0) {
    return (
      <div className="container">
        <div className="breadcrumbs">
          <div className="breadcrumb-item">Roles</div>
          <span className="breadcrumb-separator">›</span>
          <div className="breadcrumb-item" id="current-role">
            Roles
          </div>
        </div>

        <h1 className="page-title">Role Personalization</h1>

        <RolesClient initialAgents={[]} initialAgentKey={null} />
      </div>
    );
  }

  const exists = agents.some((agent) => agent.key === agentKey);
  if (!exists) {
    redirect(`/admin/roles/${agents[0].key}`);
  }

  const active = agents.find((agent) => agent.key === agentKey) ?? agents[0];
  const settings = await fetchAgentSettingsFromDb(active.key);

  return (
    <div className="container">
      <div className="breadcrumbs">
        <div className="breadcrumb-item">Roles</div>
        <span className="breadcrumb-separator">›</span>
        <div className="breadcrumb-item" id="current-role">
          {active.displayName}
        </div>
      </div>

      <h1 className="page-title">Role Personalization</h1>

      <RolesClient
        key={agentKey}
        initialAgents={agents}
        initialAgentKey={agentKey}
        initialAgentSettings={settings}
      />
    </div>
  );
}
