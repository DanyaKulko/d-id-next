import Link from "next/link";
import LottieLogo from "@/components/LottieLogo/LottieLogo";
import "./BrandLockup.css";

type BrandLockupProps = {
  /** Extra class on the outer container (e.g. for spacing/alignment). */
  className?: string;
  /** Render the wordmark as a link to the home page (used in the header). */
  asLink?: boolean;
  /**
   * Render the lamp as a one-shot video (plays once, holds the last frame)
   * instead of the looping Lottie. Used on the preloader splash.
   */
  lampVideoSrc?: string;
};

/**
 * Brand lockup: lamp animation on the left, stacked "Neil Avatar"
 * wordmark + tagline on the right. Shared across the header, the login
 * page, the page footers and the preloader so the logo stays consistent
 * everywhere. By default the lamp loops (Lottie); pass `lampVideoSrc` for
 * the one-shot drawing video.
 */
export default function BrandLockup({
  className,
  asLink = false,
  lampVideoSrc,
}: BrandLockupProps) {
  return (
    <div className={`na-brand-lockup${className ? ` ${className}` : ""}`}>
      <span className="na-brand-lockup-lamp" aria-hidden="true">
        {lampVideoSrc ? (
          // biome-ignore lint/a11y/useMediaCaption: decorative logo animation, no audio
          <video
            className="na-brand-lockup-lamp-anim"
            src={lampVideoSrc}
            autoPlay
            muted
            playsInline
            preload="auto"
          />
        ) : (
          <LottieLogo
            className="na-brand-lockup-lamp-anim"
            path="/lottie/lamp.json"
            loop
          />
        )}
      </span>
      <div className="na-brand-lockup-text">
        {asLink ? (
          <Link href="/" className="na-brand-lockup-title" aria-label="Neil Avatar">
            Neil Avatar
          </Link>
        ) : (
          <span className="na-brand-lockup-title">Neil Avatar</span>
        )}
        <span className="na-brand-lockup-tagline">
          Space. Travel. Sports. Politics.
        </span>
      </div>
    </div>
  );
}
