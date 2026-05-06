# Batch UI/UX Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apply 10 client-facing fixes to the Neil Avatar app: unify logo color, add three educational session-once tooltips, replace several static hints, extend idle timeout to 2 min, enlarge the Back-to-Roles link, and slow down STT silence detection by 1s.

**Architecture:** Mostly small file-local edits (CSS variables, constants, text). One new reusable component (`EducationalTooltip`) plus a small hook (`useShowOncePerSession`) handle the three popovers. No new dependencies, no DB migrations, no backend changes. Per-task commits on a feature branch.

**Tech Stack:** Next.js 16 + React 19 + TypeScript, Biome (lint/format), CSS modules + global CSS, Docker Compose for build/run. No test framework in the repo — verification is by `biome check`, `next build`, and manual browser smoke tests.

**Spec:** `docs/superpowers/specs/2026-05-06-batch-ui-fixes-design.md`

**File Structure:**

| File | Status | Responsibility |
|---|---|---|
| `src/app/globals.css` | Modify | `.na-logo-text` color, `.na-back-link` size/padding |
| `src/app/login/page.css` | Modify | `.na-login-title` color |
| `src/app/(client)/[avatarSlug]/_hooks/useIdleTimer.ts` | Modify | `IDLE_TIMEOUT_MS` constant |
| `src/app/(client)/[avatarSlug]/_hooks/useAzureSTT.ts` | Modify | `EndSilenceTimeoutMs` value |
| `src/app/(client)/[avatarSlug]/page.client.tsx` | Modify | replace static hint texts; wire 3 tooltips |
| `src/components/EducationalTooltip/EducationalTooltip.tsx` | Create | popover component, portal-based |
| `src/components/EducationalTooltip/EducationalTooltip.css` | Create | tooltip styling + arrow + animation |
| `src/components/EducationalTooltip/useShowOncePerSession.ts` | Create | hook gating `sessionStorage` |

---

## Task 0: Pre-work — backup & feature branch

**Files:** none (git operations only)

- [ ] **Step 1: Create safety tag on current `main`**

```bash
cd /home/ubuntu/d-id/d-id-next
git status        # confirm clean working tree (Stage2 untracked files are unrelated)
git tag backup-pre-batch-fixes-2026-05-06
git tag -l backup-pre-batch-fixes-2026-05-06   # verify tag exists
```

Expected: tag is listed.

- [ ] **Step 2: Create feature branch**

```bash
git checkout -b feat/batch-ui-fixes-2026-05-06
git branch --show-current
```

Expected: prints `feat/batch-ui-fixes-2026-05-06`.

- [ ] **Step 3: Database snapshot (precautionary, DB is not touched)**

```bash
mkdir -p ~/backups
sudo docker compose exec -T postgres pg_dump -U postgres d-id-main \
  | gzip > ~/backups/d-id-main-2026-05-06.sql.gz
ls -lh ~/backups/d-id-main-2026-05-06.sql.gz
```

Expected: file exists with non-zero size (typically a few MB).

If `pg_dump` errors with "role postgres does not exist", check `.env` for `DB_USER` and substitute. The backup is precautionary — if it fails, document the failure and proceed (no schema changes are made).

---

## Task 1: Unify logo wordmark color to `#284665`

**Files:**
- Modify: `src/app/globals.css:170-178`
- Modify: `src/app/login/page.css:36-44`

- [ ] **Step 1: Edit `globals.css`**

Replace the `.na-logo-text` block. Current code:

```css
.na-logo-text {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--na-accent-primary);
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
```

New code (only `color` line changes):

```css
.na-logo-text {
  font-size: 32px;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: #284665;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
}
```

- [ ] **Step 2: Edit `login/page.css`**

Find the `.na-login-title` rule (around line 36-44) and change `color: #fdaa2d` to `color: #284665`. There may be additional `.na-login-title` rules in mobile breakpoints (around lines 272 and 287) — verify they either inherit the new color or also use `#284665`. If a breakpoint redeclares the color, update it.

