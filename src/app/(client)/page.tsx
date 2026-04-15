import "./page.css";
import Image from "next/image";
import Link from "next/link";
import HomeMediaPrefetch from "@/components/HomeMediaPrefetch";
import LottieLogo from "@/components/LottieLogo/LottieLogo";
import UserGuideModal from "@/components/UserGuideModal/UserGuideModal";
import ClientPreloader from "@/components/ClientPreloader/ClientPreloader";
import { fetchHomeAgents } from "@/lib/agents/agents.db";
import {
  enforceClientAuth,
  isClientAuthRequired,
} from "@/lib/auth/client-access";
import ClientLogoutButton from "./_components/ClientLogoutButton";

export const dynamic = 'force-dynamic';

export default async function Home() {
  await enforceClientAuth("/");
  const authRequired = await isClientAuthRequired();
  const avatars = await fetchHomeAgents();
  const mediaUrls = avatars.flatMap((avatar) =>
    [avatar.videoUrl, avatar.imageUrl].filter(Boolean),
  );
  return (
    <>
      <ClientPreloader />
      <UserGuideModal />
      <HomeMediaPrefetch urls={mediaUrls} />
      <header className="na-header">
        <div className="na-container">
          {authRequired ? (
            <div className="na-header-content na-header-content--with-actions">
              <div className="na-header-side">
                <Link href="/" className="na-logo-text" aria-label="Neil Avatar">
                  Neil Avatar
                </Link>
              </div>
              <div className="na-header-title na-header-title--centered">
                <p className="na-subtitle">
                  Choose a topic to start talking with Neil
                </p>
              </div>
              <div className="na-header-side na-header-side--end">
                <ClientLogoutButton />
              </div>
            </div>
          ) : (
            <div className="na-header-content">
              <Link href="/" className="na-logo-text" aria-label="Neil Avatar">
                Neil Avatar
              </Link>
              <div className="na-header-title na-header-title--centered">
                <p className="na-subtitle">
                  Choose a topic to start talking with Neil
                </p>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="na-container">
        <p className="na-subtitle" style={{ textAlign: "center", marginBottom: 16, fontSize: 24 }}>
          Click on any image of Avatars
        </p>
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
