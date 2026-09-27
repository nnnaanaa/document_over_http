// ここに .md ファイルを追加すると、左のナビゲーションに表示されます。
// ビルドや GitHub への push は不要（このファイルを保存するだけで反映されます）。
//
// 書き方は2通り:
//   1. 文字列: このサイトと同じ場所に置いたローカルの .md ファイル
//        "README.md"
//   2. オブジェクト { path, url, title, summary }: 別リポジトリなど外部の .md ファイル
//      （url は raw.githubusercontent.com など CORS を許可しているURLを指定する）
//      （title は任意。ナビゲーションに表示する短い名前。省略時は本文の見出しから自動で決まる）
//      （summary は任意。ナビゲーションのタイトル下とページ冒頭に表示される一行説明）
//        { path: "ipaddr.md", url: "https://raw.githubusercontent.com/<owner>/<repo>/<branch>/ipaddr.md", title: "サブネット計算例", summary: "サブネット計算の実例" }
//
// nnnaanaa/document のファイルは doc("リポジトリ内のパス", "表示名", "一行説明") と書けば、
// 同じパスでナビゲーションにフォルダ構成ごと表示される（例: network/lan/poe.md）。
// 並び順はこのファイルに書いた順になる。
const DOC_BASE = "https://raw.githubusercontent.com/nnnaanaa/document/main/";
const doc = (path, title, summary) => ({ path, url: DOC_BASE + path, title, summary });

// ナビゲーションに表示するフォルダ名（未指定のフォルダはそのままの名前で表示される）
window.DOC_FOLDER_LABELS = {
  network: "ネットワーク",
  "ip-address": "IPアドレス",
  lan: "LAN・L2",
  "wan-vpn": "WAN・VPN",
  routing: "ルーティング",
  redundancy: "冗長化・負荷分散",
  operation: "運用管理",
  protocol: "プロトコル",
};

window.DOC_FILES = [
  "README.md",

  doc("network/ip-address/subnet-cheatsheet.md", "サブネット計算チートシート", "サブネット計算の公式・早見表まとめ"),
  doc("network/ip-address/ipaddr.md", "サブネット計算の実例", "サブネットマスク計算の実例2パターン"),

  doc("network/lan/ethernet-types.md", "イーサネット規格", "10BASE-T等イーサネット規格と伝送速度"),
  doc("network/lan/poe.md", "PoE", "PoE規格(802.3af/at/bt)と給電電力"),
  doc("network/lan/ieee802x.md", "IEEE 802.X 規格一覧", "試験に頻出するIEEE802.X規格一覧"),
  doc("network/lan/lag-stp.md", "LAG・STP", "LAGとSTP(ポート役割/ステータス/RSTP/MSTP)"),
  doc("network/lan/vlan-vxlan.md", "VLAN・VXLAN", "802.1QタグVLANとVXLAN/VTEP/EVPN"),
  doc("network/lan/wifi.md", "無線LAN", "Wi-Fi規格・用語・変調/暗号化方式まとめ"),

  doc("network/wan-vpn/wan-vpn.md", "WAN・VPNの分類", "WAN/VPNの分類とインターネット経由の有無"),
  doc("network/wan-vpn/mpls.md", "IP-VPN・MPLS", "IP-VPNを支えるMPLSのラベル転送と用語"),
  doc("network/wan-vpn/ipsec.md", "IPsec VPN", "IPsec(AH/ESP/IKE)・ESPモード・NATトラバーサル"),
  doc("network/wan-vpn/ppp.md", "PPP・PPPoE", "PPPの認証(PAP/CHAP)とPPPoEのフレーム構造"),

  doc("network/routing/igp.md", "RIP・OSPF", "RIPとOSPFのしくみ・エリア・LSA"),
  doc("network/routing/bgp.md", "BGP", "BGPメッセージ・パスアトリビュート・AS番号"),
  doc("network/routing/reliability.md", "ECMP・BFD", "ECMPによる負荷分散とBFDの死活監視"),
  doc("network/routing/multicast.md", "マルチキャスト", "マルチキャストアドレス・PIM・IGMP"),

  doc("network/redundancy/vrrp.md", "VRRP", "VRRPのMaster選出とフェールオーバー"),
  doc("network/redundancy/load-balancer.md", "ロードバランサー", "LBの基本機能・セッション維持・DSR・GSLB"),

  doc("network/operation/qos.md", "QoS", "帯域/優先度制御・DiffServ・CoS/DSCP"),
  doc("network/operation/monitoring.md", "監視（SNMP・Syslog等）", "LLDP・SNMP(MIB/メッセージ/Version)・Syslog・IPFIX"),

  doc("network/protocol/tcp.md", "TCP", "TCPヘッダ・フラグ・再送/ウィンドウ制御"),
  doc("network/protocol/udp.md", "UDP", "UDPヘッダ構造(8Byte固定)"),
  doc("network/protocol/well-known-ports.md", "ウェルノウンポート", "代表的なポート番号と用途の一覧"),
  doc("network/protocol/dhcp.md", "DHCP", "DHCPの仕組みと4つのメッセージ"),
  doc("network/protocol/http.md", "HTTP", "ステータスコード・ヘッダー・認証方式"),
  doc("network/protocol/tls.md", "TLS", "TLS1.2/1.3のネゴシエーション比較"),
  doc("network/protocol/email-header.md", "電子メールのヘッダ", "電子メールヘッダの構造と偽装可能性"),
  doc("network/protocol/mail-security.md", "送信ドメイン認証", "SPF/DKIM/DMARCによる送信ドメイン認証"),
  doc("network/protocol/voip.md", "VoIP", "VoIPのSIP/RTPによる通話の流れと音声符号化"),
];
