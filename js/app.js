(() => {
  "use strict";

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

  const HLJS_LIGHT = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
  const HLJS_DARK = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/atom-one-dark.min.css";

  let manifest = [];
  let titleCache = {};

  marked.setOptions({
    gfm: true,
    breaks: false,
  });

  // ---- Theme ----
  function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    hljsTheme.href = theme === "dark" ? HLJS_DARK : HLJS_LIGHT;
    localStorage.setItem("doc-viewer-theme", theme);
  }

  function initTheme() {
    const saved = localStorage.getItem("doc-viewer-theme");
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    applyTheme(saved || (prefersDark ? "dark" : "light"));
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
      return JSON.parse(localStorage.getItem("doc-viewer-titles") || "{}");
    } catch {
      return {};
    }
  }

  function saveTitleCache() {
    try {
      localStorage.setItem("doc-viewer-titles", JSON.stringify(titleCache));
    } catch {
      /* ignore quota errors */
    }
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
      .map((entry) => {
        const path = entry.path;
        const slash = path.lastIndexOf("/");
        const dir = slash === -1 ? "" : path.slice(0, slash);
        const base = (slash === -1 ? path : path.slice(slash + 1)).replace(/\.md$/i, "");
        return { path, dir, title: titleCache[path] || humanize(base), url: entry.url || null };
      });

    buildNavTree();
  }

  // ドキュメント内の最初の見出しをタイトルとしてキャッシュ・反映する
  function updateTitleFromContent(path, text) {
    const m = text.match(/^\s*#\s+(.+?)\s*$/m);
    if (!m) return;
    const title = m[1];
    const item = manifest.find((mm) => mm.path === path);
    if (item && item.title !== title) {
      item.title = title;
      titleCache[path] = title;
      saveTitleCache();
      const link = navTreeEl.querySelector('a[data-path="' + CSS.escape(path) + '"]');
      if (link) link.textContent = title;
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

  function sortFiles(files) {
    return [...files].sort((a, b) => {
      const aReadme = isReadme(a);
      const bReadme = isReadme(b);
      if (aReadme !== bReadme) return aReadme ? -1 : 1;
      return a.title.localeCompare(b.title, "ja");
    });
  }

  function sortedDirEntries(node) {
    return [...node.dirs.entries()].sort((a, b) => a[0].localeCompare(b[0], "ja"));
  }

  function renderNode(node, container) {
    const ul = document.createElement("ul");
    for (const [name, child] of sortedDirEntries(node)) {
      const li = document.createElement("li");
      const details = document.createElement("details");
      details.open = true;
      details.className = "nav-group";
      const summary = document.createElement("summary");
      summary.textContent = name;
      details.appendChild(summary);
      renderNode(child, details);
      li.appendChild(details);
      ul.appendChild(li);
    }
    for (const file of sortFiles(node.files)) {
      const li = document.createElement("li");
      const a = document.createElement("a");
      a.href = "#/" + file.path;
      a.textContent = file.title;
      a.dataset.path = file.path;
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
  }

  // ---- Search ----
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim().toLowerCase();
    const items = navTreeEl.querySelectorAll("li");
    items.forEach((li) => li.classList.remove("hidden"));
    if (!q) return;

    navTreeEl.querySelectorAll("a").forEach((a) => {
      const match = a.textContent.toLowerCase().includes(q) || a.dataset.path.toLowerCase().includes(q);
      a.closest("li").classList.toggle("hidden", !match);
    });
    // keep parent groups visible if any child matches
    navTreeEl.querySelectorAll(".nav-group").forEach((details) => {
      const anyVisible = [...details.querySelectorAll("a")].some(
        (a) => !a.closest("li").classList.contains("hidden")
      );
      details.closest("li").classList.toggle("hidden", !anyVisible);
      if (anyVisible) details.open = true;
    });
  });

  // ---- Slug helper ----
  function slugify(text) {
    return text
      .toLowerCase()
      .trim()
      .replace(/[^\p{L}\p{N}\s-]/gu, "")
      .replace(/\s+/g, "-");
  }

  function buildToc() {
    const headings = contentEl.querySelectorAll("h1, h2, h3");
    tocEl.innerHTML = "";
    if (headings.length < 2) return;

    const title = document.createElement("div");
    title.className = "toc-title";
    title.textContent = "目次";
    tocEl.appendChild(title);

    const usedIds = new Set();
    headings.forEach((h) => {
      let id = slugify(h.textContent);
      let unique = id;
      let i = 2;
      while (usedIds.has(unique) || !unique) {
        unique = id + "-" + i++;
      }
      usedIds.add(unique);
      h.id = unique;

      const a = document.createElement("a");
      a.href = "#" + currentHashPrefix() + "#" + unique;
      a.textContent = h.textContent;
      a.className = "level-" + h.tagName.slice(1);
      a.addEventListener("click", (e) => {
        e.preventDefault();
        h.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      tocEl.appendChild(a);
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

  function findDefaultPath() {
    if (manifest.length === 0) return null;
    const readme = manifest.find((m) => /^readme\.md$/i.test(m.path));
    if (readme) return readme.path;
    const sorted = [...manifest].sort((a, b) => a.path.localeCompare(b.path, "ja"));
    return sorted[0].path;
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
    if (!path) {
      contentEl.innerHTML = '<p class="empty-state">左のメニューからドキュメントを選択してください。</p>';
      tocEl.innerHTML = "";
      if (docPagerEl) docPagerEl.hidden = true;
      document.title = "Document Over HTTP";
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

      contentEl.querySelectorAll("pre code").forEach((block) => {
        if (window.hljs) hljs.highlightElement(block);
      });

      buildToc();
      renderPager(path);

      document.title = (meta ? meta.title : path) + " – Document Over HTTP";

      const targetId = location.hash.split("#")[2];
      if (targetId) {
        const el = document.getElementById(targetId);
        if (el) el.scrollIntoView({ block: "start" });
      } else {
        contentEl.scrollIntoView({ block: "start" });
      }
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

  navTreeEl.addEventListener("click", (e) => {
    if (window.innerWidth <= 700) closeNav();
  });

  window.addEventListener("hashchange", () => {
    let path = currentPath();
    if (!path) {
      path = findDefaultPath();
      if (path) {
        location.hash = "/" + path;
        return;
      }
    }
    renderPath(path);
  });

  // ---- Init ----
  function init() {
    initTheme();
    loadManifest();
    const copyYear = document.getElementById("copyYear");
    if (copyYear) copyYear.textContent = new Date().getFullYear();
    if (!currentPath()) {
      const def = findDefaultPath();
      if (def) {
        location.hash = "/" + def;
        return;
      }
    }
    renderPath(currentPath());
  }

  init();
})();
