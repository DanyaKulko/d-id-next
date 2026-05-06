# Batch UI/UX Fixes — Design Document

**Date:** 2026-05-06
**Branch:** `feat/batch-ui-fixes-2026-05-06`
**Scope:** 10 client-facing fixes on the Neil Avatar site (tasks 1–10). Task 11 (self-hosted SMTP) is deferred and tracked separately.

## Goals

Polish the client-facing avatar experience: make the brand color consistent, add three educational one-time tooltips, replace several static hint texts, extend the idle session timeout, enlarge a small navigation link, and slow down speech-end detection so users have more thinking time mid-question.

## Non-goals

- No DB schema changes, no Prisma migrations.
- No backend/API behavior changes (besides the idle timeout constant on the client).
- No SMTP / 2FA email migration (deferred to a follow-up).
- No new dependencies in `package.json`.

## Pre-work: backup

Before any code change:

```bash
git tag backup-pre-batch-fixes-2026-05-06
git checkout -b feat/batch-ui-fixes-2026-05-06
docker compose exec -T postgres pg_dump -U postgres d-id-main \
  | gzip > ~/backups/d-id-main-2026-05-06.sql.gz
```

The DB dump is precautionary only — none of these tasks touch the database.

---

## Task 1 — Unify "Neil Avatar" logo color to `#284665`

The text logo currently uses the orange brand accent (`var(--na-accent-primary)` = `#fdaa2d`). Switch to the dark blue `#284665` everywhere the wordmark appears.

**Changes:**

| File | Line | Selector | Before | After |
|---|---|---|---|---|
| `src/app/globals.css` | 174 | `.na-logo-text` | `color: var(--na-accent-primary)` | `color: #284665` |
| `src/app/login/page.css` | 40 | `.na-login-title` | `color: #fdaa2d` | `color: #284665` |

Verify mobile breakpoints in `login/page.css` (lines 272, 287) inherit the new color or override it consistently.

The Lottie animated logo (`/lottie/neil-logo.json` — used in footer/preloader) is not affected — it is a separate asset and the user only requested the wordmark text be unified.

---

## Task 2, 3, 4 — Educational tooltips (one-time per session)

A new reusable `EducationalTooltip` component shows a popover next to a control, once per browser-session, to teach the user something non-obvious. Three integrations.

### Component: `EducationalTooltip`

**Location:**
```
src/components/EducationalTooltip/
  EducationalTooltip.tsx
  EducationalTooltip.css
  useShowOncePerSession.ts
```

**API:**

```tsx
type EducationalTooltipProps = {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  position?: "bottom" | "top";   // default "bottom", auto-flips when off-screen
  autoDismissMs?: number;        // default 10_000
  children: React.ReactNode;
};
```

**Behavior:**
- Renders via `createPortal(document.body)` so parent `overflow:hidden` does not clip.
- Positioned by reading `anchorRef.current.getBoundingClientRect()` on open and on `scroll`/`resize` (passive listeners).
- Default placement: directly below the anchor with a small gap (8px) and arrow pointing up. If there is not enough room below the viewport, flip to `position: top`.
- Adaptive width: `max-width: clamp(260px, 80vw, 360px)`. On narrow viewports the tooltip clamps to viewport width with a 12px side margin.
- Close X button in the top-right corner.
- Auto-dismiss after `autoDismissMs` (default 10s).
- `Escape` key closes it.
- Click outside does **not** close (this is an instructional popover, not a menu).
- Fade-in animation (~200ms ease-out).
- Visual style: white background (`var(--na-bg-surface)`), `2px` border in `var(--na-accent-secondary-soft)`, brand-blue arrow, `border-radius: var(--na-radius-md)`, soft shadow `var(--na-shadow-soft)`. Body text: `font-size: 18px`, `line-height: 1.35`, `color: var(--na-text-on-light)`, padding `12px 36px 12px 14px` (extra right padding leaves room for the close X).
- Accessibility: `role="status"`, `aria-live="polite"`, focus ring on close button.

### Hook: `useShowOncePerSession(key: string)`

