import { redirect } from "next/navigation";
import { fetchAgentListFromDb } from "@/lib/agents/agents.db";
import RolesClient from "../roles.client";
import "../page.css";

export default async function RolesIndexPage() {
  const agents = await fetchAgentListFromDb();

  if (agents.length > 0) {
    redirect(`/admin/roles/${agents[0].key}`);
  }

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
