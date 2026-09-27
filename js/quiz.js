(() => {
  "use strict";

  const STATS_KEY = "doc-quiz-stats";
  const PREFS_KEY = "doc-quiz-prefs";

  // 問題文から安定したIDを作る（問題の並び順を変えても成績が引き継がれるように）
  function hashId(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = (h * 33 + s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }

  const bank = (Array.isArray(window.QUIZ_QUESTIONS) ? window.QUIZ_QUESTIONS : [])
    .filter((q) => q && q.doc && q.q && q.answer && Array.isArray(q.wrong) && q.wrong.length >= 3)
    .map((q) => ({ ...q, id: hashId(q.doc + "\n" + q.q) }));

  function loadJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || "{}") || {};
    } catch {
      return {};
    }
  }
  function saveJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* 保存できない環境では成績が残らないだけ */
    }
  }

  const stats = loadJson(STATS_KEY);
  let ctx = null;
  let session = null;

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
  const leafLabel = (dir) => ctx.folderLabel(dir.split("/").pop());

  function docTitle(path) {
    const m = ctx.manifest.find((mm) => mm.path === path);
    return m ? m.title : path;
  }

  // docs.js の並び順に合わせる（問題がある資料だけ）
  function orderedDocs() {
    const withQ = new Set(bank.map((q) => q.doc));
    return ctx.manifest.map((m) => m.path).filter((p) => withQ.has(p));
  }
  function orderedDirs() {
    return [...new Set(orderedDocs().map(dirOf))];
  }

  function questionsIn(scope) {
    switch (scope.type) {
      case "doc":
        return bank.filter((q) => q.doc === scope.value);
      case "folder":
        return bank.filter((q) => q.doc.startsWith(scope.value + "/"));
      case "weak":
        return bank.filter((q) => stats[q.id] && stats[q.id].last === false);
      case "unanswered":
        return bank.filter((q) => !stats[q.id]);
      default:
        return bank.slice();
    }
  }

  function scopeLabel(scope) {
    switch (scope.type) {
      case "doc":
        return docTitle(scope.value);
      case "folder":
        return dirLabel(scope.value);
      case "weak":
        return "要復習の問題";
      case "unanswered":
        return "まだ解いていない問題";
      default:
        return "すべての問題";
    }
  }

  function encodeScope(scope) {
    return scope.type === "doc" || scope.type === "folder" ? scope.type + ":" + scope.value : scope.type;
  }
  function decodeScope(value) {
    const i = value.indexOf(":");
    return i === -1 ? { type: value } : { type: value.slice(0, i), value: value.slice(i + 1) };
  }

  function summarize(qs) {
    let answered = 0;
    let mastered = 0;
    let weak = 0;
    qs.forEach((q) => {
      const s = stats[q.id];
      if (!s) return;
      answered++;
      if (s.last) mastered++;
      else weak++;
    });
    return { total: qs.length, answered, mastered, weak };
  }

  function record(q, correct) {
    const s = stats[q.id] || { c: 0, w: 0 };
    if (correct) s.c++;
    else s.w++;
    s.last = correct;
    s.t = Date.now();
    stats[q.id] = s;
    saveJson(STATS_KEY, stats);
  }

  function scrollToTop() {
    const area = ctx.container.closest(".content-area");
    if (area) area.scrollTop = 0;
  }

  function docLink(path, text) {
    const a = el("a", "quiz-doc-link", text);
    a.href = "#/" + path;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  function button(text, className, onClick) {
    const b = el("button", className, text);
    b.type = "button";
    b.addEventListener("click", onClick);
    return b;
  }

  // ---- 出題設定画面 ----
  function renderSetup() {
    session = null;
    const c = ctx.container;
    c.innerHTML = "";
    c.append(el("div", "doc-breadcrumb", "確認問題"));
    c.append(el("h1", null, "四択問題"));
    c.append(
      el(
        "p",
        "doc-lead",
        "資料の内容を四択で確認できます。解答するとすぐに正解と解説が表示され、成績はこのブラウザに記録されます。"
      )
    );

    if (!bank.length) {
      c.append(el("p", "empty-state", "quiz.js に問題が登録されていません。"));
      return;
    }

    const all = summarize(bank);
    const statsEl = el("div", "quiz-stats");
    [
      ["問題数", all.total],
      ["解いた問題", all.answered],
      ["正解済み", all.mastered],
      ["要復習", all.weak],
    ].forEach(([label, value]) => {
      const card = el("div", "quiz-stat");
      card.append(el("div", "quiz-stat-value", String(value)), el("div", "quiz-stat-label", label));
      statsEl.append(card);
    });
    c.append(statsEl);

    const prefs = loadJson(PREFS_KEY);
    const form = el("form", "quiz-setup");

    const scopeField = el("label", "quiz-field");
    scopeField.append(el("span", "quiz-field-label", "出題範囲"));
    const select = el("select", "quiz-select");
    const addOption = (parent, scope) => {
      const n = questionsIn(scope).length;
      if (!n) return;
      const o = el("option", null, scopeLabel(scope) + "（" + n + "問）");
      o.value = encodeScope(scope);
      parent.append(o);
    };
    addOption(select, { type: "all" });
    addOption(select, { type: "weak" });
    addOption(select, { type: "unanswered" });
    const folderGroup = el("optgroup");
    folderGroup.label = "カテゴリ";
    orderedDirs().forEach((dir) => addOption(folderGroup, { type: "folder", value: dir }));
    select.append(folderGroup);
    const docGroup = el("optgroup");
    docGroup.label = "資料";
    orderedDocs().forEach((path) => addOption(docGroup, { type: "doc", value: path }));
    select.append(docGroup);
    if (prefs.scope && [...select.options].some((o) => o.value === prefs.scope)) select.value = prefs.scope;
    scopeField.append(select);
    form.append(scopeField);

    const countField = el("div", "quiz-field");
    countField.append(el("span", "quiz-field-label", "問題数"));
    const seg = el("div", "quiz-segment");
    [
      ["10", "10問"],
      ["20", "20問"],
      ["0", "すべて"],
    ].forEach(([value, label]) => {
      const lab = el("label");
      const input = el("input");
      input.type = "radio";
      input.name = "quiz-count";
      input.value = value;
      input.checked = String(prefs.count ?? "10") === value;
      lab.append(input, el("span", null, label));
      seg.append(lab);
    });
    countField.append(seg);
    form.append(countField);

    const start = el("button", "quiz-primary", "スタート");
    start.type = "submit";
    form.append(start);
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const count = Number(form.querySelector('input[name="quiz-count"]:checked').value);
      saveJson(PREFS_KEY, { scope: select.value, count });
      startSession(decodeScope(select.value), count);
    });
    c.append(form);

    c.append(el("h2", null, "資料ごとの成績"));
    const wrap = el("div", "table-wrap");
    const table = el("table", "quiz-progress-table");
    const head = el("tr");
    ["資料", "問題数", "正解済み", "要復習", ""].forEach((h) => head.append(el("th", null, h)));
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const body = el("tbody");
    orderedDirs().forEach((dir) => {
      const groupRow = el("tr", "quiz-group-row");
      const groupCell = el("td", null, dirLabel(dir));
      groupCell.colSpan = 5;
      groupRow.append(groupCell);
      body.append(groupRow);
      orderedDocs()
        .filter((p) => dirOf(p) === dir)
        .forEach((path) => {
          const s = summarize(questionsIn({ type: "doc", value: path }));
          const row = el("tr");
          const titleCell = el("td");
          const link = el("a", null, docTitle(path));
          link.href = "#/" + path;
          titleCell.append(link);
          const doneCell = el("td", null, s.mastered + " / " + s.total);
          if (s.mastered === s.total) doneCell.classList.add("quiz-cell-done");
          const weakCell = el("td", null, s.weak ? String(s.weak) : "-");
          if (s.weak) weakCell.classList.add("quiz-cell-weak");
          const actionCell = el("td");
          actionCell.append(button("解く", "quiz-small", () => startSession({ type: "doc", value: path }, 0)));
          row.append(titleCell, el("td", null, String(s.total)), doneCell, weakCell, actionCell);
          body.append(row);
        });
    });
    table.append(body);
    wrap.append(table);
    c.append(wrap);

    const reset = button("成績をリセット", "quiz-link-button", () => {
      if (!confirm("このブラウザに記録された四択問題の成績をすべて消去します。よろしいですか？")) return;
      Object.keys(stats).forEach((k) => delete stats[k]);
      saveJson(STATS_KEY, stats);
      renderSetup();
    });
    c.append(reset);
  }

  // ---- 出題 ----
  function startSession(scope, limit, fixedQuestions) {
    let qs = fixedQuestions || shuffle(questionsIn(scope));
    if (!fixedQuestions && limit > 0) qs = qs.slice(0, limit);
    if (!qs.length) return;
    session = {
      scope,
      limit,
      index: 0,
      items: shuffle(qs).map((q) => ({
        q,
        choices: shuffle([q.answer, ...shuffle(q.wrong).slice(0, 3)]),
        picked: null,
        correct: false,
      })),
    };
    renderQuestion();
  }

  function renderQuestion() {
    const c = ctx.container;
    const item = session.items[session.index];
    const total = session.items.length;
    const correctSoFar = session.items.filter((it) => it.picked !== null && it.correct).length;
    c.innerHTML = "";

    const top = el("div", "quiz-top");
    top.append(
      el("span", "quiz-count", "問題 " + (session.index + 1) + " / " + total),
      el("span", "quiz-scope", scopeLabel(session.scope)),
      el("span", "quiz-running-score", "正解 " + correctSoFar)
    );
    c.append(top);
    const bar = el("div", "quiz-bar");
    const fill = el("div", "quiz-bar-fill");
    fill.style.width = ((session.index / total) * 100).toFixed(1) + "%";
    bar.append(fill);
    c.append(bar);

    const card = el("div", "quiz-card");
    card.append(el("div", "quiz-source", dirLabel(dirOf(item.q.doc)) + " / " + docTitle(item.q.doc)));
    card.append(el("p", "quiz-question", item.q.q));

    const list = el("ol", "quiz-choices");
    item.choices.forEach((choice, i) => {
      const li = el("li");
      const b = el("button", "quiz-choice");
      b.type = "button";
      b.append(el("span", "quiz-choice-key", String(i + 1)), el("span", "quiz-choice-text", choice));
      b.addEventListener("click", () => answer(i));
      li.append(b);
      list.append(li);
    });
    card.append(list);

    const feedback = el("div", "quiz-feedback");
    feedback.hidden = true;
    card.append(feedback);
    c.append(card);

    const actions = el("div", "quiz-actions");
    const next = button(session.index === total - 1 ? "結果を見る" : "次の問題へ →", "quiz-primary quiz-next", goNext);
    next.hidden = true;
    actions.append(button("中断して設定に戻る", "quiz-link-button", renderSetup), next);
    c.append(actions);

    c.append(el("p", "quiz-hint", "キーボード: 1〜4 で解答 / Enter で次へ"));
    scrollToTop();
  }

  function answer(index) {
    const item = session.items[session.index];
    if (item.picked !== null) return;
    item.picked = index;
    item.correct = item.choices[index] === item.q.answer;
    record(item.q, item.correct);

    const c = ctx.container;
    c.querySelectorAll(".quiz-choice").forEach((b, i) => {
      b.disabled = true;
      if (item.choices[i] === item.q.answer) b.classList.add("is-correct");
      else if (i === index) b.classList.add("is-wrong");
    });

    const feedback = c.querySelector(".quiz-feedback");
    feedback.className = "quiz-feedback " + (item.correct ? "is-correct" : "is-wrong");
    feedback.append(el("div", "quiz-verdict", item.correct ? "正解！" : "不正解"));
    if (!item.correct) feedback.append(el("p", "quiz-answer-line", "正解: " + item.q.answer));
    if (item.q.explain) feedback.append(el("p", "quiz-explain", item.q.explain));
    feedback.append(docLink(item.q.doc, "資料で確認する →"));
    feedback.hidden = false;

    const running = c.querySelector(".quiz-running-score");
    if (running) running.textContent = "正解 " + session.items.filter((it) => it.picked !== null && it.correct).length;

    const next = c.querySelector(".quiz-next");
    next.hidden = false;
    next.focus({ preventScroll: true });
    feedback.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  function goNext() {
    if (session.index < session.items.length - 1) {
      session.index++;
      renderQuestion();
    } else {
      renderResult();
    }
  }

  // ---- 結果 ----
  function renderResult() {
    const c = ctx.container;
    const total = session.items.length;
    const correct = session.items.filter((it) => it.correct).length;
    const rate = Math.round((correct / total) * 100);
    const wrongItems = session.items.filter((it) => !it.correct);
    c.innerHTML = "";

    c.append(el("div", "doc-breadcrumb", "確認問題 / " + scopeLabel(session.scope)));
    c.append(el("h1", null, "結果"));

    const score = el("div", "quiz-result");
    const big = el("div", "quiz-result-score");
    big.append(el("span", "quiz-result-num", String(correct)), el("span", "quiz-result-total", " / " + total + " 問正解"));
    score.append(big);
    score.append(el("div", "quiz-result-rate", rate + "%"));
    const message =
      rate === 100 ? "全問正解です。この範囲はしっかり身についています。" : rate >= 80 ? "よくできています。間違えた問題だけ復習しましょう。" : rate >= 50 ? "あと一歩です。解説と資料を見直してから解き直しましょう。" : "まずは資料を読み直してから、もう一度挑戦しましょう。";
    score.append(el("p", "quiz-result-message", message));
    c.append(score);

    const actions = el("div", "quiz-actions quiz-result-actions");
    if (wrongItems.length) {
      actions.append(
        button("間違えた " + wrongItems.length + " 問を解き直す", "quiz-primary", () =>
          startSession(session.scope, 0, wrongItems.map((it) => it.q))
        )
      );
    }
    const lastScope = session.scope;
    const lastLimit = session.limit;
    actions.append(button("同じ範囲でもう一度", "quiz-secondary", () => startSession(lastScope, lastLimit)));
    actions.append(button("出題設定に戻る", "quiz-link-button", renderSetup));
    c.append(actions);

    if (wrongItems.length) {
      c.append(el("h2", null, "間違えた問題"));
      wrongItems.forEach((it) => {
        const box = el("div", "quiz-review");
        box.append(el("div", "quiz-source", dirLabel(dirOf(it.q.doc)) + " / " + docTitle(it.q.doc)));
        box.append(el("p", "quiz-question", it.q.q));
        box.append(el("p", "quiz-review-yours", "あなたの解答: " + it.choices[it.picked]));
        box.append(el("p", "quiz-review-answer", "正解: " + it.q.answer));
        if (it.q.explain) box.append(el("p", "quiz-explain", it.q.explain));
        box.append(docLink(it.q.doc, "資料で確認する →"));
        c.append(box);
      });
    }
    scrollToTop();
  }

  document.addEventListener("keydown", (e) => {
    if (!session || !ctx || !ctx.container.querySelector(".quiz-choices")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const item = session.items[session.index];
    if (item.picked === null && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      if (Number(e.key) <= item.choices.length) answer(Number(e.key) - 1);
    } else if (item.picked !== null && (e.key === "ArrowRight" || (e.key === "Enter" && !e.target.closest("button")))) {
      e.preventDefault();
      goNext();
    }
  });

  window.DocQuiz = {
    count(path) {
      return bank.filter((q) => q.doc === path).length;
    },
    // route: "" なら出題設定、資料パスならその資料の問題をすぐに出題する
    render(container, options) {
      ctx = { container, manifest: options.manifest, folderLabel: options.folderLabel };
      if (options.route && bank.some((q) => q.doc === options.route)) {
        startSession({ type: "doc", value: options.route }, 0);
      } else {
        renderSetup();
      }
    },
  };
})();
