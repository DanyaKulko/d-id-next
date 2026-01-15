import "./page.css";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AvatarPageClient } from "@/app/(client)/[avatarSlug]/page.client";
import logo from "@/assets/img/neil_avatar_logo.png";
import { findAgentByKey } from "@/lib/agents/agents.db";
import { enforceClientAuth } from "@/lib/auth/client-access";

type AvatarPageProps = {
  params: Promise<{ avatarSlug: string }>;
};

export default async function AvatarPage({ params }: AvatarPageProps) {
  const { avatarSlug } = await params;
  await enforceClientAuth(`/${avatarSlug}`);
  const agentRecord = await findAgentByKey(avatarSlug);
  if (!agentRecord?.agentId) {
    notFound();
  }

  const backgroundKeyColor = agentRecord.backgroundKeyColor
    ? agentRecord.backgroundKeyColor.toLowerCase() as 'white' | 'green'
    : undefined;

  return (
    <>
      <header className="na-header">
        <div className="na-container">
            <div className="na-header-content">
            <Link href="/" className="na-logo-text">
              NEIL AVATAR
            </Link>
            <Link href="/" className="na-back-link">
              ← Back to Roles
            </Link>
          </div>
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

        <div className="na-brand-logo">
          <Image src={logo} alt={"logo"} />
        </div>
      </main>
    </>
  );
}
