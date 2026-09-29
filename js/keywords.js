(() => {
  "use strict";

  const TICK_MS = 100;
  const INTERVALS = [3, 5, 8, 10, 15];

  // 同じ画面で「資料のキーワード」と「過去問の単語帳」を切り替えて表示する
  const MODES = {
    keywords: {
      prefsKey: "doc-keywords-prefs",
      title: "キーワードをながめる",
      lead: "重要な用語が一定間隔で自動的に切り替わります。ながめておくだけで要点を復習できます。全画面にすると画面いっぱいに表示します。",
      empty: "keywords.js にキーワードが登録されていません。",
      load: () => (Array.isArray(window.KEYWORDS) ? window.KEYWORDS : []).filter((k) => k && k.doc && k.term),
    },
    tango: {
      prefsKey: "doc-tango-prefs",
      title: "過去問の単語帳",
      lead: "ネットワークスペシャリスト試験の過去問（令和5〜7年度 春期）に出てきた重要語が一定間隔で自動的に切り替わります。ながめておくだけで頻出の用語を復習できます。",
      empty: "tango.js に単語が登録されていません。",
      load: () => (Array.isArray(window.TANGO) ? window.TANGO : []).filter((k) => k && k.term),
    },
  };

  let mode = MODES.keywords;
  let all = mode.load();

  let ctx = null;
  let deck = [];
  let index = 0;
  let elapsed = 0;
  let playing = true;
  let revealed = true;
  let timer = null;
  let wakeLock = null;
  let prefs = loadPrefs();

  function loadPrefs() {
    let p = {};
    try {
      p = JSON.parse(localStorage.getItem(mode.prefsKey) || "{}") || {};
    } catch {
      /* 既定値を使う */
    }
    return {
      scope: typeof p.scope === "string" ? p.scope : "all",
      interval: INTERVALS.includes(p.interval) ? p.interval : 5,
      shuffle: p.shuffle !== false,
      recall: p.recall === true,
    };
  }
  function savePrefs() {
    try {
      localStorage.setItem(mode.prefsKey, JSON.stringify(prefs));
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

  const yearLabel = (y) => "令和" + y + "年度 春期";
  function tangoYears() {
    return [...new Set(all.flatMap((k) => (k.src || []).map((s) => s[0])))].sort((a, b) => b - a);
  }

  // 過去問単語の出典表示（例：LAN・無線 ｜ 出典：令和7年度 午前Ⅱ 問15 / 令和5年度 午前Ⅱ 問15）
  function tangoSource(k) {
    const fields = window.TANGO_FIELDS || {};
    const src = (k.src || []).map((s) => "令和" + s[0] + "年度 " + s[1]);
    const shown = src.slice(0, 2).join(" / ") + (src.length > 2 ? " ほか" : "");
    return (fields[k.field] ? fields[k.field] + " ｜ " : "") + (shown ? "出典：" + shown : "");
  }

  function keywordsIn(scope) {
    if (scope.startsWith("field:")) {
      const field = scope.slice(6);
      return all.filter((k) => k.field === field);
    }
    if (scope.startsWith("year:")) {
      const year = Number(scope.slice(5));
      return all.filter((k) => (k.src || []).some((s) => s[0] === year));
    }
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
    // 資料のキーワードは docs.js の並び順で並べ、シャッフルしない場合は資料の順に流れるようにする
    const list = keywordsIn(prefs.scope);
    if (mode === MODES.keywords) {
      const order = new Map(orderedDocs().map((p, i) => [p, i]));
      list.sort((a, b) => (order.get(a.doc) ?? 0) - (order.get(b.doc) ?? 0));
    }
    deck = prefs.shuffle ? shuffle(list) : list;
    index = 0;
    elapsed = 0;
  }

  // ---- 画面の構築 ----
  function render() {
    const c = ctx.container;
    c.innerHTML = "";
    c.append(el("div", "doc-breadcrumb", "復習"));
    c.append(el("h1", null, mode.title));
    c.append(el("p", "doc-lead", mode.lead));

    if (!all.length) {
      c.append(el("p", "empty-state", mode.empty));
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
    const group = (label, entries) => {
      const g = el("optgroup");
      g.label = label;
      entries.forEach(([value, text]) => addOpt(g, value, text));
      scopeSelect.append(g);
    };
    if (mode === MODES.tango) {
      const fields = window.TANGO_FIELDS || {};
      group("分野", Object.keys(fields).map((f) => ["field:" + f, fields[f]]));
      group("出題年度", tangoYears().map((y) => ["year:" + y, yearLabel(y)]));
    } else {
      group("カテゴリ", [...new Set(orderedDocs().map(dirOf))].map((dir) => ["folder:" + dir, dirLabel(dir)]));
      group("資料", orderedDocs().map((p) => ["doc:" + p, docTitle(p)]));
    }
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

    const recallField = el("label", "kw-check");
    const recallInput = el("input");
    recallInput.type = "checkbox";
    recallInput.checked = prefs.recall;
    recallInput.addEventListener("change", () => {
      prefs.recall = recallInput.checked;
      savePrefs();
      elapsed = 0;
      showCard();
    });
    recallField.append(recallInput, el("span", null, "説明を後から表示（思い出す練習）"));

    const checks = el("div", "kw-checks");
    checks.append(shuffleField, recallField);
    bar.append(scopeField, intervalField, checks);
    c.append(bar);

    const stage = el("div", "kw-stage");
    stage.tabIndex = -1;
    const card = el("div", "kw-card");
    card.addEventListener("click", (e) => {
      if (!revealed && !e.target.closest("a")) reveal();
    });
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
    if (mode === MODES.tango) {
      const note = el(
        "p",
        "kw-note",
        "出典：独立行政法人情報処理推進機構（IPA）が公表しているネットワークスペシャリスト試験の過去問題。用語は各問題から選び，説明は本サイトで作成したものです。 "
      );
      const link = el("a", null, "IPA 過去問題");
      link.href = "https://www.ipa.go.jp/shiken/mondai-kaiotu/index.html";
      link.target = "_blank";
      link.rel = "noopener";
      note.append(link);
      c.append(note);
    }

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
    let source;
    if (k.doc) {
      source = el("a", "kw-source", dirLabel(dirOf(k.doc)) + " / " + docTitle(k.doc));
      source.href = "#/" + k.doc;
      source.title = "この資料を開く";
    } else {
      source = el("div", "kw-source", tangoSource(k));
    }
    const term = el("div", "kw-term", k.term);
    // 思い出す練習モードでは、説明を切り替え間隔の半分が過ぎるまで隠す（タップや → で先に表示できる）
    revealed = !prefs.recall;
    const descWrap = el("div", "kw-desc-wrap" + (revealed ? "" : " is-hidden"));
    descWrap.append(el("div", "kw-desc", k.desc || ""), el("div", "kw-think", "説明を思い出してみよう（タップで表示）"));
    card.append(source, term, descWrap);
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

  function reveal() {
    revealed = true;
    const wrap = ctx && ctx.container.querySelector(".kw-desc-wrap");
    if (wrap) wrap.classList.remove("is-hidden");
  }

  function step(delta) {
    if (!deck.length) return;
    // 説明が隠れているときの「次へ」は、まず説明を表示する
    if (delta > 0 && !revealed) {
      reveal();
      return;
    }
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
    const total = prefs.interval * 1000;
    if (!revealed && elapsed >= total / 2) reveal();
    if (elapsed >= total) step(1);
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
    // options.mode が "tango" なら過去問の単語帳を表示する
    // options.scope（"folder:<dir>" など）を渡すと、その範囲で開始する（ホーム画面から開く場合）
    count(modeName) {
      return (MODES[modeName] || MODES.keywords).load().length;
    },
    render(container, options) {
      ctx = { container, manifest: options.manifest, folderLabel: options.folderLabel };
      mode = MODES[options.mode] || MODES.keywords;
      all = mode.load();
      prefs = loadPrefs();
      if (options.scope) prefs.scope = options.scope;
      render();
    },
    stop,
  };
})();