- [ ] **Step 3: Sanity-check with grep**

```bash
grep -n "fdaa2d" src/app/globals.css src/app/login/page.css
```

Expected: no matches in `.na-logo-text` or `.na-login-title` rules. Other `#fdaa2d` usages elsewhere in the file are fine — only the wordmark is being changed.

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css src/app/login/page.css
git commit -m "fix(ui): unify Neil Avatar wordmark color to #284665"
```

---

## Task 2: Idle session timeout 30s → 2 min

**Files:**
- Modify: `src/app/(client)/[avatarSlug]/_hooks/useIdleTimer.ts:3`

- [ ] **Step 1: Change the constant**

Current:

```ts
const IDLE_TIMEOUT_MS = 30000;
```

New:

```ts
const IDLE_TIMEOUT_MS = 120000;
```

- [ ] **Step 2: Verify no other places hardcode the old value**

```bash
grep -rn "30000\|IDLE_TIMEOUT" src/app/\(client\)/\[avatarSlug\]/
```

Expected: only the modified line shows the new value. No other reference.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(client\)/\[avatarSlug\]/_hooks/useIdleTimer.ts
git commit -m "fix(session): extend idle timeout from 30s to 2 min"
```

---

## Task 3: Enlarge "Back to Roles" link by 20%

**Files:**
- Modify: `src/app/globals.css:196-205`

- [ ] **Step 1: Update `.na-back-link`**

Current:

```css
.na-back-link {
  color: var(--na-accent-secondary);
  text-decoration: none;
  font-weight: 600;
  transition: all 0.2s;
}
```

New (add `font-size` and `padding`):

```css
.na-back-link {
  color: var(--na-accent-secondary);
  text-decoration: none;
  font-weight: 600;
  font-size: 1.2em;
  padding: 4px 8px;
  transition: all 0.2s;
}
```

- [ ] **Step 2: Visual sanity check at next rebuild**

(Deferred to Task 11 — no in-task verification.)

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "fix(ui): enlarge Back to Roles link by 20%"
```

---

## Task 4: STT end-silence timeout +1s

**Files:**
- Modify: `src/app/(client)/[avatarSlug]/_hooks/useAzureSTT.ts:189-192`

- [ ] **Step 1: Change end-silence values**

Current:

```ts
        speechConfig.setProperty(
          SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
          isAppleMobile ? "5000" : "3000",
        );
```

New:

```ts
        speechConfig.setProperty(
          SpeechSDK.PropertyId.SpeechServiceConnection_EndSilenceTimeoutMs,
          isAppleMobile ? "6000" : "4000",
        );
```

`InitialSilenceTimeoutMs` (line 195) and the partial-fallback timer (`partialTimerRef` 1400ms, line 244) are intentionally **not** changed.

- [ ] **Step 2: Commit**

```bash
git add src/app/\(client\)/\[avatarSlug\]/_hooks/useAzureSTT.ts
git commit -m "fix(stt): bump end-silence timeout by 1s"
```

---

## Task 5: Replace static control hints (tasks 5/6/7 from spec)

**Files:**
- Modify: `src/app/(client)/[avatarSlug]/page.client.tsx:1066-1144`

- [ ] **Step 1: Replace background-select hint (3 contextual texts)**

Locate this block (around lines 1092-1099):

```tsx
            <span className="na-control-hint">
              {!canSelectBackground
                ? "The selected role does not support background selection"
                : connectionStatus !== "connected"
                  ? 'Choose a background after clicking "Start Conversation"'
                  : "Choose a background"}
            </span>
```

Replace with:

```tsx
            <span className="na-control-hint">
              {!canSelectBackground
                ? "Background selection is not available for this role."
                : connectionStatus !== "connected"
                  ? "Background selection becomes available only after you start the conversation."
                  : "Choose a background."}
            </span>
```

- [ ] **Step 2: Replace Stop-button hint**

Locate this block (around lines 1125-1127):

```tsx
              <span className="na-control-hint">
                Click to stop a conversation with the avatar
              </span>
