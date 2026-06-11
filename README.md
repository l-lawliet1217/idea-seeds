# AirERP Marketing Cloud

SEO事業の営業・マーケティングを一気通貫で管理するシステム。
設計書は [docs/airerp-marketing-cloud/](docs/airerp-marketing-cloud/) を参照。

## セットアップ

1. Supabaseプロジェクトで `supabase/migrations/` のSQLを番号順に実行
2. `.env.local` に環境変数を設定

```
# 必須
ANTHROPIC_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# 企業取り込み(モジュール1)
GBIZINFO_API_TOKEN=

# SERP順位取得(モジュール2)
SERPAPI_KEY=
CRON_SECRET=

# WordPress公開(モジュール2,3)
WORDPRESS_URL=
WORDPRESS_USER=
WORDPRESS_APP_PASSWORD=

# 認証
ALLOWED_EMAIL_DOMAIN=mar-che.com
# ローカル開発でSupabase Auth未設定の場合のみ
# AUTH_DISABLED=true
```

3. 起動

```bash
npm install
npm run dev
```

## 実装状況

| モジュール | 状態 |
|---|---|
| 1. 企業管理(セグメント / gBizINFO取り込み / スコアリング / 担当者・関連会社) | 実装済み |
| 2. SEO(キーワード生成 / 順位トラッキング / Blog・WP生成 / WordPress公開) | 実装済み |
| 3. 企業別提案書(SERPデータを引用した提案書生成) | 実装済み(Ahrefs連携は未) |
| 4. YouTube(台本生成のみ) / 5. SNS(投稿文生成のみ) | 一部実装 |
| 6. テレアポ(スクリプト生成 / リスト生成 / Zoom Phone click-to-call / 結果記録) | 実装済み |
| 認証(Supabase Auth マジックリンク + ドメイン制限) | 実装済み |
| セットアップ診断(/setup で設定状態を確認可能) | 実装済み |
| EDINET役員取得 / 動画編集・YouTube連携 / SNS投稿連携 / 7. GiversNetwork移植 | 未着手 |

## 初期データ(任意)

マイグレーション後に `supabase/seed.sql` を実行すると、ビジネスモデル・業界のサンプルが入り、
セグメント作成をすぐ始められる(内容は編集可)。

## 運用メモ

- コンテンツは draft → in_review → approved を経ないとWordPress公開できない(人間レビュー必須)
- 架電で「拒否」を記録すると企業・担当者の do_not_contact が自動でONになり、以後のリスト生成から除外される
- SERP順位はVercel Cron(毎日 18:00 UTC = 翌3:00 JST)で自動取得。SERP APIはSerpAPI実装(src/lib/serp.ts で差し替え可能)
