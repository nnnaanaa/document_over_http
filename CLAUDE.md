# CLAUDE.md

このファイルは Claude Code (claude.ai/code) がこのリポジトリで作業する際のガイドです。

## 概要

`document_over_http` はこのディレクトリ配下の Markdown ファイルをブラウザで閲覧するための静的ドキュメントビューア「Document Over HTTP」。GitHub Pages でのホストが前提だが、ビルドツール・パッケージマネージャ・外部 API 呼び出しは一切なし。ローカルでも push 前でもそのまま動く。

## アーキテクチャ

- `index.html` — エントリーポイント。ヘッダー・サイドバー(ナビ)・本文・目次の4ペイン構成。
- `docs.js` — `window.DOC_FILES` に `.md` ファイルを手書きで列挙するだけの一覧ファイル。**`.md` を追加/削除/リネームしたら手動で1行編集する**（ビルドスクリプト不要）。要素は文字列（同一オリジンのローカルファイル）か `{ path, url }`（外部URL、例: 別リポジトリの raw.githubusercontent.com）のどちらか。
- `css/style.css` — CSS変数によるライト/ダークテーマ。カラーパレットは `#190482` `#7752FE` `#8E8FFA` `#C2D9FF`。フォントは Google Fonts の Inter（+ 和文は OS 標準フォント）。
- `js/app.js` — `docs.js` の `DOC_FILES` を読み込んでナビツリーを構築する。選択された `.md` は `fetch` して [marked](https://github.com/markedjs/marked) でレンダリング、[DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズする。ルーティングは `location.hash`（例: `#/docs/foo.md`）。
- ナビの初期タイトルはファイル名由来。ドキュメントを開くと本文の `# 見出し` を読み取ってタイトルを更新し `localStorage` にキャッシュする。

### 外部依存（すべてCDN、cdnjs / Google Fonts）
- marked 12.0.2
- DOMPurify 3.1.6
- highlight.js 11.9.0（テーマはライト/ダーク切り替えで `<link id="hljs-theme">` の href を差し替え）
- Google Fonts Inter

### アイコン
テーマ切り替えボタンは絵文字ではなくインライン SVG（太陽・月アイコン）を使用。`[data-theme]` に応じて CSS で表示を切り替える。絵文字は一切使用しない方針。

## 注意事項

- `.md` を追加したら `docs.js` の `DOC_FILES` に追記しないとサイドバーに表示されない。
- `file://` で直接開くと `fetch` が失敗するため、必ず HTTP サーバ経由で確認する（`python -m http.server` または付属の `docker-compose.yml`）。
- GitHub Pages 以外（独自ドメイン等）でもそのまま動く。リポジトリ固有の設定は不要。
