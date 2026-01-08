import Link from "next/link";
import "./page.css";
import Image from "next/image";
import { AvatarPageClient } from "@/app/(client)/[avatarSlug]/page.client";
import logo from "@/assets/img/neil_avatar_logo.png";
import { findAgentByKey } from "@/lib/agents/agents.db";
import { enforceClientAuth } from "@/lib/auth/client-access";
import { didService } from "@/lib/services/did.service";

type AvatarPageProps = {
  params: Promise<{ avatarSlug: string }>;
};

export default async function AvatarPage({ params }: AvatarPageProps) {
  const { avatarSlug } = await params;
  await enforceClientAuth(`/${avatarSlug}`);
  const agentRecord = await findAgentByKey(avatarSlug);
  // TODO: add notFound() handling when the slug does not match a local or D-ID agent.
  const didAgentId = agentRecord?.agentId ?? avatarSlug;
  const agent = await didService
    .getAgent(didAgentId)
    .catch((err) => err.toJSON());
  return (
    <>
      <header className="na-header">
        <div className="na-container">
          <div className="na-header-content">
            <div className="na-logo-text">NEIL AVATAR</div>
            <Link href="/" className="na-back-link">
              ← Back to Roles
            </Link>
          </div>
        </div>
      </header>

      <main className="na-container">
        <AvatarPageClient
          agent={agent}
          agentName={agentRecord?.displayName ?? agent?.name ?? "Neil Avatar"}
          agentDescription={
            agentRecord?.description ?? agent?.description ?? ""
          }
          backgrounds={agentRecord?.backgrounds ?? []}
          backgroundsEnabled={agentRecord?.backgroundEnabled ?? false}
        />

        <div className="na-brand-logo">
          <Image src={logo} alt={"logo"} />
        </div>
      </main>
    </>
  );
}
