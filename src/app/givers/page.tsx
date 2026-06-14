// Givers タブは GiversNetwork(別アプリ)をそのまま埋め込む。
// データ・認証・AIが AirERP 本体と異なるため、ネイティブ移植ではなく iframe で同一UIを提供する。
// URL は NEXT_PUBLIC_GIVERS_NETWORK_URL で上書き可能。
const GIVERS_NETWORK_URL =
  process.env.NEXT_PUBLIC_GIVERS_NETWORK_URL ??
  "https://givers-network.vercel.app/friends";

export default function GiversPage() {
  // ヘッダー(h-14 = 56px)の直下から画面下端まで全幅で表示する。
  return (
    <div className="fixed inset-x-0 top-14 bottom-0 bg-white">
      <iframe
        src={GIVERS_NETWORK_URL}
        title="GiversNetwork"
        className="h-full w-full border-0"
        allow="clipboard-read; clipboard-write"
      />
    </div>
  );
}
