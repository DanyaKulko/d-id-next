/* ============================================================
   DEMO GLUE JS — порт трёх маленьких клиентских поведений из src/:
     1) Starfield  (src/components/Starfield/Starfield.tsx)
     2) Marquee    (src/components/Marquee/Marquee.tsx) — бегущая строка описаний
     3) BrandLockup tagline letter-spacing fit (BrandLockup.tsx)
   Логика скопирована один-в-один, переписана с React на ванильный DOM.
   Никакого отношения к рабочему билду — файл живёт только в этой папке.
   ============================================================ */

/* ---------- 1. Starfield (точный порт canvas-анимации) ---------- */
function initStarfield(canvas) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const palette = ["#ffffff", "#9fd8ff", "#ffd9a8"];
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let stars = [], w = 0, h = 0, raf = 0, lastW = -1, lastH = -1, resizeTimer = 0;
  let shoots = [], nextShootIn = 40;

  const buildStars = () => {
    const count = Math.round((w * h) / 4200);
    stars = [];
    for (let i = 0; i < count; i++) {
      const r = Math.random() * 1.7 + 0.4;
      const speed = (Math.random() - 0.5) * 0.12 * (0.6 + r / 2);
      stars.push({
        x: Math.random() * w, y: Math.random() * h, r,
        a: Math.random() * 0.45 + 0.5,
        tw: Math.random() * 0.03 + 0.008,
        ph: Math.random() * Math.PI * 2,
        vx: speed, vy: (Math.random() - 0.5) * 0.06,
        c: palette[(Math.random() * palette.length) | 0],
      });
    }
  };
  const resize = () => {
    const nw = canvas.clientWidth, nh = canvas.clientHeight;
    w = nw; h = nh;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (nw !== lastW || Math.abs(nh - lastH) > 160 || stars.length === 0) buildStars();
    lastW = nw; lastH = nh;
  };
  const onResize = () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(resize, 160); };
  const frame = () => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < stars.length; i++) {
      const s = stars[i];
      s.ph += s.tw;
      const alpha = Math.max(0, Math.min(1, s.a + Math.sin(s.ph) * 0.45));
      if (!reduce) {
        s.x += s.vx; s.y += s.vy;
        if (s.x < 0) s.x = w; if (s.x > w) s.x = 0;
        if (s.y < 0) s.y = h; if (s.y > h) s.y = 0;
      }
      ctx.fillStyle = s.c;
      if (s.r > 1.5) {
        ctx.globalAlpha = alpha * 0.22;
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r * 3.2, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = alpha;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2); ctx.fill();
    }
    if (!reduce) {
      for (let k = shoots.length - 1; k >= 0; k--) {
        const sh = shoots[k];
        sh.x += sh.vx; sh.y += sh.vy; sh.life -= 1;
        const tx = sh.x - sh.vx * 9, ty = sh.y - sh.vy * 9;
        const grad = ctx.createLinearGradient(sh.x, sh.y, tx, ty);
        grad.addColorStop(0, "rgba(255,255,255,0.9)");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.globalAlpha = 1; ctx.strokeStyle = grad; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sh.x, sh.y); ctx.lineTo(tx, ty); ctx.stroke();
        if (sh.life <= 0 || sh.x > w + 60 || sh.y > h + 60) shoots.splice(k, 1);
      }
      if (--nextShootIn <= 0 && shoots.length < 5) {
        shoots.push({ x: Math.random() * w * 0.7, y: Math.random() * h * 0.35,
          vx: 4 + Math.random() * 3.5, vy: 1.5 + Math.random() * 2.2, life: 130 });
        nextShootIn = 70 + Math.random() * 120;
      }
    }
    ctx.globalAlpha = 1;
    if (!reduce) raf = requestAnimationFrame(frame);
  };
  resize();
  window.addEventListener("resize", onResize);
  frame();
}

/* ---------- 2. Marquee — бегущая строка (точный порт) ---------- */
function initMarquee(p) {
  const text = p.getAttribute("data-text") || p.textContent.trim();
  const speed = 56, gap = 56;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    p.textContent = text;
    return;
  }
  p.textContent = "";
  p.style.overflow = "hidden";
  p.style.whiteSpace = "nowrap";
  const track = document.createElement("span");
  track.style.display = "inline-flex";
  const a = document.createElement("span"); a.textContent = text;
  const b = document.createElement("span"); b.textContent = text; b.style.paddingLeft = gap + "px";
  track.appendChild(a); track.appendChild(b);
  p.appendChild(track);
  requestAnimationFrame(() => {
    const w = a.offsetWidth;
    if (!w) return;
    const shift = w + gap;
    track.style.setProperty("--marq-shift", shift + "px");
    track.style.animation = `na-marq ${shift / speed}s linear infinite`;
  });
}

/* ---------- 3. BrandLockup tagline letter-spacing fit (точный порт) ---------- */
function fitTagline(lockup) {
  const title = lockup.querySelector(".na-brand-lockup-title");
  const tag = lockup.querySelector(".na-brand-lockup-tagline");
  if (!title || !tag) return;
  const txt = tag.textContent || "";
  const gaps = Math.max(txt.length - 1, 1);
  const fit = () => {
    tag.style.letterSpacing = "0px";
    const titleW = title.getBoundingClientRect().width;
    const tagW = tag.getBoundingClientRect().width;
    if (titleW <= 0 || tagW <= 0) return;
    tag.style.letterSpacing = Math.max(0, (titleW - tagW) / gaps) + "px";
  };
  fit();
  new ResizeObserver(fit).observe(title);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit).catch(() => {});
  window.addEventListener("resize", fit);
}

/* ---------- bootstrap ---------- */
function initDemo() {
  document.querySelectorAll(".na-space-bg__stars").forEach(initStarfield);
  document.querySelectorAll("[data-marquee]").forEach(initMarquee);
  document.querySelectorAll(".na-brand-lockup").forEach(fitTagline);

  /* Lottie-лампа (в проде — LottieLogo с /lottie/lamp.json). */
  if (window.lottie) {
    document.querySelectorAll(".na-brand-lockup-lamp-anim").forEach((el) => {
      window.lottie.loadAnimation({
        container: el, renderer: "svg", loop: true, autoplay: true,
        path: "assets/lottie/lamp.json",
      });
    });
  }
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initDemo);
} else {
  initDemo();
}