```

Replace with:

```tsx
              <span className="na-control-hint">
                Click Stop to exit in case you want to take an extended break.
              </span>
```

- [ ] **Step 3: Replace Interrupt-button hint**

Locate this block (around lines 1141-1143):

```tsx
            <span className="na-control-hint">
              Click if you want to interrupt the avatar
            </span>
```

Replace with:

```tsx
            <span className="na-control-hint">
              Click Interrupt if you want to move to another topic.
            </span>
```

- [ ] **Step 4: Verify no stray old text remains**

```bash
grep -E "stop a conversation with the avatar|interrupt the avatar|does not support background|after clicking \"Start" src/app/\(client\)/\[avatarSlug\]/page.client.tsx
```

Expected: no matches.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(client\)/\[avatarSlug\]/page.client.tsx
git commit -m "fix(ui): rewrite static hints under bg/stop/interrupt controls"
```

---

## Task 6: Create `useShowOncePerSession` hook

**Files:**
- Create: `src/components/EducationalTooltip/useShowOncePerSession.ts`

- [ ] **Step 1: Write the hook**

```ts
import { useCallback, useState } from "react";

type UseShowOncePerSessionResult = {
  show: boolean;
  trigger: () => void;
  close: () => void;
};

export function useShowOncePerSession(
  key: string,
): UseShowOncePerSessionResult {
  const [show, setShow] = useState(false);

  const trigger = useCallback(() => {
    if (typeof window === "undefined") return;
    if (window.sessionStorage.getItem(key) === "1") return;
    window.sessionStorage.setItem(key, "1");
    setShow(true);
  }, [key]);

  const close = useCallback(() => setShow(false), []);

  return { show, trigger, close };
}
```

- [ ] **Step 2: Lint check (one-off via ephemeral container)**

```bash
sudo docker compose exec app sh -c "test -f /app/node_modules/.bin/biome" 2>/dev/null \
  || echo "biome not in runner container — will validate via final next build instead"
```

Biome lives in `devDependencies` and is not present in the standalone runtime image. Validation deferred to Task 11's `next build`.

- [ ] **Step 3: Commit**

```bash
git add src/components/EducationalTooltip/useShowOncePerSession.ts
git commit -m "feat(tooltip): add useShowOncePerSession hook"
```

---

## Task 7: Create `EducationalTooltip` component

**Files:**
- Create: `src/components/EducationalTooltip/EducationalTooltip.tsx`
- Create: `src/components/EducationalTooltip/EducationalTooltip.css`

- [ ] **Step 1: Write the component**

