import Link from "next/link";
import LottieLogo from "@/components/LottieLogo/LottieLogo";
import "./BrandLockup.css";

type BrandLockupProps = {
  /** Extra class on the outer container (e.g. for spacing/alignment). */
  className?: string;
  /** Render the wordmark as a link to the home page (used in the header). */
  asLink?: boolean;
  /** Override the lamp Lottie animation path (default: the looping lamp). */
  lampPath?: string;
  /** Whether the lamp animation loops (default: true). */
  lampLoop?: boolean;
};

/**
 * Brand lockup: lamp animation on the left, stacked "Neil Avatar"
 * wordmark + tagline on the right. Shared across the header, the login
 * page, the page footers and the preloader so the logo stays consistent
 * everywhere. The lamp loops by default; the preloader passes the one-shot
 * "drawing" lamp via `lampPath` + `lampLoop={false}`.
 */
export default function BrandLockup({
  className,
  asLink = false,
  lampPath = "/lottie/lamp.json",
  lampLoop = true,
}: BrandLockupProps) {
  return (
    <div className={`na-brand-lockup${className ? ` ${className}` : ""}`}>
      <span className="na-brand-lockup-lamp" aria-hidden="true">
        <LottieLogo
          className="na-brand-lockup-lamp-anim"
          path={lampPath}
          loop={lampLoop}
        />
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
