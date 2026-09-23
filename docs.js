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
// nnnaanaa/document のファイルは doc("リポジトリ内のパス") と書けば、
// 同じパスでナビゲーションにフォルダ構成ごと表示される（例: network/lan/poe.md）。
// 関連資料どうしの .md リンクは相対パスで解決されるため、リンクし合う資料は同じフォルダに置くこと。
const DOC_BASE = "https://raw.githubusercontent.com/nnnaanaa/document/main/";
const doc = (path) => ({ path, url: DOC_BASE + path });

window.DOC_FILES = [
  "README.md",

  doc("network/ip-address/ipaddr.md"),
  doc("network/ip-address/subnet-cheatsheet.md"),

  doc("network/lan/ieee802x.md"),
  doc("network/lan/poe.md"),
  doc("network/lan/ethernet-types.md"),
  doc("network/lan/wifi.md"),
  doc("network/lan/lag-stp.md"),

  doc("network/wan-vpn/wan-vpn.md"),
  doc("network/wan-vpn/ipsec-modes.md"),

  doc("network/routing/igp.md"),
  doc("network/routing/bgp.md"),
  doc("network/routing/reliability.md"),

  doc("network/redundancy/vrrp.md"),

  doc("network/protocol/dhcp.md"),
  doc("network/protocol/well-known-ports.md"),
  doc("network/protocol/email-header.md"),
  doc("network/protocol/mail-security.md"),
  doc("network/protocol/tcp.md"),
  doc("network/protocol/udp.md"),
  doc("network/protocol/http.md"),
  doc("network/protocol/tls.md"),
];
