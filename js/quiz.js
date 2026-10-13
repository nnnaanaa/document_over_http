(() => {
  "use strict";

  const STATS_KEY = "doc-quiz-stats";
  const PREFS_KEY = "doc-quiz-prefs";
  const SESSION_KEY = "doc-quiz-session";

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

  // 「自信なし」で正解した問題は要復習（last: false）に残し，u で区別する
  function record(q, correct, unsure) {
    const s = stats[q.id] || { c: 0, w: 0 };
    if (correct) s.c++;
    else s.w++;
    s.t = Date.now();
    stats[q.id] = s;
    applyUnsure(q, correct, unsure);
  }
  function applyUnsure(q, correct, unsure) {
    const s = stats[q.id];
    if (!s) return;
    s.last = correct && !unsure;
    if (correct && unsure) s.u = true;
    else delete s.u;
    saveJson(STATS_KEY, stats);
  }

  // ---- 苦手な問題を優先して選ぶ ----
  // 前回まちがえた・自信なし > 未回答 > しばらく解いていない・過去にまちがえたことがある，の順に出やすくする
  function weightOf(q) {
    const s = stats[q.id];
    if (!s) return 3;
    if (s.last === false) return 6 + Math.min(s.w, 4);
    const days = (Date.now() - (s.t || 0)) / 86400000;
    return 1 + Math.min(s.w, 3) * 0.7 + Math.min(days / 7, 2);
  }
  // 重み付きの非復元抽出（各問題に random^(1/重み) のキーを振って大きい順に取る）
  function pickWeighted(qs, n) {
    return qs
      .map((q) => ({ q, k: Math.pow(Math.random(), 1 / weightOf(q)) }))
      .sort((a, b) => b.k - a.k)
      .slice(0, n)
      .map((x) => x.q);
  }

  // ---- 不正解の選択肢の説明（キーワード・過去問の単語帳から引く） ----
  const normTerm = (s) => String(s).normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const stripParen = (s) => s.replace(/[（(][^）)]*[）)]/g, "");
  let glossary = null;
  function buildGlossary() {
    const map = new Map();
    const add = (key, entry) => {
      const k = normTerm(key);
      if (k.length >= 2 && !map.has(k)) map.set(k, entry);
    };
    const kws = Array.isArray(window.KEYWORDS) ? window.KEYWORDS : [];
    const tango = Array.isArray(window.TANGO) ? window.TANGO : [];
    [...kws, ...tango].forEach((e) => {
      if (!e || !e.term || !e.desc) return;
      add(e.term, e);
      add(stripParen(e.term), e);
    });
    return map;
  }
  // 英数字の途中で一致したもの（"15" と "150" など）は除く
  function hasToken(hay, needle) {
    const isWord = (ch) => !!ch && /[0-9a-z.]/.test(ch);
    for (let i = hay.indexOf(needle); i !== -1; i = hay.indexOf(needle, i + 1)) {
      if (!isWord(hay[i - 1]) && !isWord(hay[i + needle.length])) return true;
    }
    return false;
  }
  function describeChoice(choice, q) {
    if (!glossary) glossary = buildGlossary();
    for (const key of [choice, stripParen(choice), "IEEE " + choice]) {
      const e = glossary.get(normTerm(key));
      if (e) return { term: e.term, desc: e.desc };
    }
    const n = normTerm(choice);
    if (n.length < 2) return null;
    const kws = (Array.isArray(window.KEYWORDS) ? window.KEYWORDS : []).filter((k) => k.doc === q.doc);
    // 「A / B / C」と「説明a / 説明b / 説明c」が対応している語は，該当する部分だけを取り出す
    for (const k of kws) {
      const terms = k.term.split(" / ");
      const descs = k.desc.split(" / ");
      if (terms.length < 2 || terms.length !== descs.length) continue;
      const i = terms.findIndex((t) => normTerm(t) === n || normTerm(stripParen(t)) === n);
      if (i !== -1) return { term: terms[i].trim(), desc: descs[i].trim() };
    }
    // 同じ資料のキーワードの用語・説明に出てくる値（"60W" など）は，その語の説明を示す
    const hit = kws.find((k) => hasToken(normTerm(k.term), n)) || kws.find((k) => hasToken(normTerm(k.desc), n));
    return hit ? { term: hit.term, desc: hit.desc } : null;
  }
  function choiceNote(choice, q) {
    const d = describeChoice(choice, q);
    if (!d) return null;
    return normTerm(d.term) === normTerm(choice) || normTerm(stripParen(d.term)) === normTerm(choice)
      ? d.desc
      : d.term + "：" + d.desc;
  }

  // ---- 途中から再開 ----
  function newItem(q) {
    return { q, choices: shuffle([q.answer, ...shuffle(q.wrong).slice(0, 3)]), picked: null, correct: false, unsure: false };
  }
  function saveSession() {
    if (!session) return;
    saveJson(SESSION_KEY, {
      scope: session.scope,
      limit: session.limit,
      t: Date.now(),
      items: session.items.map((it) => ({
        id: it.q.id,
        choices: it.choices,
        picked: it.picked,
        correct: it.correct,
        unsure: !!it.unsure,
      })),
    });
  }
  function clearSavedSession() {
    try {
      localStorage.removeItem(SESSION_KEY);
    } catch {
      /* noop */
    }
  }
  function loadSavedSession() {
    const raw = loadJson(SESSION_KEY);
    if (!raw || !raw.scope || !Array.isArray(raw.items)) return null;
    const byId = new Map(bank.map((q) => [q.id, q]));
    const items = raw.items
      .map((it) => {
        const q = it && byId.get(it.id);
        if (!q) return null;
        // 保存後に問題が書き換えられていたら，選択肢を作り直して未回答に戻す
        const ok =
          Array.isArray(it.choices) &&
          it.choices.includes(q.answer) &&
          it.choices.every((ch) => ch === q.answer || q.wrong.includes(ch));
        if (!ok) return newItem(q);
        const picked = Number.isInteger(it.picked) && it.picked < it.choices.length ? it.picked : null;
        return { q, choices: it.choices, picked, correct: picked !== null && !!it.correct, unsure: !!it.unsure };
      })
      .filter(Boolean);
    const index = items.findIndex((it) => it.picked === null);
    if (index === -1) return null;
    return { scope: raw.scope, limit: raw.limit || 0, index, items };
  }

  function scrollToTop() {
    const area = ctx.container.closest(".content-area");
    if (area) area.scrollTop = 0;
  }

  // ---- 資料をその場で開くパネル ----
  async function loadDocText(path) {
    const m = ctx.manifest.find((mm) => mm.path === path);
    if (m && m.body) return m.body;
    const res = await fetch((m && m.url) || path, { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const text = await res.text();
    if (m) m.body = text;
    return text;
  }

  function renderDocInto(box, path, md) {
    const html = marked.parse(md);
    box.innerHTML = window.DOMPurify ? DOMPurify.sanitize(html) : html;
    const first = box.firstElementChild;
    if (first && first.tagName === "H1" && /\.md$/i.test(first.textContent.trim())) first.remove();
    box.querySelectorAll("table").forEach((t) => {
      const wrap = el("div", "table-wrap");
      t.replaceWith(wrap);
      wrap.append(t);
    });
    // パネル内のリンクでクイズが中断されないよう，資料間リンクは別タブで開く
    const base = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
    box.querySelectorAll("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (/\.md($|[?#])/i.test(href) && !/^([a-z]+:)?\/\//i.test(href) && !href.startsWith("#")) {
        a.setAttribute("href", "#/" + new URL(href, "https://x/" + base).pathname.replace(/^\//, ""));
      }
      a.target = "_blank";
      a.rel = "noopener";
    });
  }

  // 正解の語句（またはその一部）が書かれている最初の箇所を探して強調する。
  // ref があれば（正解が資料の文言を言い換えている問題）それを最優先で探す
  function highlightAnswer(box, answer, ref) {
    const norm = (s) => s.replace(/\s+/g, "");
    const parts = answer.split(/[\s／/・，,、（）()「」]+/).filter((s) => s.length >= 2);
    const candidates = [...new Set([answer, ...parts])].sort((a, b) => b.length - a.length);
    if (ref) candidates.unshift(ref);
    // 入れ子の箇条書きや表を除いた，その行自体の文で比べる
    const ownText = (b) => {
      const clone = b.cloneNode(true);
      clone.querySelectorAll("ul, ol, table, p, pre").forEach((n) => n.remove());
      return clone.textContent;
    };
    const blocks = [...box.querySelectorAll("td, th, li, p, h2, h3, h4, pre")].map((b) => ({ b, t: norm(ownText(b)) }));
    for (const cand of candidates) {
      const found = blocks.find((x) => x.t.includes(norm(cand)));
      const hit = found && found.b;
      if (!hit) continue;
      hit.classList.add("quiz-peek-hit");
      const walker = document.createTreeWalker(hit, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const i = node.nodeValue.indexOf(cand);
        if (i === -1) continue;
        const mark = el("mark", "quiz-peek-mark");
        const rest = node.splitText(i);
        rest.splitText(cand.length);
        rest.replaceWith(mark);
        mark.append(rest);
        break;
      }
      return hit;
    }
    return null;
  }

  function docPeek(q) {
    const wrap = el("div", "quiz-peek");
    const toggle = el("button", "quiz-peek-toggle", "資料で確認する");
    toggle.type = "button";
    toggle.setAttribute("aria-expanded", "false");
    const panel = el("div", "quiz-peek-panel");
    panel.hidden = true;
    let loaded = false;

    toggle.addEventListener("click", async () => {
      const open = panel.hidden;
      panel.hidden = !open;
      toggle.setAttribute("aria-expanded", String(open));
      toggle.classList.toggle("is-open", open);
      if (!open || loaded) {
        if (open) revealInContentArea(panel);
        return;
      }
      loaded = true;
      const head = el("div", "quiz-peek-head");
      head.append(el("span", "quiz-peek-title", dirLabel(dirOf(q.doc)) + " / " + docTitle(q.doc)));
      const full = el("a", "quiz-peek-open", "資料ページを開く ↗");
      full.href = "#/" + q.doc;
      full.target = "_blank";
      full.rel = "noopener";
      head.append(full);
      const body = el("div", "quiz-peek-body", "読み込み中…");
      panel.append(head, body);
      try {
        renderDocInto(body, q.doc, await loadDocText(q.doc));
        const hit = highlightAnswer(body, q.answer, q.ref);
        if (hit) {
          body.scrollTop = Math.max(0, hit.getBoundingClientRect().top - body.getBoundingClientRect().top - 40);
        } else {
          body.prepend(el("p", "quiz-peek-note", "正解の語句が書かれた箇所を自動で特定できなかったため，資料の先頭を表示しています。"));
        }
      } catch (err) {
        body.textContent = "資料を読み込めませんでした: " + String(err.message || err);
      }
      revealInContentArea(panel);
    });

    wrap.append(toggle, panel);
    return wrap;
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

    const saved = loadSavedSession();
    if (saved) {
      const answered = saved.items.filter((it) => it.picked !== null).length;
      const banner = el("div", "quiz-resume");
      const text = el("div", "quiz-resume-text");
      text.append(
        el("span", "quiz-resume-title", "前回の続きがあります"),
        el("span", "quiz-resume-sub", scopeLabel(saved.scope) + "・" + answered + " / " + saved.items.length + " 問 解答済み")
      );
      const btns = el("div", "quiz-resume-actions");
      btns.append(
        button("続きから解く", "quiz-primary", () => resumeSession(saved)),
        button("破棄", "quiz-link-button", () => {
          clearSavedSession();
          banner.remove();
        })
      );
      banner.append(text, btns);
      c.append(banner);
    }

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

    const prio = el("label", "quiz-check");
    const prioInput = el("input");
    prioInput.type = "checkbox";
    prioInput.checked = prefs.prioritize !== false;
    prio.append(prioInput, el("span", null, "苦手な問題を優先して出す（まちがえた・自信なし・未回答・しばらく解いていない問題が出やすくなります）"));
    form.append(prio);

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const count = Number(form.querySelector('input[name="quiz-count"]:checked').value);
      saveJson(PREFS_KEY, { scope: select.value, count, prioritize: prioInput.checked });
      startSession(decodeScope(select.value), count);
    });
    c.append(form);

    c.append(el("h2", null, "資料ごとの成績"));
    const wrap = el("div", "table-wrap");
    const table = el("table", "quiz-progress-table");
    const head = el("tr");
    ["資料", "正解済み", "要復習", ""].forEach((h) => head.append(el("th", null, h)));
    const thead = el("thead");
    thead.append(head);
    table.append(thead);
    const body = el("tbody");
    orderedDirs().forEach((dir) => {
      const groupRow = el("tr", "quiz-group-row");
      const groupCell = el("td", null, dirLabel(dir));
      groupCell.colSpan = 4;
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
          row.append(titleCell, doneCell, weakCell, actionCell);
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
    let qs = fixedQuestions || questionsIn(scope);
    if (!fixedQuestions && limit > 0 && qs.length > limit) {
      qs = loadJson(PREFS_KEY).prioritize !== false ? pickWeighted(qs, limit) : shuffle(qs).slice(0, limit);
    }
    if (!qs.length) return;
    session = { scope, limit, index: 0, items: shuffle(qs).map(newItem) };
    saveSession();
    renderQuestion();
  }

  function resumeSession(saved) {
    session = saved;
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
      const li = el("li", "quiz-choice-row");
      const b = el("button", "quiz-choice");
      b.type = "button";
      b.append(el("span", "quiz-choice-key", String(i + 1)), el("span", "quiz-choice-text", choice));
      b.addEventListener("click", () => answer(i));
      // 明らかに違う選択肢を取り消し線で消す（もう一度押すと元に戻る）
      const strike = el("button", "quiz-strike");
      strike.type = "button";
      strike.setAttribute("aria-label", "選択肢" + (i + 1) + "を消す");
      strike.title = "この選択肢を消す（Shift + " + (i + 1) + "）";
      strike.innerHTML =
        '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>';
      strike.addEventListener("click", () => toggleStrike(i));
      li.append(b, strike);
      list.append(li);
    });
    card.append(list);

    // 正解しても自信がなければ要復習に残す（解答の前後どちらでも切り替えられる）
    const unsure = button("", "quiz-unsure", () => toggleUnsure());
    unsure.title = "自信なし（U）";
    card.append(unsure);
    updateUnsureButton(unsure, item);

    const feedback = el("div", "quiz-feedback");
    feedback.hidden = true;
    card.append(feedback);
    c.append(card);

    const actions = el("div", "quiz-actions");
    const next = button(session.index === total - 1 ? "結果を見る" : "次の問題へ →", "quiz-primary quiz-next", goNext);
    next.hidden = true;
    actions.append(button("中断して設定に戻る", "quiz-link-button", renderSetup), next);
    c.append(actions);

    c.append(el("p", "quiz-hint", "キーボード: 1〜4 で解答 / Shift + 1〜4 で選択肢を消す / U で自信なし / Enter で次へ"));
    scrollToTop();
  }

  function updateUnsureButton(b, item) {
    const on = !!item.unsure;
    b.classList.toggle("is-on", on);
    b.setAttribute("aria-pressed", String(on));
    b.textContent = on ? "自信なし（正解しても要復習に残します）" : "自信なし";
    // 不正解なら要復習に入るので切り替える意味がない
    b.hidden = item.picked !== null && !item.correct;
  }

  function toggleUnsure() {
    const item = session.items[session.index];
    if (item.picked !== null && !item.correct) return;
    item.unsure = !item.unsure;
    if (item.picked !== null) {
      applyUnsure(item.q, item.correct, item.unsure);
      const verdict = ctx.container.querySelector(".quiz-verdict");
      if (verdict) verdict.textContent = verdictText(item);
      const fb = ctx.container.querySelector(".quiz-feedback");
      if (fb) fb.classList.toggle("is-unsure", item.unsure);
    }
    const b = ctx.container.querySelector(".quiz-unsure");
    if (b) updateUnsureButton(b, item);
    saveSession();
  }

  function verdictText(item) {
    if (!item.correct) return "不正解";
    return item.unsure ? "正解（自信なし → 要復習に残します）" : "正解！";
  }

  function toggleStrike(i) {
    const item = session.items[session.index];
    if (item.picked !== null) return;
    const row = ctx.container.querySelectorAll(".quiz-choice-row")[i];
    if (!row) return;
    const on = row.classList.toggle("is-struck");
    const strike = row.querySelector(".quiz-strike");
    strike.setAttribute("aria-pressed", String(on));
    strike.setAttribute("aria-label", "選択肢" + (i + 1) + (on ? "を戻す" : "を消す"));
    strike.title = (on ? "この選択肢を戻す" : "この選択肢を消す") + "（Shift + " + (i + 1) + "）";
  }

  function answer(index) {
    const item = session.items[session.index];
    if (item.picked !== null) return;
    // 消した選択肢は，戻すまで解答できない（誤タップ防止）
    const row = ctx.container.querySelectorAll(".quiz-choice-row")[index];
    if (row && row.classList.contains("is-struck")) return;
    item.picked = index;
    item.correct = item.choices[index] === item.q.answer;
    record(item.q, item.correct, item.unsure);
    saveSession();

    const c = ctx.container;
    c.querySelectorAll(".quiz-choice").forEach((b, i) => {
      b.disabled = true;
      if (item.choices[i] === item.q.answer) {
        b.classList.add("is-correct");
        b.closest(".quiz-choice-row").classList.remove("is-struck");
      } else if (i === index) b.classList.add("is-wrong");
    });
    c.querySelectorAll(".quiz-strike").forEach((s) => (s.disabled = true));

    const feedback = c.querySelector(".quiz-feedback");
    feedback.className = "quiz-feedback " + (item.correct ? "is-correct" : "is-wrong") + (item.correct && item.unsure ? " is-unsure" : "");
    feedback.append(el("div", "quiz-verdict", verdictText(item)));
    if (!item.correct) feedback.append(el("p", "quiz-answer-line", "正解: " + item.q.answer));
    if (item.q.explain) feedback.append(el("p", "quiz-explain", item.q.explain));
    const others = otherChoicesNote(item);
    if (others) feedback.append(others);
    feedback.append(docPeek(item.q));
    feedback.hidden = false;
    updateUnsureButton(c.querySelector(".quiz-unsure"), item);

    const running = c.querySelector(".quiz-running-score");
    if (running) running.textContent = "正解 " + session.items.filter((it) => it.picked !== null && it.correct).length;

    const next = c.querySelector(".quiz-next");
    next.hidden = false;
    next.focus({ preventScroll: true });
    revealInContentArea(next);
  }

  // 正解以外の選択肢が何を指すのかを，キーワード・単語帳の説明から添える
  function otherChoicesNote(item) {
    const rows = item.choices
      .map((ch, i) => ({ ch, i, note: ch === item.q.answer ? null : choiceNote(ch, item.q) }))
      .filter((r) => r.note);
    if (!rows.length) return null;
    const box = el("div", "quiz-others");
    box.append(el("div", "quiz-others-title", "ほかの選択肢"));
    const ul = el("ul", "quiz-others-list");
    rows.forEach((r) => {
      const li = el("li", r.i === item.picked ? "is-picked" : null);
      li.append(el("span", "quiz-others-choice", r.ch), el("span", "quiz-others-arrow", "→"), el("span", "quiz-others-desc", r.note));
      ul.append(li);
    });
    box.append(ul);
    return box;
  }

  // 解説と「次へ」ボタンが画面外なら見える位置まで本文エリアだけをスクロールする
  // （scrollIntoView はページ全体も動かし、iPhone でヘッダーが隠れるため使わない）
  function revealInContentArea(target) {
    const area = ctx.container.closest(".content-area");
    if (!area || !target) return;
    const overflow = target.getBoundingClientRect().bottom - area.getBoundingClientRect().bottom + 24;
    if (overflow > 0) area.scrollBy({ top: overflow, behavior: "smooth" });
  }

  function goNext() {
    if (session.index < session.items.length - 1) {
      session.index++;
      saveSession();
      renderQuestion();
    } else {
      renderResult();
    }
  }

  // ---- 結果 ----
  function renderResult() {
    clearSavedSession();
    const c = ctx.container;
    const total = session.items.length;
    const correct = session.items.filter((it) => it.correct).length;
    const unsureCount = session.items.filter((it) => it.correct && it.unsure).length;
    const rate = Math.round((correct / total) * 100);
    const reviewItems = session.items.filter((it) => !it.correct || it.unsure);
    c.innerHTML = "";

    c.append(el("div", "doc-breadcrumb", "確認問題 / " + scopeLabel(session.scope)));
    c.append(el("h1", null, "結果"));

    const score = el("div", "quiz-result");
    const big = el("div", "quiz-result-score");
    big.append(el("span", "quiz-result-num", String(correct)), el("span", "quiz-result-total", " / " + total + " 問正解"));
    score.append(big);
    score.append(el("div", "quiz-result-rate", rate + "%" + (unsureCount ? "（うち自信なし " + unsureCount + " 問）" : "")));
    const message =
      rate === 100 ? "全問正解です。この範囲はしっかり身についています。" : rate >= 80 ? "よくできています。間違えた問題だけ復習しましょう。" : rate >= 50 ? "あと一歩です。解説と資料を見直してから解き直しましょう。" : "まずは資料を読み直してから、もう一度挑戦しましょう。";
    score.append(el("p", "quiz-result-message", message));
    c.append(score);

    const actions = el("div", "quiz-actions quiz-result-actions");
    const lastScope = session.scope;
    const lastLimit = session.limit;
    if (reviewItems.length) {
      const label = unsureCount ? "間違えた・自信なしの " : "間違えた ";
      actions.append(
        button(label + reviewItems.length + " 問を解き直す", "quiz-primary", () =>
          startSession(lastScope, 0, reviewItems.map((it) => it.q))
        )
      );
    }
    actions.append(button("同じ範囲でもう一度", "quiz-secondary", () => startSession(lastScope, lastLimit)));
    actions.append(button("出題設定に戻る", "quiz-link-button", renderSetup));
    c.append(actions);

    c.append(renderBreakdown(session.items));

    if (reviewItems.length) {
      c.append(el("h2", null, "見直す問題"));
      reviewItems.forEach((it) => {
        const box = el("div", "quiz-review");
        const src = el("div", "quiz-source");
        src.append(
          el("span", "quiz-review-tag " + (it.correct ? "is-unsure" : "is-wrong"), it.correct ? "自信なし" : "不正解"),
          document.createTextNode(dirLabel(dirOf(it.q.doc)) + " / " + docTitle(it.q.doc))
        );
        box.append(src);
        box.append(el("p", "quiz-question", it.q.q));
        if (!it.correct) {
          const yours = it.choices[it.picked];
          const note = choiceNote(yours, it.q);
          box.append(el("p", "quiz-review-yours", "あなたの解答: " + yours + (note ? "（" + note + "）" : "")));
        }
        box.append(el("p", "quiz-review-answer", "正解: " + it.q.answer));
        if (it.q.explain) box.append(el("p", "quiz-explain", it.q.explain));
        box.append(docPeek(it.q));
        c.append(box);
      });
    }
    scrollToTop();
  }

  // カテゴリ別（1カテゴリだけなら資料別）の正答率。低い順に並べて苦手な分野をすぐ分かるようにする
  function renderBreakdown(items) {
    const byDir = new Set(items.map((it) => dirOf(it.q.doc))).size > 1;
    const groups = new Map();
    items.forEach((it) => {
      const key = byDir ? dirOf(it.q.doc) : it.q.doc;
      const g = groups.get(key) || { key, total: 0, correct: 0, unsure: 0 };
      g.total++;
      if (it.correct) g.correct++;
      if (it.correct && it.unsure) g.unsure++;
      groups.set(key, g);
    });
    const order = byDir ? orderedDirs() : orderedDocs();
    const rows = [...groups.values()].sort(
      (a, b) => a.correct / a.total - b.correct / b.total || order.indexOf(a.key) - order.indexOf(b.key)
    );

    const wrap = el("section", "quiz-breakdown");
    wrap.append(el("h2", null, byDir ? "カテゴリ別の正答率" : "資料別の正答率"));
    const list = el("ul", "quiz-breakdown-list");
    rows.forEach((g) => {
      const pct = Math.round((g.correct / g.total) * 100);
      const li = el("li", "quiz-breakdown-row" + (pct < 60 ? " is-low" : pct === 100 ? " is-full" : ""));
      const name = el("span", "quiz-breakdown-name", byDir ? leafLabel(g.key) : docTitle(g.key));
      const bar = el("span", "quiz-breakdown-bar");
      const fill = el("span", "quiz-breakdown-fill");
      fill.style.width = pct + "%";
      bar.append(fill);
      const num = el("span", "quiz-breakdown-num", g.correct + " / " + g.total + "（" + pct + "%）" + (g.unsure ? "・自信なし " + g.unsure : ""));
      li.append(name, bar, num);
      if (pct < 100) {
        const scope = byDir ? { type: "folder", value: g.key } : { type: "doc", value: g.key };
        li.append(button("この範囲を解く", "quiz-small", () => startSession(scope, byDir ? 10 : 0)));
      } else {
        li.append(el("span", "quiz-breakdown-spacer"));
      }
      list.append(li);
    });
    wrap.append(list);
    return wrap;
  }

  document.addEventListener("keydown", (e) => {
    if (!session || !ctx || !ctx.container.querySelector(".quiz-choices")) return;
    if (e.target.closest && e.target.closest("input, select, textarea")) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const item = session.items[session.index];
    const digit = /^Digit[1-4]$/.test(e.code) ? Number(e.code.slice(5)) : 0;
    if (e.code === "KeyU" && !e.shiftKey) {
      e.preventDefault();
      toggleUnsure();
    } else if (item.picked === null && e.shiftKey && digit) {
      e.preventDefault();
      if (digit <= item.choices.length) toggleStrike(digit - 1);
    } else if (item.picked === null && /^[1-4]$/.test(e.key)) {
      e.preventDefault();
      if (Number(e.key) <= item.choices.length) answer(Number(e.key) - 1);
    } else if (item.picked !== null && (e.key === "ArrowRight" || (e.key === "Enter" && !e.target.closest("button")))) {
      e.preventDefault();
      goNext();
    }
  });

  // ホームなどから直接出題するためのルート指定（#/quiz/@weak など）
  function scopeFromRoute(route) {
    if (route === "@weak") return { scope: { type: "weak" }, limit: 0 };
    if (route === "@random") return { scope: { type: "all" }, limit: 10 };
    if (route.startsWith("@folder:")) return { scope: { type: "folder", value: route.slice(8) }, limit: 10 };
    if (bank.some((q) => q.doc === route)) return { scope: { type: "doc", value: route }, limit: 0 };
    return null;
  }

  window.DocQuiz = {
    count(path) {
      return bank.filter((q) => q.doc === path).length;
    },
    // 資料パスで絞り込んだ成績の集計（ホーム画面用）
    summary(filter) {
      return summarize(filter ? bank.filter((q) => filter(q.doc)) : bank);
    },
    // 中断中の出題があれば，その進み具合（ホーム画面の「続きから」用）
    saved() {
      const s = loadSavedSession();
      return s ? { answered: s.items.filter((it) => it.picked !== null).length, total: s.items.length } : null;
    },
    // route: "" なら出題設定、資料パスや @weak / @random / @folder:<dir> なら該当範囲をすぐに出題する。@resume は中断した出題の続き
    render(container, options) {
      ctx = { container, manifest: options.manifest, folderLabel: options.folderLabel };
      if (options.route === "@resume") {
        const saved = loadSavedSession();
        if (saved) resumeSession(saved);
        else renderSetup();
        return;
      }
      const target = options.route ? scopeFromRoute(options.route) : null;
      if (target && questionsIn(target.scope).length) {
        startSession(target.scope, target.limit);
      } else {
        renderSetup();
      }
    },
  };
})();
