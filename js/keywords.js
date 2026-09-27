(() => {
  "use strict";

  const PREFS_KEY = "doc-keywords-prefs";
  const TICK_MS = 100;
  const INTERVALS = [3, 5, 8, 10, 15];

  const all = (Array.isArray(window.KEYWORDS) ? window.KEYWORDS : []).filter((k) => k && k.doc && k.term);

  let ctx = null;
  let deck = [];
  let index = 0;
  let elapsed = 0;
  let playing = true;
  let timer = null;
  let wakeLock = null;
  let prefs = loadPrefs();

  function loadPrefs() {
    let p = {};
    try {
      p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
    } catch {
      /* 既定値を使う */
    }
    return {
      scope: typeof p.scope === "string" ? p.scope : "all",
      interval: INTERVALS.includes(p.interval) ? p.interval : 5,
      shuffle: p.shuffle !== false,
    };
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      /* 保存できなくても動作には影響しない */
    }
  }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
  const dirLabel = (dir) => (dir ? dir.split("/").map(ctx.folderLabel).join(" / ") : "");
  function docTitle(path) {
    const m = ctx.manifest.find((mm) => mm.path === path);
    return m ? m.title : path;
  }
  function orderedDocs() {
    const withK = new Set(all.map((k) => k.doc));
    return ctx.manifest.map((m) => m.path).filter((p) => withK.has(p));
  }

  function keywordsIn(scope) {
    if (scope.startsWith("folder:")) {
      const dir = scope.slice(7);
      return all.filter((k) => k.doc.startsWith(dir + "/"));
    }
    if (scope.startsWith("doc:")) {
      const doc = scope.slice(4);
      return all.filter((k) => k.doc === doc);
    }
    return all.slice();
  }

  function buildDeck() {
    // docs.js の並び順で並べ、シャッフルしない場合は資料の順に流れるようにする
    const order = new Map(orderedDocs().map((p, i) => [p, i]));
    const list = keywordsIn(prefs.scope).sort((a, b) => (order.get(a.doc) ?? 0) - (order.get(b.doc) ?? 0));
    deck = prefs.shuffle ? shuffle(list) : list;
    index = 0;
    elapsed = 0;
  }

  // ---- 画面の構築 ----
  function render() {
    const c = ctx.container;
    c.innerHTML = "";
    c.append(el("div", "doc-breadcrumb", "復習"));
    c.append(el("h1", null, "キーワードをながめる"));
    c.append(
      el(
        "p",
        "doc-lead",
        "重要な用語が一定間隔で自動的に切り替わります。ながめておくだけで要点を復習できます。全画面にすると画面いっぱいに表示します。"
      )
    );

    if (!all.length) {
      c.append(el("p", "empty-state", "keywords.js にキーワードが登録されていません。"));
      return;
    }

    const bar = el("div", "kw-controls");

    const scopeField = el("label", "quiz-field kw-field-scope");
    scopeField.append(el("span", "quiz-field-label", "範囲"));
    const scopeSelect = el("select", "quiz-select");
    const addOpt = (parent, value, label) => {
      const n = keywordsIn(value).length;
      if (!n) return;
      const o = el("option", null, label + "（" + n + "語）");
      o.value = value;
      parent.append(o);
    };
    addOpt(scopeSelect, "all", "すべて");
    const folderGroup = el("optgroup");
    folderGroup.label = "カテゴリ";
    [...new Set(orderedDocs().map(dirOf))].forEach((dir) => addOpt(folderGroup, "folder:" + dir, dirLabel(dir)));
    scopeSelect.append(folderGroup);
    const docGroup = el("optgroup");
    docGroup.label = "資料";
    orderedDocs().forEach((p) => addOpt(docGroup, "doc:" + p, docTitle(p)));
    scopeSelect.append(docGroup);
    if (![...scopeSelect.options].some((o) => o.value === prefs.scope)) prefs.scope = "all";
    scopeSelect.value = prefs.scope;
    scopeSelect.addEventListener("change", () => {
      prefs.scope = scopeSelect.value;
      savePrefs();
      buildDeck();
      showCard();
    });
    scopeField.append(scopeSelect);

    const intervalField = el("label", "quiz-field");
    intervalField.append(el("span", "quiz-field-label", "切り替え間隔"));
    const intervalSelect = el("select", "quiz-select");
    INTERVALS.forEach((s) => {
      const o = el("option", null, s + " 秒");
      o.value = String(s);
      intervalSelect.append(o);
    });
    intervalSelect.value = String(prefs.interval);
    intervalSelect.addEventListener("change", () => {
      prefs.interval = Number(intervalSelect.value);
      savePrefs();
      elapsed = 0;
    });
    intervalField.append(intervalSelect);

    const shuffleField = el("label", "kw-check");
    const shuffleInput = el("input");
    shuffleInput.type = "checkbox";
    shuffleInput.checked = prefs.shuffle;
    shuffleInput.addEventListener("change", () => {
      prefs.shuffle = shuffleInput.checked;
      savePrefs();
      buildDeck();
      showCard();
    });
    shuffleField.append(shuffleInput, el("span", null, "ランダムな順番"));

    bar.append(scopeField, intervalField, shuffleField);
    c.append(bar);

    const stage = el("div", "kw-stage");
    stage.tabIndex = -1;
    const card = el("div", "kw-card");
    const progress = el("div", "kw-progress");
    progress.append(el("div", "kw-progress-fill"));

    const buttons = el("div", "kw-buttons");
    const iconBtn = (label, svg, onClick, className) => {
      const b = el("button", "kw-btn" + (className ? " " + className : ""));
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.title = label;
      b.innerHTML = svg;
      b.addEventListener("click", onClick);
      return b;
    };
    const svg = (d) =>
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d +
      "</svg>";
    buttons.append(
      iconBtn("前へ（←）", svg('<path d="M15 18l-6-6 6-6"/>'), () => step(-1)),
      iconBtn(
        "一時停止 / 再生（Space）",
        '<span class="kw-icon-pause">' +
          svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>') +
          '</span><span class="kw-icon-play">' +
          svg('<path d="M7 5l12 7-12 7z"/>') +
          "</span>",
        togglePlay,
        "kw-btn-play"
      ),
      iconBtn("次へ（→）", svg('<path d="M9 18l6-6-6-6"/>'), () => step(1)),
      iconBtn(
        "全画面（F）",
        svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
        toggleFullscreen,
        "kw-btn-full"
      )
    );
    const counter = el("span", "kw-counter");
    const footer = el("div", "kw-footer");
    footer.append(buttons, counter);

    stage.append(card, progress, footer);
    c.append(stage);
    c.append(el("p", "quiz-hint", "キーボード: Space で一時停止 / ← → で前後 / F で全画面"));

    buildDeck();
    showCard();
    setPlaying(true);
    start();
  }

  function showCard() {
    const c = ctx && ctx.container;
    const card = c && c.querySelector(".kw-card");
    if (!card) return;
    card.innerHTML = "";
    if (!deck.length) {
      card.append(el("div", "kw-term", "キーワードがありません"));
      return;
    }
    const k = deck[index];
    const source = el("a", "kw-source", dirLabel(dirOf(k.doc)) + " / " + docTitle(k.doc));
    source.href = "#/" + k.doc;
    source.title = "この資料を開く";
    const term = el("div", "kw-term", k.term);
    const desc = el("div", "kw-desc", k.desc || "");
    card.append(source, term, desc);
    // 切り替えのたびにフェードインさせる
    card.classList.remove("kw-enter");
    void card.offsetWidth;
    card.classList.add("kw-enter");
    c.querySelector(".kw-counter").textContent = index + 1 + " / " + deck.length;
    updateProgress();
  }

  function updateProgress() {
    const fill = ctx && ctx.container.querySelector(".kw-progress-fill");
    if (fill) fill.style.width = Math.min(100, (elapsed / (prefs.interval * 1000)) * 100) + "%";
  }

  function step(delta) {
    if (!deck.length) return;
    index = (index + delta + deck.length) % deck.length;
    // 一周したらシャッフルし直して毎回違う順番にする
    if (delta > 0 && index === 0 && prefs.shuffle) deck = shuffle(deck);
    elapsed = 0;
    showCard();
  }

  function tick() {
    if (!ctx || !ctx.container.querySelector(".kw-stage")) {
      stop();
      return;
    }
    if (!playing || !deck.length) return;
    elapsed += TICK_MS;
    if (elapsed >= prefs.interval * 1000) step(1);
    else updateProgress();
  }

  function start() {
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  }

  function setPlaying(value) {
    playing = value;
    const stage = ctx && ctx.container.querySelector(".kw-stage");
    if (stage) stage.classList.toggle("is-paused", !playing);
    if (playing) requestWakeLock();
    else releaseWakeLock();
  }

  function togglePlay() {
    setPlaying(!playing);
  }

  function toggleFullscreen() {
    const stage = ctx && ctx.container.querySelector(".kw-stage");
    if (!stage) return;
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else if (stage.requestFullscreen) {
      stage.requestFullscreen().catch(() => {});
    }
  }

  // ながめている間に画面が消えないようにする（対応ブラウザのみ）
  async function requestWakeLock() {
    if (!("wakeLock" in navigator) || wakeLock || document.visibilityState !== "visible") return;
    try {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => {
        wakeLock = null;
      });
    } catch {
      wakeLock = null;
    }
  }
  function releaseWakeLock() {
    if (wakeLock) {
      wakeLock.release().catch(() => {});
      wakeLock = null;
    }
  }

  function stop() {
    clearInterval(timer);
    timer = null;
    releaseWakeLock();
    if (document.fullscreenElement && document.fullscreenElement.classList.contains("kw-stage")) {
      document.exitFullscreen().catch(() => {});
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && timer && playing) requestWakeLock();
  });

  document.addEventListener("keydown", (e) => {
    if (!timer || !ctx || !ctx.container.querySelector(".kw-stage")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " || e.key === "Spacebar") {
      // ボタンにフォーカスがあるときはボタン自体のクリックに任せる（二重に切り替わらないように）
      if (e.target.closest && e.target.closest("button")) return;
      e.preventDefault();
      togglePlay();
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      step(1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      step(-1);
    } else if (e.key === "f" || e.key === "F") {
      e.preventDefault();
      toggleFullscreen();
    }
  });

  window.DocKeywords = {
    render(container, options) {
      ctx = { container, manifest: options.manifest, folderLabel: options.folderLabel };
      prefs = loadPrefs();
      render();
    },
    stop,
  };
})();
