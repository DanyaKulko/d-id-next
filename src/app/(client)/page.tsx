import "./page.css";
import Image from "next/image";
import Link from "next/link";
import logo from "@/assets/img/neil_avatar_logo.png";
import UserGuideModal from "@/components/UserGuideModal/UserGuideModal";
import { fetchHomeAgents } from "@/lib/agents/agents.db";
import { enforceClientAuth } from "@/lib/auth/client-access";

export const dynamic = 'force-dynamic';

export default async function Home() {
  await enforceClientAuth("/");
  const avatars = await fetchHomeAgents();
  return (
    <>
      {/*<UserAgreementModal/>*/}
      <UserGuideModal />
      <header className="na-header">
        <div className="na-container">
          <div className="na-header-content">
            <Link href="/" className="na-logo-text">
              NEIL AVATAR
            </Link>
            <div className="na-header-title">
              <h1 className="na-title-display na-glow">
                Choose Your Neil Avatar Role
              </h1>
              <p className="na-subtitle">
                Select one of five specialized versions of Neil to begin your
                conversation
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="na-container">
        <div className="na-roles-grid">
          {avatars.map((avatar, index) => (
            <Link
              href={`/${avatar.key}`}
              key={avatar.id}
              className={`na-card na-card--${index === 0 ? "full" : "half"}`}
            >
              {avatar.videoUrl ? (
                <video
                  className="na-card-video"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  poster={avatar.imageUrl || undefined}
                >
                  <source src={avatar.videoUrl} type="video/mp4" />
                </video>
              ) : avatar.imageUrl ? (
                <Image
                  className="na-card-image"
                  src={avatar.imageUrl}
                  alt={`${avatar.name} preview`}
                  fill
                  sizes="(max-width: 768px) 100vw, 50vw"
                  unoptimized
                  loading="lazy"
                />
              ) : (
                <div className="na-card-image na-card-image--empty" />
              )}
              <div className="na-card-overlay"></div>
              <div className="na-card-content">
                <h3 className="na-card-title">{avatar.name}</h3>
                <p className="na-card-desc">{avatar.description}</p>
              </div>
            </Link>
          ))}
        </div>

        <div className="na-brand-logo">
          <Image src={logo} alt={"logo"} />
        </div>
      </main>
    </>
  );
}
