(() => {
  "use strict";

  const PREFS_KEY = "doc-kakomon-prefs";
  const TICK_MS = 100;
  const INTERVALS = [10, 15, 20, 30, 45, 60];
  const REVEAL_AT = 0.6;
  const EXAM = "ネットワークスペシャリスト試験";
  const PART_LABEL = { am2: "午前Ⅱ", pm1: "午後Ⅰ", pm2: "午後Ⅱ" };

  const years = Array.isArray(window.KAKOMON) ? window.KAKOMON : [];
  const allCards = [];
  years.forEach((y) => {
    (y.am2 || []).forEach((q) => allCards.push({ kind: "am2", year: y, part: "am2", q }));
    ["pm1", "pm2"].forEach((part) =>
      (y[part] || []).forEach((m) =>
        m.items.forEach((item) => {
          // IPAが「不備により成立しない」とした設問は出さない
          if (!item.skip) allCards.push({ kind: "pm", year: y, part, mondai: m, item });
        })
      )
    );
  });

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
      p = JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") || {};
    } catch {
      /* 既定値を使う */
    }
    return {
      year: typeof p.year === "string" ? p.year : "all",
      part: ["all", "am2", "pm1", "pm2"].includes(p.part) ? p.part : "all",
      interval: INTERVALS.includes(p.interval) ? p.interval : 20,
      shuffle: p.shuffle === true,
      later: p.later !== false,
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

  function cardsInScope() {
    return allCards.filter(
      (c) => (prefs.year === "all" || c.year.id === prefs.year) && (prefs.part === "all" || c.part === prefs.part)
    );
  }

  function buildDeck() {
    const list = cardsInScope();
    deck = prefs.shuffle ? shuffle(list) : list;
    index = 0;
    elapsed = 0;
  }

  function select(label, options, value, onChange, className) {
    const field = el("label", "quiz-field" + (className ? " " + className : ""));
    field.append(el("span", "quiz-field-label", label));
    const s = el("select", "quiz-select");
    options.forEach(([v, text]) => {
      const o = el("option", null, text);
      o.value = v;
      s.append(o);
    });
    s.value = value;
    s.addEventListener("change", () => onChange(s.value));
    field.append(s);
    return field;
  }

  function checkbox(label, checked, onChange) {
    const field = el("label", "kw-check");
    const input = el("input");
    input.type = "checkbox";
    input.checked = checked;
    input.addEventListener("change", () => onChange(input.checked));
    field.append(input, el("span", null, label));
    return field;
  }

  function countOf(year, part) {
    return allCards.filter((c) => (year === "all" || c.year.id === year) && (part === "all" || c.part === part)).length;
  }

  // ---- 画面の構築 ----
  function render() {
    const c = ctx.container;
    c.innerHTML = "";
    c.append(el("div", "doc-breadcrumb", "復習"));
    c.append(el("h1", null, "過去問をながめる"));
    c.append(
      el(
        "p",
        "doc-lead",
        EXAM + "の過去問（午前Ⅱ・午後Ⅰ・午後Ⅱ）を一定間隔で自動的に切り替えて表示します。問題が先に出て，少し経つと正解・解答例が表示されます。"
      )
    );

    if (!allCards.length) {
      c.append(el("p", "empty-state", "kakomon.js に過去問が登録されていません。"));
      return;
    }

    const bar = el("div", "kw-controls");
    bar.append(
      select(
        "年度",
        [["all", "すべての年度（" + countOf("all", prefs.part) + "枚）"]].concat(
          years.map((y) => [y.id, y.label + "（" + countOf(y.id, prefs.part) + "枚）"])
        ),
        years.some((y) => y.id === prefs.year) ? prefs.year : "all",
        (v) => {
          prefs.year = v;
          savePrefs();
          render();
        },
        "kw-field-scope"
      ),
      select(
        "区分",
        [
          ["all", "すべて（" + countOf(prefs.year, "all") + "枚）"],
          ["am2", "午前Ⅱ（" + countOf(prefs.year, "am2") + "問）"],
          ["pm1", "午後Ⅰ（" + countOf(prefs.year, "pm1") + "設問）"],
          ["pm2", "午後Ⅱ（" + countOf(prefs.year, "pm2") + "設問）"],
        ],
        prefs.part,
        (v) => {
          prefs.part = v;
          savePrefs();
          render();
        }
      ),
      select(
        "切り替え間隔",
        INTERVALS.map((s) => [String(s), s + " 秒"]),
        String(prefs.interval),
        (v) => {
          prefs.interval = Number(v);
          savePrefs();
          elapsed = 0;
        }
      )
    );
    const checks = el("div", "kw-checks");
    checks.append(
      checkbox("ランダムな順番", prefs.shuffle, (v) => {
        prefs.shuffle = v;
        savePrefs();
        buildDeck();
        showCard();
      }),
      checkbox("解答を後から表示（考える時間をとる）", prefs.later, (v) => {
        prefs.later = v;
        savePrefs();
        elapsed = 0;
        showCard();
      })
    );
    bar.append(checks);
    c.append(bar);

    const stage = el("div", "kw-stage kk-stage");
    stage.tabIndex = -1;
    const card = el("div", "kk-card");
    card.addEventListener("click", (e) => {
      if (!revealed && !e.target.closest("a")) reveal();
    });
    const progress = el("div", "kw-progress");
    progress.append(el("div", "kw-progress-fill"));

    const svg = (d) =>
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      d +
      "</svg>";
    const iconBtn = (label, html, onClick, className) => {
      const b = el("button", "kw-btn" + (className ? " " + className : ""));
      b.type = "button";
      b.setAttribute("aria-label", label);
      b.title = label;
      b.innerHTML = html;
      b.addEventListener("click", onClick);
      return b;
    };
    const buttons = el("div", "kw-buttons");
    buttons.append(
      iconBtn("前へ（←）", svg('<path d="M15 18l-6-6 6-6"/>'), () => step(-1)),
      iconBtn(
        "一時停止 / 再生（Space）",
        '<span class="kw-icon-pause">' +
          svg('<rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/>') +
          '</span><span class="kw-icon-play">' +
          svg('<path d="M7 5l12 7-12 7z"/>') +
          "</span>",
        () => setPlaying(!playing),
        "kw-btn-play"
      ),
      iconBtn("次へ（→）", svg('<path d="M9 18l6-6-6-6"/>'), () => step(1)),
      iconBtn(
        "全画面（F）",
        svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
        toggleFullscreen
      )
    );
    const footer = el("div", "kw-footer");
    footer.append(buttons, el("span", "kw-counter"));

    stage.append(card, progress, footer);
    c.append(stage);
    c.append(el("p", "quiz-hint", "キーボード: Space で一時停止 / → で解答表示・次へ / ← で前へ / F で全画面"));

    const note = el("p", "kk-note");
    note.append(
      "出典：独立行政法人情報処理推進機構（IPA）が公表している" +
        EXAM +
        "の過去問題（問題冊子・解答例）。各カードに年度・時間区分・問番号を表示しています。午後の「本文より」の抜粋と（ ）内の補足は，本サイトで問題文を要約・一部改変したものです。問題文の全文と図は公式の問題冊子PDFで確認してください。 "
    );
    const src = el("a", null, "IPA 過去問題");
    src.href = "https://www.ipa.go.jp/shiken/mondai-kaiotu/index.html";
    src.target = "_blank";
    src.rel = "noopener";
    note.append(src);
    c.append(note);

    buildDeck();
    showCard();
    setPlaying(true);
    start();
  }

  function pdfLink(year, part, kind, text) {
    const a = el("a", "kk-pdf", text);
    a.href = year.pdfBase + part + "_" + kind + ".pdf";
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function renderAm2(card, c) {
    const q = c.q;
    card.append(el("div", "kk-source", "出典：" + c.year.label + " " + EXAM + " 午前Ⅱ 問" + q.no));
    card.append(el("div", "kk-question", q.q));
    if (q.figure) {
      const img = el("img", "kk-figure");
      img.src = q.figure;
      img.alt = "問" + q.no + " の図";
      img.loading = "lazy";
      card.append(img);
    }
    const keys = Object.keys(q.choices);
    if (q.choiceHead) {
      const wrap = el("div", "table-wrap kk-choice-wrap");
      const table = el("table", "kk-choice-table");
      const head = el("tr");
      head.append(el("th"));
      q.choiceHead.forEach((h) => head.append(el("th", null, h)));
      const thead = el("thead");
      thead.append(head);
      const tbody = el("tbody");
      keys.forEach((k) => {
        const tr = el("tr", k === q.answer ? "is-correct" : null);
        tr.append(el("td", "kk-key", k));
        q.choices[k].forEach((v) => tr.append(el("td", null, v)));
        tbody.append(tr);
      });
      table.append(thead, tbody);
      wrap.append(table);
      card.append(wrap);
    } else {
      const list = el("ul", "kk-choices");
      keys.forEach((k) => {
        const li = el("li", k === q.answer ? "is-correct" : null);
        li.append(el("span", "kk-key", k), el("span", "kk-choice-text", q.choices[k]));
        list.append(li);
      });
      card.append(list);
    }
    const ans = el("div", "kk-answer");
    ans.append(el("span", "kk-answer-label", "正解"), el("span", "kk-answer-body", q.answer));
    card.append(ans);
    const links = el("div", "kk-links");
    links.append(pdfLink(c.year, "am2", "qs", "問題冊子PDF"), pdfLink(c.year, "am2", "ans", "解答例PDF"));
    card.append(links);
  }

  function renderPm(card, c) {
    const { year, part, mondai: m, item } = c;
    card.append(
      el("div", "kk-source", "出典：" + year.label + " " + EXAM + " " + PART_LABEL[part] + " 問" + m.no + " " + item.label)
    );
    const head = el("div", "kk-mondai");
    head.append(el("span", "kk-mondai-title", PART_LABEL[part] + " 問" + m.no + "「" + m.title + "」"), el("span", "kk-label", item.label));
    card.append(head);
    if (item.context) {
      const ctxBox = el("div", "kk-context");
      ctxBox.append(el("div", "kk-context-label", "本文より（要約・一部改変）"), el("div", "kk-context-body", item.context));
      card.append(ctxBox);
    }
    card.append(el("div", "kk-question", item.q));
    const ans = el("div", "kk-answer kk-answer-block");
    ans.append(el("span", "kk-answer-label", "解答例"), el("div", "kk-answer-body", item.answer));
    card.append(ans);
    const links = el("div", "kk-links");
    links.append(
      pdfLink(year, part, "qs", "問題冊子PDF（本文・図）"),
      pdfLink(year, part, "ans", "解答例PDF"),
      pdfLink(year, part, "cmnt", "採点講評PDF")
    );
    card.append(links);
  }

  function showCard() {
    const container = ctx && ctx.container;
    const card = container && container.querySelector(".kk-card");
    if (!card) return;
    card.innerHTML = "";
    const counter = container.querySelector(".kw-counter");
    if (!deck.length) {
      card.append(el("div", "kk-question", "この条件に当てはまる問題はありません。"));
      if (counter) counter.textContent = "0 / 0";
      return;
    }
    const c = deck[index];
    if (c.kind === "am2") renderAm2(card, c);
    else renderPm(card, c);

    revealed = !prefs.later;
    card.classList.toggle("is-revealed", revealed);
    card.classList.remove("kw-enter");
    void card.offsetWidth;
    card.classList.add("kw-enter");
    card.scrollTop = 0;
    if (counter) counter.textContent = index + 1 + " / " + deck.length;
    updateProgress();
  }

  function reveal() {
    revealed = true;
    const card = ctx && ctx.container.querySelector(".kk-card");
    if (card) card.classList.add("is-revealed");
  }

  function updateProgress() {
    const fill = ctx && ctx.container.querySelector(".kw-progress-fill");
    if (fill) fill.style.width = Math.min(100, (elapsed / (prefs.interval * 1000)) * 100) + "%";
  }

  function step(delta) {
    if (!deck.length) return;
    // 解答がまだ隠れているときの「次へ」は，まず解答を表示する
    if (delta > 0 && !revealed) {
      reveal();
      return;
    }
    index = (index + delta + deck.length) % deck.length;
    if (delta > 0 && index === 0 && prefs.shuffle) deck = shuffle(deck);
    elapsed = 0;
    showCard();
  }

  function tick() {
    if (!ctx || !ctx.container.querySelector(".kk-stage")) {
      stop();
      return;
    }
    if (!playing || !deck.length) return;
    elapsed += TICK_MS;
    const total = prefs.interval * 1000;
    if (!revealed && elapsed >= total * REVEAL_AT) reveal();
    if (elapsed >= total) step(1);
    else updateProgress();
  }

  function start() {
    clearInterval(timer);
    timer = setInterval(tick, TICK_MS);
  }

  function setPlaying(value) {
    playing = value;
    const stage = ctx && ctx.container.querySelector(".kk-stage");
    if (stage) stage.classList.toggle("is-paused", !playing);
    if (playing) requestWakeLock();
    else releaseWakeLock();
  }

  function toggleFullscreen() {
    const stage = ctx && ctx.container.querySelector(".kk-stage");
    if (!stage) return;
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else if (stage.requestFullscreen) stage.requestFullscreen().catch(() => {});
  }

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
    if (document.fullscreenElement && document.fullscreenElement.classList.contains("kk-stage")) {
      document.exitFullscreen().catch(() => {});
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && timer && playing) requestWakeLock();
  });

  document.addEventListener("keydown", (e) => {
    if (!timer || !ctx || !ctx.container.querySelector(".kk-stage")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === " " || e.key === "Spacebar") {
      if (e.target.closest && e.target.closest("button")) return;
      e.preventDefault();
      setPlaying(!playing);
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

  window.DocKakomon = {
    count: () => allCards.length,
    render(container) {
      ctx = { container };
      prefs = loadPrefs();
      render();
    },
    stop,
  };
})();
