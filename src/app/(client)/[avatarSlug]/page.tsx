import "./page.css";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarPageClient } from "@/app/(client)/[avatarSlug]/page.client";
import { findAgentByKey } from "@/lib/agents/agents.db";
import { enforceClientAuth } from "@/lib/auth/client-access";
import LottieLogo from "@/components/LottieLogo/LottieLogo";
import ClientPreloader from "@/components/ClientPreloader/ClientPreloader";
import { AgentHintsScript } from "./_components/AgentHintsScript";
import ClientLogoutButton from "../_components/ClientLogoutButton";
import { isClientAuthRequired } from "@/lib/auth/client-access";

type AvatarPageProps = {
  params: Promise<{ avatarSlug: string }>;
};

export default async function AvatarPage({ params }: AvatarPageProps) {
  const { avatarSlug } = await params;
  await enforceClientAuth(`/${avatarSlug}`);
  const authRequired = await isClientAuthRequired();
  const agentRecord = await findAgentByKey(avatarSlug);
  if (!agentRecord?.agentId) {
    notFound();
  }

  const backgroundKeyColor = agentRecord.backgroundKeyColor
    ? agentRecord.backgroundKeyColor.toLowerCase() as 'white' | 'green'
    : undefined;

  return (
    <>
      {agentRecord.hintsScriptUrl ? (
        <AgentHintsScript src={agentRecord.hintsScriptUrl} />
      ) : null}
      <ClientPreloader />
      <header className="na-header">
        <div className="na-container">
          {authRequired ? (
            <div className="na-header-content">
              <div className="na-header-left">
                {/*<Link href="/" className="na-logo-text" aria-label="Neil Avatar">*/}
                {/*  Neil Avatar*/}
                {/*</Link>*/}
                <Link href="/" className="na-back-link">
                  ← Back to Roles
                </Link>
              </div>
              <ClientLogoutButton />
            </div>
          ) : (
            <div className="na-header-content">
              <Link href="/" className="na-logo-text" aria-label="Neil Avatar">
                Neil Avatar
              </Link>
              <Link href="/" className="na-back-link">
                ← Back to Roles
              </Link>
            </div>
          )}
        </div>
      </header>

      <main className="na-container">
        <AvatarPageClient
          agent={agentRecord}
          agentName={
            agentRecord?.displayName ?? agentRecord?.name ?? "Neil Avatar"
          }
          agentDescription={
            agentRecord?.description ?? agentRecord?.description ?? ""
          }
          agentImageUrl={agentRecord?.avatarImageUrl ?? ""}
          agentIdleVideoUrl={agentRecord?.idleVideoUrl ?? ""}
          backgrounds={agentRecord?.backgrounds ?? []}
          backgroundsEnabled={agentRecord?.backgroundEnabled ?? false}
          backgroundKeyColor={backgroundKeyColor}
          mobileVideoOffsetPx={agentRecord?.mobileVideoOffsetPx ?? 0}
        />

        <div className="na-brand-logo" aria-hidden="true">
          <LottieLogo
            className="na-logo-anim na-logo-anim--footer"
            loop
            // playOnView
          />
        </div>
      </main>
    </>
  );
}
