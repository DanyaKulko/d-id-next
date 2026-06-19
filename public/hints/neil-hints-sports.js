/**
 * Neil Avatar — Hints Panel [Sports]
 * <script src="neil-hints-sports.js"></script> before closing </body>
 */
(function () {
  "use strict";

  var QUESTIONS = [
    "What sport do you love the most?",
    "How often do you go to baseball stadiums?",
    "What do you think about European football (soccer)?",
    "Have you ever been to FIFA World Cups?",
    "What is your opinion of ice hockey?",
    "Do you follow professional basketball (NBA)?",
    "Do you watch American football (NFL)?",
    "Do you watch cricket?",
    "Do you have a favorite modern player?",
    "Do you attend horse races?",
    "Have you ever played golf?",
    "Which sporting event impressed you most with its atmosphere?",
    "What is your favorite tradition at sports stadiums?",
    "Do you have a special place to watch sports?",
    "Do you like cycling?"
];

  var TITLE_CLOSED = "Click to open sample questions";
  var TITLE_OPEN   = "Sample questions you can ask";

  /* === CSS === */
  var style = document.createElement("style");
  style.textContent = `
    @font-face {
      font-family: 'Nasalization';
      src: url('https://neilavatar.com/_next/static/media/Nasalization_regular-s.p.d7c1b2c2.otf') format('opentype');
      font-weight: normal;
      font-style: normal;
      font-display: swap;
    }

    #na-hints-root {
      position: fixed; bottom: 0; left: 0; right: 0; z-index: 9999;
      font-family: "Nasalization", system-ui, -apple-system, sans-serif;
      display: flex; justify-content: center; pointer-events: none;
    }

    #na-hints-card {
      pointer-events: all; width: 100%; max-width: 1200px; margin: 0 24px;
      background: #122339; border-radius: 15px 15px 0 0;
      box-shadow: 0 -8px 40px rgba(0,0,0,0.5); overflow: hidden;
      transition: max-height 0.38s cubic-bezier(0.4,0,0.2,1);
      max-height: 52px;
    }
    #na-hints-card.na-expanded { max-height: 320px; }

    #na-hints-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 0 20px; height: 52px; cursor: pointer; user-select: none;
      background: linear-gradient(90deg, #284665 0%, #4A9CD0 100%);
    }
    #na-hints-header:hover { filter: brightness(1.1); }

    .na-hints-header-left { display: flex; align-items: center; }

    .na-hints-header-title {
      font-size: 19px; font-weight: 700; color: #FFFFFF;
      letter-spacing: 0.02em; text-shadow: 0 1px 3px rgba(0,0,0,0.2);
      white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }

    /* Tablet: title 10% smaller (mobile handled in the 600px block). */
    @media (min-width: 601px) and (max-width: 1366px) {
      .na-hints-header-title { font-size: 17.1px; }
    }

    #na-hints-chevron {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; margin-left: 12px;
      background: rgba(255,255,255,0.2); display: flex;
      align-items: center; justify-content: center;
      transition: transform 0.3s ease, background 0.2s;
    }
    #na-hints-card.na-expanded #na-hints-chevron {
      transform: rotate(180deg); background: rgba(255,255,255,0.3);
    }
    #na-hints-chevron svg { display: block; }

    #na-hints-body {
      padding: 10px 16px 12px; background: #122339;
      overflow-y: auto; max-height: 268px;
    }
    #na-hints-body::-webkit-scrollbar { width: 5px; }
    #na-hints-body::-webkit-scrollbar-track { background: rgba(255,255,255,0.04); }
    #na-hints-body::-webkit-scrollbar-thumb { background: rgba(77,177,221,0.35); border-radius: 4px; }

    /* Desktop list — 3 columns */
    #na-hints-list {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px;
    }

    .na-hints-q {
      display: flex; align-items: flex-start; gap: 8px;
      background: rgba(255,255,255,0.04); border: 1.5px solid rgba(77,177,221,0.22);
      border-radius: 10px; padding: 7px 11px; cursor: default;
      transition: background 0.15s, border-color 0.15s, transform 0.15s;
      text-align: left;
    }
    .na-hints-q:hover {
      background: rgba(77,177,221,0.12); border-color: #4DB1DD;
      transform: translateY(-2px); box-shadow: 0 4px 14px rgba(74,156,208,0.18);
    }
    .na-hints-q-icon {
      flex-shrink: 0; width: 22px; height: 22px;
      background: linear-gradient(135deg, #284665, #4A9CD0);
      border-radius: 50%; display: flex; align-items: center;
      justify-content: center; font-size: 11px; margin-top: 2px;
    }
    .na-hints-q-text {
      font-size: 19px; font-weight: 600; color: #d8e3f2; line-height: 1.35;
    }

    /* Mobile carousel */
    #na-hints-mobile-carousel {
      display: none; grid-template-columns: 1fr 1fr; gap: 5px;
      transition: opacity 0.35s ease;
    }
    #na-hints-mobile-carousel .na-hints-q { cursor: pointer; }
    #na-hints-mobile-carousel .na-hints-q:active { transform: scale(0.98); }

    #na-hints-footer {
      margin-top: 8px; font-size: 19px; color: rgba(216,227,242,0.5); text-align: center;
    }

    /* === Mobile === */
    @media (max-width: 600px) {
      #na-hints-card          { margin: 0 4px; border-radius: 12px 12px 0 0; max-height: calc(46px + env(safe-area-inset-bottom,0px)); padding-bottom: env(safe-area-inset-bottom,0px); }
      #na-hints-card.na-expanded { max-height: calc(33vh + env(safe-area-inset-bottom,0px)); }
      #na-hints-header        { padding: 0 12px; height: 46px; }
      #na-hints-body          { max-height: calc(33vh - 46px); padding: 8px 8px 10px; }
      .na-hints-header-title  { font-size: 15.3px; }
      .na-hints-q             { padding: 6px 8px; gap: 0; }
      .na-hints-q-text        { font-size: 15px; line-height: 1.25; }
      .na-hints-q-icon        { display: none; }
      #na-hints-footer        { font-size: 15px; margin-top: 6px; }
      #na-hints-list          { display: none; }
      #na-hints-mobile-carousel { display: grid; gap: 6px; }


    }
`;
  document.head.appendChild(style);

  /* === DOM === */
  var root   = document.createElement("div"); root.id = "na-hints-root";
  var card   = document.createElement("div"); card.id = "na-hints-card";
  var header = document.createElement("div"); header.id = "na-hints-header";
  header.setAttribute("role","button");
  header.setAttribute("aria-expanded","false");
  header.setAttribute("aria-controls","na-hints-body");
  header.innerHTML =
    '<div class="na-hints-header-left">' +
      '<div class="na-hints-header-title" id="na-hints-htitle">' + TITLE_CLOSED + '</div>' +
    '</div>' +
    '<div id="na-hints-chevron">' +
      '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M2 5L7 10L12 5" stroke="#FFFFFF" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</svg>' +
    '</div>';

  var body   = document.createElement("div"); body.id = "na-hints-body";

  /* Desktop list */
  var list = document.createElement("div"); list.id = "na-hints-list";
  QUESTIONS.forEach(function (q) {
    var item = document.createElement("div");
    item.className = "na-hints-q";
    item.innerHTML = '<span class="na-hints-q-icon">💬</span>' +
                     '<span class="na-hints-q-text">' + q + '</span>';
    list.appendChild(item);
  });

  /* Mobile carousel */
  var mCar = document.createElement("div"); mCar.id = "na-hints-mobile-carousel";
  var mQ1  = document.createElement("div"); mQ1.className = "na-hints-q";
  var mQ2  = document.createElement("div"); mQ2.className = "na-hints-q";
  mQ1.innerHTML = '<span class="na-hints-q-icon">💬</span><span class="na-hints-q-text"></span>';
  mQ2.innerHTML = '<span class="na-hints-q-icon">💬</span><span class="na-hints-q-text"></span>';
  mCar.appendChild(mQ1);
  mCar.appendChild(mQ2);

  var footer = document.createElement("p"); footer.id = "na-hints-footer";
  footer.textContent = "Scroll up to reveal the active buttons";

  body.appendChild(list);
  body.appendChild(mCar);
  body.appendChild(footer);
  card.appendChild(header);
  card.appendChild(body);
  root.appendChild(card);
  document.body.appendChild(root);

  /* === Mobile carousel === */
  var mIdx = 0, mTimer = null;

  function isMobile() { return window.innerWidth <= 600; }

  function fillSlots(idx) {
    var n = QUESTIONS.length;
    mQ1.querySelector(".na-hints-q-text").textContent = QUESTIONS[idx % n];
    mQ2.querySelector(".na-hints-q-text").textContent = QUESTIONS[(idx + 1) % n];
    mIdx = idx;
  }

  function rotatePair(animate) {
    var next = (mIdx + 2) % QUESTIONS.length;
    if (animate) {
      mCar.style.opacity = "0";
      setTimeout(function () { fillSlots(next); mCar.style.opacity = "1"; }, 350);
    } else {
      fillSlots(next);
    }
  }

  function startCarousel() {
    fillSlots(0); mCar.style.opacity = "1";
    mTimer = setInterval(function () { rotatePair(true); }, 3000);
  }
  function stopCarousel() {
    if (mTimer) { clearInterval(mTimer); mTimer = null; }
  }

  [mQ1, mQ2].forEach(function (q) {
    q.addEventListener("click", function () {
      stopCarousel(); rotatePair(true);
      mTimer = setInterval(function () { rotatePair(true); }, 3000);
    });
  });

  /* === Toggle === */
  var isExpanded = false;
  var titleEl    = document.getElementById("na-hints-htitle");

  header.addEventListener("click", function () {
    isExpanded = !isExpanded;
    card.classList.toggle("na-expanded", isExpanded);
    header.setAttribute("aria-expanded", String(isExpanded));
    titleEl.textContent = isExpanded ? TITLE_OPEN : TITLE_CLOSED;
    if (isExpanded && isMobile()) { startCarousel(); }
    else if (!isExpanded) { stopCarousel(); }
  });

  /* Auto-expand on load removed — hints stay closed until the user clicks. */

})();