```tsx
"use client";

import {
  type RefObject,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import "./EducationalTooltip.css";

type Position = "top" | "bottom";

type EducationalTooltipProps = {
  anchorRef: RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  position?: Position;
  autoDismissMs?: number;
  children: React.ReactNode;
};

const TOOLTIP_GAP_PX = 10;
const VIEWPORT_MARGIN_PX = 12;
const DEFAULT_AUTO_DISMISS_MS = 10000;

export default function EducationalTooltip({
  anchorRef,
  open,
  onClose,
  position = "bottom",
  autoDismissMs = DEFAULT_AUTO_DISMISS_MS,
  children,
}: EducationalTooltipProps) {
  const [mounted, setMounted] = useState(false);
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    width: number;
    actualPosition: Position;
  } | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const recompute = useCallback(() => {
    const anchor = anchorRef.current;
    const tip = tooltipRef.current;
    if (!anchor || !tip) return;
    const a = anchor.getBoundingClientRect();
    const tipH = tip.offsetHeight;
    const tipW = tip.offsetWidth;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - a.bottom;
    const spaceAbove = a.top;
    const wantBottom = position === "bottom";
    const flipsToTop =
      wantBottom && spaceBelow < tipH + TOOLTIP_GAP_PX + VIEWPORT_MARGIN_PX
        ? spaceAbove > spaceBelow
        : !wantBottom;
    const actualPosition: Position = flipsToTop ? "top" : "bottom";

    const top =
      actualPosition === "bottom"
        ? a.bottom + TOOLTIP_GAP_PX
        : a.top - tipH - TOOLTIP_GAP_PX;

    let left = a.left + a.width / 2 - tipW / 2;
    left = Math.max(VIEWPORT_MARGIN_PX, left);
    left = Math.min(vw - tipW - VIEWPORT_MARGIN_PX, left);

    setCoords({ top, left, width: tipW, actualPosition });
  }, [anchorRef, position]);

  useLayoutEffect(() => {
    if (!open) return;
    recompute();
    const handler = () => recompute();
    window.addEventListener("scroll", handler, { passive: true, capture: true });
    window.addEventListener("resize", handler, { passive: true });
    return () => {
      window.removeEventListener("scroll", handler, { capture: true } as EventListenerOptions);
      window.removeEventListener("resize", handler);
    };
  }, [open, recompute]);

  useEffect(() => {
    if (!open) return;
    if (!autoDismissMs || autoDismissMs <= 0) return;
    const id = window.setTimeout(onClose, autoDismissMs);
    return () => window.clearTimeout(id);
  }, [open, autoDismissMs, onClose]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  const style: React.CSSProperties = coords
    ? { top: coords.top, left: coords.left, visibility: "visible" }
    : { top: -9999, left: -9999, visibility: "hidden" };

  const dataPosition = coords?.actualPosition ?? position;

  return createPortal(
    <div
      ref={tooltipRef}
      className="na-edu-tooltip"
      data-position={dataPosition}
      style={style}
      role="status"
      aria-live="polite"
    >
      <button
        type="button"
        className="na-edu-tooltip__close"
        onClick={onClose}
        aria-label="Close tooltip"
      >
        ×
      </button>
      <div className="na-edu-tooltip__body">{children}</div>
      <span className="na-edu-tooltip__arrow" aria-hidden="true" />
    </div>,
    document.body,
  );
}
```

- [ ] **Step 2: Write the CSS**

```css
.na-edu-tooltip {
  position: fixed;
  z-index: 10000;
  max-width: clamp(260px, 80vw, 360px);
  padding: 12px 36px 12px 14px;
  background: var(--na-bg-surface);
  color: var(--na-text-on-light);
  border: 2px solid var(--na-accent-secondary-soft);
  border-radius: var(--na-radius-md);
  box-shadow: var(--na-shadow-soft);
  font-family: var(--na-font-family);
  font-size: 18px;
  line-height: 1.35;
  animation: naEduTooltipFadeIn 200ms ease-out both;
}

.na-edu-tooltip__body {
  white-space: normal;
}

.na-edu-tooltip__close {
  position: absolute;
  top: 4px;
  right: 6px;
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 0;
  padding: 0;
  font-size: 20px;
  line-height: 1;
  color: var(--na-text-on-light);
  cursor: pointer;
  border-radius: 4px;
}

.na-edu-tooltip__close:hover {
  background: rgba(40, 70, 101, 0.08);
}

.na-edu-tooltip__close:focus-visible {
  outline: 2px solid var(--na-accent-secondary);
  outline-offset: 2px;
}

.na-edu-tooltip__arrow {
  position: absolute;
  width: 14px;
  height: 14px;
  background: var(--na-bg-surface);
  border-left: 2px solid var(--na-accent-secondary-soft);
  border-top: 2px solid var(--na-accent-secondary-soft);
  transform: rotate(45deg);
  left: 50%;
  margin-left: -7px;
}

.na-edu-tooltip[data-position="bottom"] .na-edu-tooltip__arrow {
  top: -8px;
}

.na-edu-tooltip[data-position="top"] .na-edu-tooltip__arrow {
  bottom: -8px;
  transform: rotate(225deg);
}

@keyframes naEduTooltipFadeIn {
  from {
    opacity: 0;
    transform: translateY(-4px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 480px) {
  .na-edu-tooltip {
    font-size: 16px;
    padding: 10px 32px 10px 12px;
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/EducationalTooltip/EducationalTooltip.tsx \
        src/components/EducationalTooltip/EducationalTooltip.css
git commit -m "feat(tooltip): add EducationalTooltip portal component"
```

