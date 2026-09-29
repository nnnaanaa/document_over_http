(() => {
  "use strict";

  const topbarEl = document.querySelector(".topbar");
  const contentEl = document.getElementById("content");
  const docPagerEl = document.getElementById("docPager");
  const navTreeEl = document.getElementById("navTree");
  const tocEl = document.getElementById("toc");
  const searchInput = document.getElementById("searchInput");
  const themeToggle = document.getElementById("themeToggle");
  const hljsTheme = document.getElementById("hljs-theme");
  const sidebar = document.getElementById("sidebar");
  const navToggle = document.getElementById("navToggle");
  const navOverlay = document.getElementById("navOverlay");
  const contentArea = document.querySelector(".content-area");

  // scrollIntoView はページ全体までスクロールさせてしまい、iPhone では
  // 最上段（メニューボタン等）がアドレスバーの裏に押し出されるため、本文エリアだけを動かす
  function scrollContentTo(el, smooth) {
    const margin = el ? parseFloat(getComputedStyle(el).scrollMarginTop) || 0 : 0;
    const top = el ? contentArea.scrollTop + el.getBoundingClientRect().top - contentArea.getBoundingClientRect().top - margin : 0;
    contentArea.scrollTo({ top: Math.max(0, top), behavior: smooth ? "smooth" : "auto" });
    if (window.scrollY) window.scrollTo(0, 0);
  }

  const HLJS_LIGHT = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
  const HLJS_DARK = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";

  let manifest = [];
  let titleCache = {};

  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  // ---- Theme ----
  // Cookie/サイトデータをブロックしている環境では localStorage へのアクセス自体が例外になるため、
  // 失敗しても画面の表示は続けられるようにする
  function storageGet(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  function storageSet(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {
      /* 保存できなくても表示には影響しない */
    }
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    hljsTheme.href = theme === "dark" ? HLJS_DARK : HLJS_LIGHT;
    storageSet("doc-viewer-theme", theme);
  }

  function initTheme() {
    applyTheme(storageGet("doc-viewer-theme") || "light");
  }

  themeToggle.addEventListener("click", () => {
    const current = document.documentElement.getAttribute("data-theme");
    applyTheme(current === "dark" ? "light" : "dark");
  });

  // ---- Mobile nav ----
  function closeNav() {
    sidebar.classList.remove("open");
    navOverlay.classList.remove("open");
    navToggle.setAttribute("aria-expanded", "false");
  }
  navToggle.addEventListener("click", () => {
    const open = sidebar.classList.toggle("open");
    navOverlay.classList.toggle("open", open);
    navToggle.setAttribute("aria-expanded", String(open));
  });
  navOverlay.addEventListener("click", closeNav);

  function humanize(basename) {
    return basename.replace(/[-_]+/g, " ").trim() || basename;
  }

  function loadTitleCache() {
    try {
      return JSON.parse(storageGet("doc-viewer-titles") || "{}") || {};
    } catch {
      return {};
    }
  }

  function saveTitleCache() {
    storageSet("doc-viewer-titles", JSON.stringify(titleCache));
  }

  // ---- Manifest loading ----
  // docs.js の window.DOC_FILES（手書きの .md パス一覧）を読み込む。
  // ビルドや GitHub への push は不要で、ローカルでもそのまま動く。
  function loadManifest() {
    titleCache = loadTitleCache();
    const files = Array.isArray(window.DOC_FILES) ? window.DOC_FILES : [];

    manifest = files
      // 文字列は同一オリジンのローカルファイル、オブジェクトは { path, url } で外部ソースを指定できる
      .map((entry) => (typeof entry === "string" ? { path: entry } : entry))
      .filter((entry) => entry && typeof entry.path === "string" && /\.md$/i.test(entry.path))
      .map((entry, order) => {
        const path = entry.path;
        const slash = path.lastIndexOf("/");
        const dir = slash === -1 ? "" : path.slice(0, slash);
        const base = (slash === -1 ? path : path.slice(slash + 1)).replace(/\.md$/i, "");
        return {
          path,
          dir,
          order,
          fixedTitle: Boolean(entry.title),
          title: entry.title || titleCache[path] || humanize(base),
          url: entry.url || null,
          summary: entry.summary || "",
        };
      });

    buildNavTree();
  }

  function folderLabel(name) {
    const labels = window.DOC_FOLDER_LABELS || {};
    return labels[name] || name;
  }

  // 先頭が「# ファイル名.md」の資料は、直後の「## 見出し」を本来のタイトルとして扱う
  function extractTitle(md) {
    const lines = md.split(/\r?\n/);
    const first = lines.findIndex((l) => /^#\s+\S/.test(l));
    if (first === -1) return null;
    const h1 = lines[first].replace(/^#\s+/, "").trim();
    if (!/\.md$/i.test(h1)) return h1;
    const next = lines.slice(first + 1).find((l) => l.trim() !== "");
    const m = next && next.match(/^##\s+(.+?)\s*$/);
    return m ? m[1] : h1;
  }

  function updateTitleFromContent(path, text) {
    const title = extractTitle(text);
    if (!title) return;
    const item = manifest.find((mm) => mm.path === path);
    if (item && !item.fixedTitle && item.title !== title) {
      item.title = title;
      titleCache[path] = title;
      saveTitleCache();
      const link = navTreeEl.querySelector('a[data-path="' + CSS.escape(path) + '"]');
      if (!link) return;
      const titleEl = link.querySelector(".nav-link-title");
      if (titleEl) titleEl.textContent = title;
      link.title = item.summary ? title + " — " + item.summary : title;
    }
  }

  function groupByDir(items) {
    const root = { dirs: new Map(), files: [] };
    for (const item of items) {
      const parts = item.dir ? item.dir.split("/").filter(Boolean) : [];
      let node = root;
      for (const part of parts) {
        if (!node.dirs.has(part)) {
          node.dirs.set(part, { dirs: new Map(), files: [] });
        }
        node = node.dirs.get(part);
      }
      node.files.push(item);
    }
    return root;
  }

  // README.md はタイトルが変わっても常に各階層の先頭に固定する
  function isReadme(item) {
    return /^readme\.md$/i.test(item.path.split("/").pop());
  }

  // docs.js に書いた順序をそのまま表示順にする（学習順に並べられるように）
  function sortFiles(files) {
    return [...files].sort((a, b) => {
      const aReadme = isReadme(a);
      const bReadme = isReadme(b);
      if (aReadme !== bReadme) return aReadme ? -1 : 1;
      return a.order - b.order;
    });
  }

  function sortedDirEntries(node) {
    return [...node.dirs.entries()];
  }

  function renderNode(node, container) {
    const ul = document.createElement("ul");
    for (const [name, child] of sortedDirEntries(node)) {
      const li = document.createElement("li");
      const details = document.createElement("details");
      details.open = true;
      details.className = "nav-group";
      const summary = document.createElement("summary");
      summary.textContent = folderLabel(name);
      details.appendChild(summary);
      renderNode(child, details);
      li.appendChild(details);
      ul.appendChild(li);
    }
    for (const file of sortFiles(node.files)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#/" + file.path;
      a.dataset.path = file.path;
      a.title = file.summary ? file.title + " — " + file.summary : file.title;

      const titleEl = document.createElement("span");
      titleEl.className = "nav-link-title";
      titleEl.textContent = file.title;
      a.appendChild(titleEl);

      if (file.summary) {
        const summaryEl = document.createElement("span");
        summaryEl.className = "nav-link-summary";
        summaryEl.textContent = file.summary;
        a.appendChild(summaryEl);
      }

      li.appendChild(a);
      ul.appendChild(li);
    }
    container.appendChild(ul);
  }

  // ナビゲーションと同じ順序（サブフォルダ→ファイル、README優先）でフラットな一覧を作る（前へ/次へ用）
  function flattenOrder(node) {
    let result = [];
    for (const [, child] of sortedDirEntries(node)) {
      result = result.concat(flattenOrder(child));
    }
    return result.concat(sortFiles(node.files));
  }

  function buildNavTree() {
    navTreeEl.innerHTML = "";
    if (manifest.length === 0) {
      const empty = document.createElement("p");
      empty.className = "empty";
      empty.textContent = "docs.js の DOC_FILES に .md ファイルのパスを追加してください。";
      navTreeEl.appendChild(empty);
      return;
    }
    const tree = groupByDir(manifest);
    renderNode(tree, navTreeEl);
    highlightActiveNav();
  }

  function highlightActiveNav() {
    const current = currentPath();
    navTreeEl.querySelectorAll("a").forEach((a) => {
      a.classList.toggle("active", a.dataset.path === current);
    });
    const quizLink = document.getElementById("quizLink");
    if (quizLink) quizLink.classList.toggle("active", isQuizPath(current));
    const keywordsLink = document.getElementById("keywordsLink");
    if (keywordsLink) keywordsLink.classList.toggle("active", isKeywordsPath(current));
    const homeLink = document.getElementById("homeLink");
    if (homeLink) homeLink.classList.toggle("active", isHomePath(current));
    const kakomonLink = document.getElementById("kakomonLink");
    if (kakomonLink) kakomonLink.classList.toggle("active", isKakomonPath(current));
  }

  function isKakomonPath(path) {
    return path === "kakomon" || path.startsWith("kakomon/");
  }

  function renderKakomonPage() {
    enterAppPage("過去問をながめる");
    if (!window.DocKakomon) {
      contentEl.innerHTML = '<p class="error">過去問データを読み込めませんでした。</p>';
    } else {
      window.DocKakomon.render(contentEl);
    }
    highlightActiveNav();
  }

  const LAST_DOC_KEY = "doc-viewer-last";

  function isHomePath(path) {
    return !path || path === "home";
  }

  function isKeywordsPath(path) {
    return path === "keywords" || path.startsWith("keywords/");
  }

  // 資料以外の画面（ホーム・四択問題・キーワード）に切り替えるときの共通処理
  function enterAppPage(title) {
    if (tocObserver) tocObserver.disconnect();
    tocEl.innerHTML = "";
    if (docPagerEl) docPagerEl.hidden = true;
    document.title = title + " – Document Over HTTP";
    scrollContentTo(null, false);
  }

  function renderHomePage() {
    enterAppPage("学習ホーム");
    if (!window.DocHome) {
      contentEl.innerHTML = '<p class="error">ホーム画面を読み込めませんでした。</p>';
    } else {
      window.DocHome.render(contentEl, { manifest, folderLabel, lastPath: storageGet(LAST_DOC_KEY) });
    }
    highlightActiveNav();
  }

  function renderKeywordsPage(path) {
    enterAppPage("キーワードをながめる");
    if (!window.DocKeywords) {
      contentEl.innerHTML = '<p class="error">キーワードデータを読み込めませんでした。</p>';
    } else {
      const route = path.slice("keywords/".length);
      const scope = route.startsWith("@") ? route.slice(1) : "";
      window.DocKeywords.render(contentEl, { manifest, folderLabel, scope });
    }
    highlightActiveNav();
  }

  function isQuizPath(path) {
    return path === "quiz" || path.startsWith("quiz/");
  }

  function renderQuizPage(path) {
    enterAppPage("四択問題");
    if (!window.DocQuiz) {
      contentEl.innerHTML = '<p class="error">問題データを読み込めませんでした。</p>';
    } else {
      window.DocQuiz.render(contentEl, { route: path.slice("quiz/".length), manifest, folderLabel });
    }
    highlightActiveNav();
  }

  // 資料の末尾に、その資料の確認問題へのボタンを置く
  function appendQuizCta(path) {
    const n = window.DocQuiz ? window.DocQuiz.count(path) : 0;
    if (!n) return;
    const box = document.createElement("div");
    box.className = "quiz-cta";
    const text = document.createElement("div");
    text.className = "quiz-cta-text";
    const strong = document.createElement("strong");
    strong.textContent = "理解度をチェック";
    const sub = document.createElement("span");
    sub.textContent = "この資料の内容から " + n + " 問の四択問題を出題します。";
    text.append(strong, sub);
    const a = document.createElement("a");
    a.className = "quiz-cta-button";
    a.href = "#/quiz/" + path;
    a.textContent = "確認問題を解く";
    box.append(text, a);
    contentEl.appendChild(box);
  }

  // ---- Search ----
  // 本文中でヒットした箇所の前後を抜粋し、一致部分を <mark> で強調したスニペットを作る
  function addSnippet(li, text, index, queryLen) {
    const CONTEXT_BEFORE = 20;
    const CONTEXT_AFTER = 40;
    const start = Math.max(0, index - CONTEXT_BEFORE);
    const end = Math.min(text.length, index + queryLen + CONTEXT_AFTER);
    const before = (start > 0 ? "…" : "") + text.slice(start, index).replace(/\s+/g, " ");
    const hit = text.slice(index, index + queryLen);
    const after = text.slice(index + queryLen, end).replace(/\s+/g, " ") + (end < text.length ? "…" : "");

    const snippetEl = document.createElement("div");
    snippetEl.className = "nav-snippet";
    snippetEl.append(before);
    const mark = document.createElement("mark");
    mark.textContent = hit;
    snippetEl.appendChild(mark);
    snippetEl.append(after);
    li.appendChild(snippetEl);
  }

  function applySearchFilter() {
    const rawQuery = searchInput.value.trim();
    const q = rawQuery.toLowerCase();
    const items = navTreeEl.querySelectorAll("li");
    items.forEach((li) => {
      li.classList.remove("hidden");
      const snippet = li.querySelector(".nav-snippet");
      if (snippet) snippet.remove();
    });
    if (!q) return;

    navTreeEl.querySelectorAll("a").forEach((a) => {
      const meta = manifest.find((m) => m.path === a.dataset.path);
      const titleMatch = a.textContent.toLowerCase().includes(q);
      const pathMatch = a.dataset.path.toLowerCase().includes(q);
      const bodyIndex = meta && meta.body ? meta.body.toLowerCase().indexOf(q) : -1;
      const li = a.closest("li");
      li.classList.toggle("hidden", !(titleMatch || pathMatch || bodyIndex !== -1));
      // タイトル/パスで既に一致箇所が見えている場合は、本文スニペットは出さない
      if (bodyIndex !== -1 && !titleMatch && !pathMatch) {
        addSnippet(li, meta.body, bodyIndex, rawQuery.length);
      }
    });
    // keep parent groups visible if any child matches
    navTreeEl.querySelectorAll(".nav-group").forEach((details) => {
      const anyVisible = [...details.querySelectorAll("a")].some(
        (a) => !a.closest("li").classList.contains("hidden")
      );
      details.closest("li").classList.toggle("hidden", !anyVisible);
      if (anyVisible) details.open = true;
    });
  }
  searchInput.addEventListener("input", applySearchFilter);

  // 本文全文検索用に、表示をブロックしないようバックグラウンドで全ドキュメントを先読みする
  async function prefetchAllContent() {
    await Promise.all(
      manifest.map(async (item) => {
        try {
          const res = await fetch(item.url || item.path, { cache: "no-cache" });
          if (!res.ok) return;
          item.body = await res.text();
          updateTitleFromContent(item.path, item.body);
        } catch {
          /* 取得できないファイルは検索対象から外れるだけで無視する */
        }
      })
    );
    applySearchFilter();
  }

  // ---- Slug helper ----
  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-");
  }

  let tocObserver = null;

  function buildToc() {
    const usedIds = new Set();
    contentEl.querySelectorAll("h1, h2, h3").forEach((h) => {
      const id = slugify(h.textContent);
      let unique = id;
      let i = 2;
      while (usedIds.has(unique) || !unique) {
        unique = id + "-" + i++;
      }
      usedIds.add(unique);
      h.id = unique;
    });

    // ページタイトル(h1)は目次に含めず、節(h2)と小節(h3)だけを並べる
    const headings = [...contentEl.querySelectorAll("h2, h3")];
    tocEl.innerHTML = "";
    if (tocObserver) tocObserver.disconnect();
    if (headings.length < 2) return;

    const title = document.createElement("div");
    title.className = "toc-title";
    title.textContent = "このページの内容";
    tocEl.appendChild(title);

    const links = new Map();
    headings.forEach((h) => {
      const a = document.createElement("a");
      a.href = "#" + currentHashPrefix() + "#" + h.id;
      a.textContent = h.textContent;
      a.className = "level-" + h.tagName.slice(1);
      a.addEventListener("click", (e) => {
        e.preventDefault();
        scrollContentTo(h, true);
      });
      tocEl.appendChild(a);
      links.set(h, a);
    });

    // 今読んでいる節を目次上でハイライトする
    const visible = new Set();
    tocObserver = new IntersectionObserver(
      (entries) => {
        entries.forEach((en) => (en.isIntersecting ? visible.add(en.target) : visible.delete(en.target)));
        const current = headings.find((h) => visible.has(h));
        if (!current) return;
        links.forEach((a, h) => a.classList.toggle("active", h === current));
      },
      { root: document.querySelector(".content-area"), rootMargin: "0px 0px -70% 0px" }
    );
    headings.forEach((h) => tocObserver.observe(h));
  }

  // md の「# ファイル名.md」を外して「## 見出し」をページタイトルに昇格し、パンくずと概要を添える
  function decorateDocument(meta) {
    const first = contentEl.firstElementChild;
    if (first && first.tagName === "H1" && /\.md$/i.test(first.textContent.trim())) {
      const next = first.nextElementSibling;
      first.remove();
      if (next && next.tagName === "H2") {
        const h1 = document.createElement("h1");
        h1.innerHTML = next.innerHTML;
        next.replaceWith(h1);
      }
    }

    const titleEl = contentEl.firstElementChild;
    if (titleEl && titleEl.tagName === "H1") {
      const after = titleEl.nextElementSibling;
      if (after && after.tagName === "HR") after.remove();

      if (meta && meta.dir) {
        const crumb = document.createElement("div");
        crumb.className = "doc-breadcrumb";
        crumb.textContent = meta.dir.split("/").map(folderLabel).join(" / ");
        titleEl.before(crumb);
      }
      if (meta && meta.summary) {
        const lead = document.createElement("p");
        lead.className = "doc-lead";
        lead.textContent = meta.summary;
        titleEl.after(lead);
      }
    }

    contentEl.querySelectorAll("table").forEach((table) => {
      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      table.replaceWith(wrap);
      wrap.appendChild(table);
    });
  }

  function currentHashPrefix() {
    return "/" + currentPath();
  }

  // ---- Rendering ----
  function currentPath() {
    const hash = decodeURIComponent(location.hash.replace(/^#\/?/, ""));
    return hash.split("#")[0];
  }

  function makePagerLink(item, label, className) {
    const a = document.createElement("a");
    a.href = "#/" + item.path;
    a.className = "pager-link " + className;
    const labelEl = document.createElement("span");
    labelEl.className = "pager-label";
    labelEl.textContent = label;
    const titleEl = document.createElement("span");
    titleEl.className = "pager-title";
    titleEl.textContent = item.title;
    a.appendChild(labelEl);
    a.appendChild(titleEl);
    return a;
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // 権限がない/非対応の環境向けのフォールバック
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        return ok;
      } catch {
        return false;
      }
    }
  }

  function addCodeCopyButtons() {
    contentEl.querySelectorAll("pre").forEach((pre) => {
      if (pre.querySelector(".code-copy-btn")) return;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "code-copy-btn";
      btn.setAttribute("aria-label", "Copy code");
      btn.title = "Copy code";
      btn.innerHTML =
        '<svg class="icon icon-copy" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5.5" y="5.5" width="9" height="9" rx="1.5"/><path d="M3.5 10.5h-1A1.5 1.5 0 0 1 1 9V2.5A1.5 1.5 0 0 1 2.5 1H9a1.5 1.5 0 0 1 1.5 1.5v1"/></svg>' +
        '<svg class="icon icon-check" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 8.5 6.5 12 13 4"/></svg>';
      btn.addEventListener("click", async () => {
        const code = pre.querySelector("code");
        const text = code ? code.textContent : pre.textContent;
        if (!(await copyToClipboard(text))) return;
        btn.classList.add("copied");
        btn.setAttribute("aria-label", "Copied");
        clearTimeout(btn._resetTimer);
        btn._resetTimer = setTimeout(() => {
          btn.classList.remove("copied");
          btn.setAttribute("aria-label", "Copy code");
        }, 1500);
      });
      pre.appendChild(btn);
    });
  }

  function renderPager(path) {
    if (!docPagerEl) return;
    const order = flattenOrder(groupByDir(manifest));
    const idx = order.findIndex((m) => m.path === path);
    const prev = idx > 0 ? order[idx - 1] : null;
    const next = idx !== -1 && idx < order.length - 1 ? order[idx + 1] : null;

    docPagerEl.innerHTML = "";
    if (!prev && !next) {
      docPagerEl.hidden = true;
      return;
    }
    docPagerEl.hidden = false;
    docPagerEl.appendChild(prev ? makePagerLink(prev, "← 前へ", "pager-prev") : document.createElement("span"));
    if (next) docPagerEl.appendChild(makePagerLink(next, "次へ →", "pager-next"));
  }

  async function renderPath(path) {
    if (window.DocKeywords) window.DocKeywords.stop();
    if (window.DocKakomon) window.DocKakomon.stop();
    if (isKakomonPath(path)) {
      renderKakomonPage();
      return;
    }
    if (isHomePath(path)) {
      renderHomePage();
      return;
    }
    if (isQuizPath(path)) {
      renderQuizPage(path);
      return;
    }
    if (isKeywordsPath(path)) {
      renderKeywordsPage(path);
      return;
    }

    contentEl.innerHTML = '<p class="loading">読み込み中…</p>';
    tocEl.innerHTML = "";
    if (docPagerEl) docPagerEl.hidden = true;

    try {
      const meta = manifest.find((m) => m.path === path);
      const source = (meta && meta.url) || path;
      const res = await fetch(source, { cache: "no-cache" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const md = await res.text();
      updateTitleFromContent(path, md);
      const rawHtml = marked.parse(md);
      const safeHtml = window.DOMPurify ? DOMPurify.sanitize(rawHtml) : rawHtml;
      contentEl.innerHTML = safeHtml;
      decorateDocument(meta);
      appendQuizCta(path);
      if (meta && meta.dir) storageSet(LAST_DOC_KEY, path);

      contentEl.querySelectorAll("pre code").forEach((block) => {
        if (window.hljs) hljs.highlightElement(block);
      });
      addCodeCopyButtons();

      buildToc();
      renderPager(path);

      const pageH1 = contentEl.querySelector("h1");
      document.title = (pageH1 ? pageH1.textContent : meta ? meta.title : path) + " – Document Over HTTP";

      const targetId = location.hash.split("#")[2];
      const target = targetId ? document.getElementById(targetId) : null;
      scrollContentTo(target, false);
    } catch (err) {
      contentEl.innerHTML =
        '<p class="error">ドキュメントを読み込めませんでした: ' +
        String(err.message || err) +
        "</p>";
    }

    highlightActiveNav();
  }

  // ---- Link interception for in-app .md navigation ----
  contentEl.addEventListener("click", (e) => {
    const a = e.target.closest("a");
    if (!a) return;
    const href = a.getAttribute("href");
    if (!href || /^([a-z]+:)?\/\//i.test(href) || href.startsWith("#")) return;
    if (!/\.md($|[?#])/i.test(href)) return;

    e.preventDefault();
    const base = currentPath().split("/").slice(0, -1).join("/");
    const resolved = new URL(href, "https://x/" + (base ? base + "/" : "")).pathname.replace(/^\//, "");
    location.hash = "/" + resolved;
  });

  // 開閉式のサイドバーでは、リンクを選んだら閉じる（フォルダ見出しの開閉では閉じない）
  sidebar.addEventListener("click", (e) => {
    if (!e.target.closest("a")) return;
    if (getComputedStyle(navToggle).display !== "none") closeNav();
  });

  window.addEventListener("hashchange", () => {
    renderPath(currentPath());
  });

  // ---- Init ----
  // モバイルではヘッダーが折り返して高さが変わるため、実測してサイドバー/オーバーレイの開始位置に反映する
  function syncTopbarHeight() {
    if (!topbarEl) return;
    document.documentElement.style.setProperty("--topbar-h", topbarEl.offsetHeight + "px");
  }
  window.addEventListener("resize", syncTopbarHeight);

  function init() {
    initTheme();
    loadManifest();
    prefetchAllContent();
    syncTopbarHeight();
    const copyYear = document.getElementById("copyYear");
    if (copyYear) copyYear.textContent = new Date().getFullYear();
    renderPath(currentPath());
  }

  init();
})();
