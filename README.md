# AirERP Marketing Cloud

SEO事業の営業・マーケティングを一気通貫で管理するシステム。
設計書は [docs/airerp-marketing-cloud/](docs/airerp-marketing-cloud/) を参照。

## セットアップ

1. Supabaseプロジェクトで `supabase/migrations/00001_init.sql` を実行
2. `.env.local` に環境変数を設定

```
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GBIZINFO_API_TOKEN=
```

3. 起動

```bash
npm install
npm run dev
```

## 実装状況

- フェーズ1(企業管理): セグメント管理 / gBizINFO取り込み / 支払余力スコアリング / 担当者・関連会社管理 — 実装済み
- フェーズ1残: EDINET役員取得、認証(Supabase Auth ドメイン制限)
- フェーズ2以降(SEO/Blog、テレアポ、提案書、YouTube、SNS): 未着手。docs/airerp-marketing-cloud/architecture.md 参照