```ts
function useShowOncePerSession(key: string): {
  show: boolean;
  trigger: () => void;
  close: () => void;
};
```

- `trigger()` — if `sessionStorage[key]` is unset: marks it `"1"` and sets `show=true`. Otherwise no-op.
- `close()` — sets `show=false`. The session flag stays set, so the tooltip will not reappear on this session.
- SSR-safe (`typeof window` check before touching `sessionStorage`).

### Integration in `[avatarSlug]/page.client.tsx`

Three independent tooltip instances. Each controlled by its own `useShowOncePerSession` hook + a small effect that calls `trigger()` at the right moment.

| # | Anchor | Trigger condition | sessionStorage key | Text |
|---|---|---|---|---|
| 2 | Language `<select>` | First time the element enters viewport ≥50% (`IntersectionObserver`) | `na.tip.lang` | "After you select a language, questions below remain in English. You must ask questions in the language you selected for the Avatar to speak in the same language." |
| 3 | `#interruptBtn` | First time `agentStatus === "speaking"` (button just became enabled) | `na.tip.interrupt` | "Ask another question — the Avatar will start replying. The Interrupt button keeps Avatar on line." |
| 4 | `#startBtn` | Inside `handleRestart`, immediately after the user clicks Start Conversation | `na.tip.start` | "When you click Start Conversation, it takes about 20 seconds for the Avatar to come alive. Be patient." |

**Trigger 4 details:** since the Start button is replaced by Stop after connection, the tooltip's anchor disappears once `connectionStatus === "connected"`. Either auto-dismiss after 10s, or dismiss when the anchor element is unmounted (whichever first). The component should clean up its portal node on `anchorRef.current === null`.

The existing static hint under the language select (*"Click the 'English' button to reveal other available languages"*) **stays as-is** — it explains how to use the dropdown, while the educational tooltip explains the language-behavior caveat. Different information, both kept.

---

## Task 5, 6, 7 — Replace static control hints

All edits in `[avatarSlug]/page.client.tsx` lines 1066–1143 (the `na-control-hint` `<span>` text inside each `na-control-group`).

| # | Control | Condition | Before | After |
|---|---|---|---|---|
| 5a | Background `<select>` | role does not support backgrounds | "The selected role does not support background selection" | "Background selection is not available for this role." |
| 5b | Background `<select>` | `connectionStatus !== "connected"` | "Choose a background after clicking 'Start Conversation'" | "Background selection becomes available only after you start the conversation." |
| 5c | Background `<select>` | active session, can pick | "Choose a background" | "Choose a background." |
| 6 | Stop button (visible when connected) | — | "Click to stop a conversation with the avatar" | "Click Stop to exit in case you want to take an extended break." |
| 7 | Interrupt button | — | "Click if you want to interrupt the avatar" | "Click Interrupt if you want to move to another topic." |

The Start Conversation hint ("Click 'Start Conversation' to begin a session") and the Language hint stay unchanged.

---

## Task 8 — Idle session timeout 30s → 2 minutes

`src/app/(client)/[avatarSlug]/_hooks/useIdleTimer.ts` line 3:

```ts
// before
const IDLE_TIMEOUT_MS = 30000;
// after
const IDLE_TIMEOUT_MS = 120000;
```

This is the only change. The idle timer is reset on every user transcript (`resetTimer()` call inside `sendTranscript`), so an active conversation does not time out. The 2-minute window is now silence-after-last-message before the session is force-closed and "Session Timed Out" is shown.

---

## Task 9 — Enlarge "Back to Roles" link by 20%

`src/app/globals.css`, the `.na-back-link` rule starting at line 196:

```css
.na-back-link {
  color: var(--na-accent-secondary);
  text-decoration: none;
  font-weight: 600;
  font-size: 1.2em;     /* +20% (was inherited 1em / 16px) */
  padding: 4px 8px;     /* larger tap target on mobile */
  transition: all 0.2s;
}
```

