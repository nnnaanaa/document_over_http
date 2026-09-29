(() => {
  "use strict";

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text != null) e.textContent = text;
    return e;
  }

  function link(href, className, text) {
    const a = el("a", className, text);
    a.href = href;
    return a;
  }

  const dirOf = (path) => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");

  function statCard(value, label) {
    const card = el("div", "quiz-stat");
    card.append(el("div", "quiz-stat-value", String(value)), el("div", "quiz-stat-label", label));
    return card;
  }

  function actionCard(href, title, sub, primary) {
    const a = link(href, "home-action" + (primary ? " is-primary" : ""));
    a.append(el("span", "home-action-title", title), el("span", "home-action-sub", sub));
    return a;
  }

  function progressBar(done, total) {
    const bar = el("div", "home-bar");
    const fill = el("div", "home-bar-fill");
    fill.style.width = total ? ((done / total) * 100).toFixed(1) + "%" : "0%";
    bar.append(fill);
    return bar;
  }

  function render(container, { manifest, folderLabel, lastPath }) {
    const quiz = window.DocQuiz;
    const keywords = Array.isArray(window.KEYWORDS) ? window.KEYWORDS : [];
    const docs = manifest.filter((m) => m.dir);
    const all = quiz ? quiz.summary() : { total: 0, answered: 0, mastered: 0, weak: 0 };

    container.innerHTML = "";
    container.append(el("div", "doc-breadcrumb", "ホーム"));
    container.append(el("h1", null, "学習ホーム"));
    container.append(
      el("p", "doc-lead", "資料を読む → 四択問題で確認する → キーワードで復習する、の順に進めると効率よく覚えられます。")
    );

    const stats = el("div", "quiz-stats");
    stats.append(
      statCard(docs.length, "資料"),
      statCard(all.mastered + " / " + all.total, "正解済みの問題"),
      statCard(all.weak, "要復習の問題"),
      statCard(keywords.length, "キーワード")
    );
    container.append(stats);

    const actions = el("div", "home-actions");
    const last = lastPath && manifest.find((m) => m.path === lastPath);
    if (last) actions.append(actionCard("#/" + last.path, "前回の続きを読む", last.title, true));
    if (all.weak) actions.append(actionCard("#/quiz/@weak", "要復習の問題を解く", all.weak + " 問（前回まちがえた問題）", !last));
    actions.append(actionCard("#/quiz/@random", "ランダムに10問", "全範囲からの腕試し", !last && !all.weak));
    actions.append(actionCard("#/keywords", "キーワードをながめる", "重要語を自動で切り替え表示"));
    if (window.DocKakomon && window.DocKakomon.count()) {
      actions.append(actionCard("#/kakomon", "過去問をながめる", "午前Ⅱ・午後の問題と解答例（直近3年）"));
    }
    container.append(actions);

    container.append(el("h2", null, "カテゴリ"));
    const grid = el("div", "home-grid");
    const dirs = [...new Set(docs.map((m) => m.dir))];
    dirs.forEach((dir) => {
      const inDir = docs.filter((m) => m.dir === dir);
      const s = quiz ? quiz.summary((p) => dirOf(p) === dir) : { total: 0, mastered: 0, weak: 0 };
      const kwCount = keywords.filter((k) => dirOf(k.doc) === dir).length;

      const card = el("section", "home-cat");
      const head = el("div", "home-cat-head");
      head.append(el("h3", "home-cat-title", folderLabel(dir.split("/").pop())), el("span", "home-cat-count", inDir.length + " 資料"));
      card.append(head);

      if (s.total) {
        const prog = el("div", "home-cat-progress");
        prog.append(progressBar(s.mastered, s.total));
        prog.append(
          el("div", "home-cat-progress-text", "正解済み " + s.mastered + " / " + s.total + " 問" + (s.weak ? "・要復習 " + s.weak : ""))
        );
        card.append(prog);
      }

      const list = el("ul", "home-cat-docs");
      inDir.forEach((m) => {
        const li = el("li");
        li.append(link("#/" + m.path, null, m.title));
        list.append(li);
      });
      card.append(list);

      const foot = el("div", "home-cat-actions");
      if (s.total) foot.append(link("#/quiz/@folder:" + dir, "quiz-small", "問題を解く"));
      if (kwCount) foot.append(link("#/keywords/@folder:" + dir, "quiz-small", "キーワード"));
      card.append(foot);
      grid.append(card);
    });
    container.append(grid);

    const readme = manifest.find((m) => !m.dir && /readme\.md$/i.test(m.path));
    if (readme) {
      const about = el("p", "home-about");
      about.append(link("#/" + readme.path, null, "このビューアについて（README）"));
      container.append(about);
    }
  }

  window.DocHome = { render };
})();
