// ここに .md ファイルを追加すると、左のナビゲーションに表示されます。
// ビルドや GitHub への push は不要（このファイルを保存するだけで反映されます）。
//
// 書き方は2通り:
//   1. 文字列: このサイトと同じ場所に置いたローカルの .md ファイル
//        "README.md"
//   2. オブジェクト { path, url, summary }: 別リポジトリなど外部の .md ファイル
//      （url は raw.githubusercontent.com など CORS を許可しているURLを指定する）
//      （summary は任意。ナビゲーションにタイトルの下に小さく表示される一行説明）
//        { path: "ipaddr.md", url: "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/ipaddr.md", summary: "サブネット計算の実例" }
//
// nnnaanaa/document のファイルは doc("リポジトリ内のパス", "一行summary") と書けば、
// 同じパスでナビゲーションにフォルダ構成ごと表示される（例: network/lan/poe.md）。
// 関連資料どうしの .md リンクは相対パスで解決されるため、リンクし合う資料は同じフォルダに置くこと。
const DOC_BASE = "https://raw.githubusercontent.com/nnnaanaa/document/main/";
const doc = (path, summary) => ({ path, url: DOC_BASE + path, summary });

window.DOC_FILES = [
  "README.md",

  doc("network/ip-address/ipaddr.md", "サブネットマスク計算の実例2パターン"),
  doc("network/ip-address/subnet-cheatsheet.md", "サブネット計算の公式・早見表まとめ"),

  doc("network/lan/ieee802x.md", "試験に頻出するIEEE802.X規格一覧"),
  doc("network/lan/poe.md", "PoE規格(802.3af/at/bt)と給電電力"),
  doc("network/lan/ethernet-types.md", "10BASE-T等イーサネット規格と伝送速度"),
  doc("network/lan/wifi.md", "Wi-Fi規格・用語・変調/暗号化方式まとめ"),
  doc("network/lan/lag-stp.md", "LAGとSTP/BPDU、ルートブリッジ選出"),

  doc("network/wan-vpn/wan-vpn.md", "WAN/VPNの分類とインターネット経由の有無"),
  doc("network/wan-vpn/ipsec-modes.md", "IPsecのトンネル/トランスポートモード比較"),

  doc("network/routing/igp.md", "RIPとOSPFのしくみ・エリア・LSA"),
  doc("network/routing/bgp.md", "BGPメッセージ・パスアトリビュート・AS番号"),
  doc("network/routing/reliability.md", "ECMPによる負荷分散とBFDの死活監視"),

  doc("network/redundancy/vrrp.md", "VRRPのMaster選出とフェールオーバー"),

  doc("network/protocol/dhcp.md", "DHCPの仕組みと4つのメッセージ"),
  doc("network/protocol/well-known-ports.md", "代表的なポート番号と用途の一覧"),
  doc("network/protocol/email-header.md", "電子メールヘッダの構造と偽装可能性"),
  doc("network/protocol/mail-security.md", "SPF/DKIM/DMARCによる送信ドメイン認証"),
  doc("network/protocol/tcp.md", "TCPヘッダ・フラグ・再送/ウィンドウ制御"),
  doc("network/protocol/udp.md", "UDPヘッダ構造(8Byte固定)"),
  doc("network/protocol/http.md", "ステータスコード・ヘッダー・認証方式"),
  doc("network/protocol/tls.md", "TLS1.2/1.3のネゴシエーション比較"),
];
