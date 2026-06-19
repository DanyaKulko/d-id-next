import Starfield from "@/components/Starfield/Starfield";
import "./SpaceBackground.css";

/**
 * Fixed full-viewport space backdrop for the 3.0 reskin.
 * Layers (back to front): deep-navy wash + ambient brand glows, faint HUD grid
 * with vignette mask, and the animated starfield canvas on top.
 *
 * position: fixed; inset: 0 so it also covers iOS overscroll (no white flash).
 * Sits behind all page content (z-index 0); content stacks above via the theme
 * wrapper which establishes its own stacking context.
 */
export default function SpaceBackground() {
  return (
    <div className="na-space-bg" aria-hidden="true">
      <div className="na-space-bg__nebula" />
      <div className="na-space-bg__grid" />
      <Starfield className="na-space-bg__stars" />
    </div>
  );
}
