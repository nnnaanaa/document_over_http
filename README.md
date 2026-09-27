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

   別リポジトリの `.md` を表示したい場合は、文字列の代わりに `{ path, url, title, summary }` を指定する（`url` には raw.githubusercontent.com など CORS を許可しているURLを使う。`title` は任意で、ナビゲーションに出す短い表示名。`summary` も任意で、ナビゲーションのタイトル下とページ冒頭に表示される一行説明）。

   ```js
   window.DOC_FILES = [
     "README.md",
     {
       path: "subnet-cheatsheet.md",
       url: "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/subnet-cheatsheet.md",
       title: "サブネット計算チートシート",
       summary: "サブネット計算の公式・早見表まとめ",
     },
   ];
   ```

   フォルダ名を日本語などで表示したい場合は `window.DOC_FOLDER_LABELS = { "ip-address": "IPアドレス" }` のように対応表を書く。

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

- 左サイドバーにフォルダ構成に沿ったナビゲーションツリーを自動生成（並び順は `docs.js` に書いた順。`summary` を指定すればタイトル下に一行説明も表示）
- 右側に見出しから自動生成した目次（ページ内リンク）。今読んでいる節をハイライト
- ページ冒頭にフォルダのパンくずと一行説明を表示し、表は横スクロール可能な枠に収める
- 四択問題（`#/quiz`）: 範囲（すべて / カテゴリ / 資料 / 要復習 / 未回答）と問題数を選んで出題。解答直後に正誤・解説・資料へのリンクを表示し、成績はブラウザ（`localStorage`）に記録。各資料の末尾からその資料の問題だけを解くこともできる

## 四択問題の追加

[quiz.js](quiz.js) の `window.QUIZ_QUESTIONS` に1問ずつ追加する。`doc` は `docs.js` に登録した資料のパス。選択肢の順番は表示時にシャッフルされる。

```js
{ doc: "network/lan/poe.md", q: "IEEE 802.3at の最大供給電力は？", answer: "30W", wrong: ["15.4W", "60W", "90W"], explain: "802.3at は PoE+。" },
```
- 検索ボックスでタイトル・パスを絞り込み
- ライト / ダークテーマ切り替え（設定は保存される）
- コードブロックのシンタックスハイライト
- Markdown 内の `.md` へのリンクはページ遷移なしでアプリ内遷移

## 仕組み

- `.md` ファイルの一覧は [docs.js](docs.js) の `window.DOC_FILES`（手書きの配列）から読み込みます。ビルドスクリプトは不要で、このファイルを保存した瞬間から反映されます。配列の要素は文字列（同一オリジンのローカルファイル）か `{ path, url }`（外部URLから取得）のどちらでも指定できます。
- ナビゲーションのタイトルは `title` があればそれを使い、なければ本文先頭の `# 見出し` から決めます（読み込み前はファイル名から生成し、`localStorage` に記憶）。本文が `# ファイル名.md` で始まる場合は、直後の `## 見出し` をページタイトルとして扱います。
- 本文は選択時に `fetch` で取得し、[marked](https://github.com/markedjs/marked) で HTML に変換、[DOMPurify](https://github.com/cure53/DOMPurify) でサニタイズしてから表示します。

これはサンプルドキュメントです。実際に表示されるかどうかは [sample.md](sample.md) も参照してください。
