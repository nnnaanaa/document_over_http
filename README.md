# Document Over HTTP

このディレクトリ配下に置いた Markdown (`.md`) ファイルを、ブラウザで見やすく閲覧できる静的サイトです。ビルドツールや事前加工スクリプトは一切不要で、GitHub Pages でそのままホストできます。ローカルで確認する場合も GitHub への push は不要です。

## 使い方

1. このディレクトリ以下の好きな場所に `.md` ファイルを追加する。
2. [docs.js](docs.js) の `DOC_FILES` にそのファイルのパスを1行追加する。

   ```js
   window.DOC_FILES = [
     "README.md",
     "sample.md",
     "docs/guide.md", // 追加した分だけ増やす
   ];
   ```

   別リポジトリの `.md` を表示したい場合は、文字列の代わりに `{ path, url }` を指定する（`url` には raw.githubusercontent.com など CORS を許可しているURLを使う）。

   ```js
   window.DOC_FILES = [
     "README.md",
     {
       path: "subnet-cheatsheet.md",
       url: "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/subnet-cheatsheet.md",
     },
   ];
   ```

3. HTTP サーバ経由で `index.html` を開く（`file://` では `fetch` が失敗するため、必ず HTTP 経由で開いてください）。

   ```bash
   python -m http.server 8000
   ```

   もしくは [docker-compose.yml](docker-compose.yml) で nginx を起動してもよいです。

   ```bash
   docker compose up
   ```

GitHub Pages で公開する場合は、リポジトリを push して Pages を有効化するだけです。

## 機能

- 左サイドバーにフォルダ構成に沿ったナビゲーションツリーを自動生成
- 右側に見出しから自動生成した目次（ページ内リンク）
- 検索ボックスでタイトル・パスを絞り込み
- ライト / ダークテーマ切り替え（設定は保存される）
- コードブロックのシンタックスハイライト
- Markdown 内の `.md` へのリンクはページ遷移なしでアプリ内遷移

## 仕組み

- `.md` ファイルの一覧は [docs.js](docs.js) の `window.DOC_FILES`（手書きの配列）から読み込みます。ビルドスクリプトは不要で、このファイルを保存した瞬間から反映されます。配列の要素は文字列（同一オリジンのローカルファイル）か `{ path, url }`（外部URLから取得）のどちらでも指定できます。
- ナビゲーションの初期タイトルはファイル名から生成し、実際にドキュメントを開くと本文先頭の `# 見出し` を読み取ってタイトルを更新・記憶します（`localStorage`）。
- 本文は選択時に `fetch` で取得し、[marked](https://github.com/markedjs/marked) で HTML に変換、[DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズしてから表示します。

これはサンプルドキュメントです。実際に表示されるかどうかは [sample.md](sample.md) も参照してください。
