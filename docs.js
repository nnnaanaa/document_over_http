// ここに .md ファイルを追加すると、左のナビゲーションに表示されます。
// ビルドや GitHub への push は不要（このファイルを保存するだけで反映されます）。
//
// 書き方は2通り:
//   1. 文字列: このサイトと同じ場所に置いたローカルの .md ファイル
//        "README.md"
//   2. オブジェクト { path, url }: 別リポジトリなど外部の .md ファイル
//      （url は raw.githubusercontent.com など CORS を許可しているURLを指定する）
//        { path: "ipaddr.md", url: "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/ipaddr.md" }
//
// path に "フォルダ名/ファイル名.md" と書くと、左のナビゲーションがフォルダごとにまとまる。
// 関連資料どうしの .md リンクは相対パスで解決されるため、リンクし合う資料は同じフォルダに置くこと。
const DOC_BASE = "https://raw.githubusercontent.com/nnnaanaa/document/main/";
const doc = (dir, file) => ({ path: dir + "/" + file, url: DOC_BASE + file });

window.DOC_FILES = [
  "README.md",

  doc("IPアドレス", "ipaddr.md"),
  doc("IPアドレス", "subnet-cheatsheet.md"),

  doc("LAN・イーサネット規格", "ieee802x.md"),
  doc("LAN・イーサネット規格", "poe.md"),
  doc("LAN・イーサネット規格", "ethernet-types.md"),

  doc("WAN・VPN", "wan-vpn.md"),
  doc("WAN・VPN", "ipsec-modes.md"),

  doc("プロトコル・ポート", "dhcp.md"),
  doc("プロトコル・ポート", "well-known-ports.md"),
  doc("プロトコル・ポート", "email-header.md"),
];