The `padding` is added so the link has a slightly larger hit area — the user mentioned "small button" specifically; the typical interpretation includes both visual size and touch ergonomics. The padding is small enough not to disturb the existing header layout (the link sits in `.na-header-content` with `align-items: center`, so 4-8px of padding does not push siblings).

---

## Task 10 — STT silence detection +1s

`src/app/(client)/[avatarSlug]/_hooks/useAzureSTT.ts` lines 189–192:

```ts
speechConfig.setProperty(
  SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
  isAppleMobile ? "6000" : "4000",   // was "5000" / "3000"
);
```

**Unchanged:**
- `InitialSilenceTimeoutMs` (15000 / 30000) — this is the time-to-first-utterance, not the in-utterance pause that the user complained about.
- `partialTimerRef` fallback (1400ms) — secondary safety net that fires if Azure does not finalize a partial. Per user decision, kept at 1400ms.

---

## Out-of-scope (Task 11)

Self-hosted SMTP for 2FA on the `neilavatar.com` domain is deferred. The investigation produced these findings, which we will need when we revisit:

- The host is **AWS EC2** (`us-east-2`, public IP `18.191.148.95`).
- Outbound port 25 is blocked by AWS by default (timeout test confirmed).
- A self-hosted Postfix would either need an AWS request to lift the port-25 restriction (often denied) or a smarthost relay through AWS SES / Mailgun / etc.
- The app already integrates `nodemailer` (`src/lib/email/smtp.ts`) and currently uses SendPulse SMTP. Migration is a `.env` swap once the new SMTP endpoint is configured.

---

## Implementation order

Tasks are independent and can be implemented in any order, but a logical sequencing minimizes review surface per commit:

1. Task 1 (logo color) — pure CSS.
2. Task 8 (idle timeout) — one constant.
3. Task 9 (back link) — pure CSS.
4. Task 10 (STT timeout) — two number changes.
5. Task 5/6/7 (static hint replacements) — text-only edits in `page.client.tsx`.
6. Build the `EducationalTooltip` component + `useShowOncePerSession` hook.
7. Wire tooltips for tasks 2, 3, 4 in `page.client.tsx` (separate commits per integration).

One commit per task for traceability.

## Deployment

After all tasks merge to `main`:

```bash
sudo docker compose build --no-cache app
sudo docker compose up -d app
sudo docker compose logs app --since 2m
```

Then verify the Test Plan below in production with a fresh incognito window.

## Test plan

| Task | Verification |
|---|---|
| 1 | Open `/`, `/<avatar>`, `/login` — every "Neil Avatar" wordmark renders in `#284665`. |
| 2 | Open `/<avatar>` in incognito → language select tooltip appears. Reload → does not reappear. Open new incognito window → tooltip appears again. |
| 3 | Start a conversation, ask a question → on first agent reply the Interrupt tooltip appears once. |
| 4 | Click Start Conversation → tooltip appears immediately. Auto-dismisses after 10s or when the Stop button replaces it. |
| 5 | Switch between roles to hit each of the 3 background-select states. Verify each new text. |
| 6 | Connected state → Stop button hint shows new text. |
| 7 | Interrupt button hint shows new text in all states. |
| 8 | Start session, fall silent 90s — session stays alive. After ~120-130s, Session Timed Out triggers. |
| 9 | Compare `Back to Roles` link size desktop + mobile. Tap target should feel ~20% larger. |
| 10 | Speak a question with a 2-3s mid-sentence pause — STT does not cut off prematurely. Tested on at least one non-Apple browser. iOS Safari verification optional but recommended. |

## Risks

- **Tooltip positioning edge case:** very short viewports on mobile may not have room either above or below — fall back to overlaying the anchor with the tooltip pinned to the viewport top. Verify on iPhone SE width.
- **Idle timeout perception:** users on the old behavior may now feel the session "lingers" after they leave. Acceptable per requirement (D-ID cost is the constraint, 2 min is the target).
- **STT change:** +1s on a high-end mic may feel slow in some demos. If users push back, narrow the bump (e.g., 3500ms instead of 4000ms) — single-line change.