---

## Task 8: Wire tooltip — Language select (viewport trigger)

**Files:**
- Modify: `src/app/(client)/[avatarSlug]/page.client.tsx`

- [ ] **Step 1: Add imports near the top of the file**

Find the existing import block (lines 1-30 area). Add these imports after the other component imports:

```tsx
import EducationalTooltip from "@/components/EducationalTooltip/EducationalTooltip";
import { useShowOncePerSession } from "@/components/EducationalTooltip/useShowOncePerSession";
```

- [ ] **Step 2: Add a ref + viewport effect inside the component**

Inside the `AvatarPageClient` component body (defined at line 79), near the other `useState`/`useRef` declarations (after `const [language, setLanguage]` at line 127), add:

```tsx
const languageSelectRef = useRef<HTMLSelectElement | null>(null);
const langTip = useShowOncePerSession("na.tip.lang");

useEffect(() => {
  const el = languageSelectRef.current;
  if (!el || typeof IntersectionObserver === "undefined") return;
  const observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0];
      if (entry?.isIntersecting && entry.intersectionRatio >= 0.5) {
        langTip.trigger();
        observer.disconnect();
      }
    },
    { threshold: 0.5 },
  );
  observer.observe(el);
  return () => observer.disconnect();
}, [langTip.trigger]);
```

- [ ] **Step 3: Attach ref to the language `<select>` and render tooltip**

Locate the language `<select>` (around line 1037-1065) — it has `className="na-language-select"` and is the first one (the second `na-language-select` is for backgrounds). Add `ref={languageSelectRef}`:

```tsx
            <select
              ref={languageSelectRef}
              className="na-language-select"
              value={language}
              onChange={(e) => {
                ...
              }}
            >
```

Then immediately after the closing `</select>` of the language picker (and after the existing `<span className="na-control-hint">`), but **inside the same `<div className="na-control-group">`** — actually the tooltip is portaled, so it can sit anywhere in JSX. Place it right after the `</span>` for readability:

```tsx
            <span className="na-control-hint">
              Click the &quot;English&quot; button to reveal other available
              languages
            </span>
            <EducationalTooltip
              anchorRef={languageSelectRef}
              open={langTip.show}
              onClose={langTip.close}
              position="bottom"
            >
              After you select a language, questions below remain in English.
              You must ask questions in the language you selected for the Avatar
              to speak in the same language.
            </EducationalTooltip>
```

- [ ] **Step 4: Verify ref types compile**

The `useRef<HTMLSelectElement | null>(null)` matches `<select>`. If the TS narrows incorrectly, double-check that no other ref is assigned to the same select.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(client\)/\[avatarSlug\]/page.client.tsx
git commit -m "feat(tooltip): wire language-select educational tooltip"
```

---

## Task 9: Wire tooltip — Interrupt button (state-based trigger)

**Files:**
- Modify: `src/app/(client)/[avatarSlug]/page.client.tsx`

- [ ] **Step 1: Add ref + effect near the language-tip code**

Right after the language-tip state from Task 8, add:

```tsx
const interruptBtnRef = useRef<HTMLButtonElement | null>(null);
const interruptTip = useShowOncePerSession("na.tip.interrupt");

useEffect(() => {
  if (agentStatus === "speaking") interruptTip.trigger();
}, [agentStatus, interruptTip.trigger]);
```

`agentStatus` is already declared in the file (search for `setAgentStatus`). It transitions to `"speaking"` when the avatar starts replying — exactly when the Interrupt button becomes meaningful.

- [ ] **Step 2: Attach ref to Interrupt button + render tooltip**

Locate the Interrupt button (around line 1132-1140). Add `ref={interruptBtnRef}`:

```tsx
            <button
              ref={interruptBtnRef}
              type={"button"}
              className="na-btn na-btn--interrupt"
              id="interruptBtn"
              onClick={handleInterrupt}
              disabled={agentStatus !== "speaking"}
            >
              ⏸️ Interrupt Neil Avatar
            </button>
