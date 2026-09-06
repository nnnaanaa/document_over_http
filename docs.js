// ここに .md ファイルを追加すると、左のナビゲーションに表示されます。
// ビルドや GitHub への push は不要（このファイルを保存するだけで反映されます）。
//
// 書き方は2通り:
//   1. 文字列: このサイトと同じ場所に置いたローカルの .md ファイル
//        "README.md"
//   2. オブジェクト { path, url }: 別リポジトリなど外部の .md ファイル
//      （url は raw.githubusercontent.com など CORS を許可しているURLを指定する）
//        { path: "ipaddr.md", url: "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/ipaddr.md" }
window.DOC_FILES = [
  "README.md",
  {
    path: "ipaddr.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/ipaddr.md",
  },
  {
    path: "subnet-cheatsheet.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/subnet-cheatsheet.md",
  },
];
