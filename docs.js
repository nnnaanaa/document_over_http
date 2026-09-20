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
  {
    path: "ieee802x.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/ieee802x.md",
  },
  {
    path: "poe.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/poe.md",
  },
  {
    path: "ethernet-types.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/ethernet-types.md",
  },
  {
    path: "wan-vpn.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/wan-vpn.md",
  },
  {
    path: "ipsec-modes.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/ipsec-modes.md",
  },
  {
    path: "dhcp.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/dhcp.md",
  },
  {
    path: "well-known-ports.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/well-known-ports.md",
  },
  {
    path: "email-header.md",
    url: "https://raw.githubusercontent.com/nnnaanaa/document/main/email-header.md",
  },
];