```

Add tooltip right after the existing `<span className="na-control-hint">` for the Interrupt button:

```tsx
            <span className="na-control-hint">
              Click Interrupt if you want to move to another topic.
            </span>
            <EducationalTooltip
              anchorRef={interruptBtnRef}
              open={interruptTip.show}
              onClose={interruptTip.close}
              position="top"
            >
              Ask another question — the Avatar will start replying. The
              Interrupt button keeps Avatar on line.
            </EducationalTooltip>
```

`position="top"` because the Interrupt button sits at the bottom of the controls row — no room below.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(client\)/\[avatarSlug\]/page.client.tsx
git commit -m "feat(tooltip): wire interrupt-button educational tooltip"
```

---

## Task 10: Wire tooltip — Start Conversation (post-click trigger)

**Files:**
- Modify: `src/app/(client)/[avatarSlug]/page.client.tsx`

- [ ] **Step 1: Add ref + hook + auto-close effect near the other tooltip declarations**

```tsx
const startBtnRef = useRef<HTMLButtonElement | null>(null);
const startTip = useShowOncePerSession("na.tip.start");

useEffect(() => {
  if (connectionStatus === "connected") startTip.close();
}, [connectionStatus, startTip.close]);
```

The effect closes the tooltip the moment the connection succeeds (the Start button is replaced by Stop, so the anchor disappears). Auto-dismiss after 10s is the fallback if connection never establishes.

- [ ] **Step 2: Trigger tooltip from the click handler**

`handleRestart` is defined at line 622 as a plain `async () =>` arrow (not memoized). To avoid touching its body, wrap at the JSX level via `onClick`. Apply ONLY on the Start button — the JSX block at lines 1101-1114 (the `connectionStatus !== "connected"` branch). Do not modify the Stop branch (lines 1115-1129). Replace the Start button JSX:

```tsx
              <button
                ref={startBtnRef}
                type={"button"}
                className="na-btn na-btn--primary"
                id="startBtn"
                onClick={() => {
                  startTip.trigger();
                  handleRestart();
                }}
              >
                🎤 Start Conversation
              </button>
```

- [ ] **Step 3: Render the tooltip**

Inside the same `<div className="na-control-group">` containing the Start button (around lines 1101-1114), add right after the existing `<span className="na-control-hint">`:

```tsx
              <span className="na-control-hint">
                Click &quot;Start Conversation&quot; to begin a session
              </span>
              <EducationalTooltip
                anchorRef={startBtnRef}
                open={startTip.show}
                onClose={startTip.close}
                position="top"
              >
                When you click Start Conversation, it takes about 20 seconds for
                the Avatar to come alive. Be patient.
              </EducationalTooltip>
```

The component handles anchor unmount via the `MutationObserver` — when the connection succeeds and the JSX swaps Start → Stop, the tooltip auto-closes. Auto-dismiss after 10s also catches users who never connect.

- [ ] **Step 4: Commit**

```bash
git add src/app/\(client\)/\[avatarSlug\]/page.client.tsx
git commit -m "feat(tooltip): wire start-conversation educational tooltip"
```

---

## Task 11: Build, deploy, and smoke-verify everything

**Files:** none (build + manual QA)

- [ ] **Step 1: Rebuild the app container**

```bash
cd /home/ubuntu/d-id/d-id-next
sudo docker compose build --no-cache app
```

Expected: build completes without TypeScript errors. If `next build` fails, the error log identifies the offending file. The build runs `tsc` and Biome internally.

- [ ] **Step 2: Restart the container**

```bash
sudo docker compose up -d app
sudo docker compose ps
```

Expected: `d-id_next` is `running` and healthy.

- [ ] **Step 3: Tail logs for runtime errors**

```bash
sudo docker compose logs app --since 2m
```

Expected: no unhandled exceptions, "ready in" log line present.

- [ ] **Step 4: Smoke test — Task 1 (logo color)**

In a browser, open:
- `https://neilavatar.com/`
- `https://neilavatar.com/<any-avatar-slug>`
- `https://neilavatar.com/login`

In each, the "Neil Avatar" wordmark must render in dark blue (`#284665`), not orange.

- [ ] **Step 5: Smoke test — Task 8 (idle timeout)**

Open `https://neilavatar.com/<avatar>`, click Start Conversation, wait for connection, then stay silent.
- At 90s: session must still be alive.
- At ~120-130s: "Session Timed Out" appears.

- [ ] **Step 6: Smoke test — Tasks 5/6/7 (static hints)**

On `<avatar>` page:
- Background select shows the new "Background selection becomes available only after you start the conversation." text before connection.
- After connection, it shows "Choose a background." (or the not-supported variant if applicable).
- Stop button hint: "Click Stop to exit in case you want to take an extended break."
- Interrupt button hint: "Click Interrupt if you want to move to another topic."

- [ ] **Step 7: Smoke test — Task 4 (Start tooltip)**

Open `<avatar>` in a fresh **incognito** window. Click Start Conversation. Tooltip "When you click Start Conversation..." appears immediately. Closes when Stop replaces Start, or after 10s. Reload the page — tooltip does NOT reappear (sessionStorage). Open new incognito → tooltip appears again.

- [ ] **Step 8: Smoke test — Task 2 (Language tooltip)**

Same fresh incognito window: language select tooltip ("After you select a language...") appears within ~1s of the controls scrolling into view (or on initial render if already visible). Reload → does not reappear.

- [ ] **Step 9: Smoke test — Task 3 (Interrupt tooltip)**

After Start, ask the avatar a question. The first time the avatar starts replying, the Interrupt tooltip appears anchored to the Interrupt button. Subsequent replies in the same tab do not retrigger.

- [ ] **Step 10: Smoke test — Task 9 (Back link)**

`<avatar>` page → "← Back to Roles" link is visibly larger than before. On a phone viewport, the tap target is comfortable.

- [ ] **Step 11: Smoke test — Task 10 (STT pause tolerance)**

Click Start, wait for connection, then ask: "What is..." [pause 2 seconds] "...your favorite color?" The system should send the **complete** sentence to the avatar, not split it. Verify on at least one non-Apple browser. iOS Safari verification is a plus but not required.

- [ ] **Step 12: Merge to `main`**

If all smoke tests pass:

```bash
git checkout main
git merge --no-ff feat/batch-ui-fixes-2026-05-06 \
  -m "Merge feat/batch-ui-fixes-2026-05-06: 10 client-facing fixes"
git log --oneline -15
```

If anything fails, do NOT merge. Fix on the feature branch and re-run Steps 1-11.

- [ ] **Step 13: Re-deploy from `main`**

```bash
sudo docker compose build --no-cache app
sudo docker compose up -d app
sudo docker compose logs app --since 2m
```

- [ ] **Step 14: Cleanup**

The branch can stay for now. The `backup-pre-batch-fixes-2026-05-06` git tag is the rollback anchor — if production breaks, `git reset --hard backup-pre-batch-fixes-2026-05-06 && rebuild`.

---

## Rollback procedure (only if production breaks)

```bash
cd /home/ubuntu/d-id/d-id-next
git reset --hard backup-pre-batch-fixes-2026-05-06
sudo docker compose build --no-cache app
sudo docker compose up -d app
```

DB rollback (only if needed, which is unlikely — these tasks don't touch DB):

```bash
gunzip -c ~/backups/d-id-main-2026-05-06.sql.gz \
  | sudo docker compose exec -T postgres psql -U postgres d-id-main
```

---

## Out of scope

Task 11 from the original requirements (self-hosted SMTP for 2FA on `neilavatar.com`) is **not** in this plan. Findings from the spec investigation:
- AWS EC2 (us-east-2), public IP `18.191.148.95`, port 25 outbound is blocked.
- Path forward will require either an AWS unblock-25 request (often denied) or an SES smarthost relay — to be discussed with the user before planning.
