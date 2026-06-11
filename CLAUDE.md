# AirERP Marketing Cloud - Claude Code 設定

## 基本

- 返答は日本語で統一する
- 簡潔に答える
- 絵文字は使わない
- 大きな変更をする前に確認を取る

## アプリ概要

SEO事業の営業・マーケティングを一気通貫で管理するシステム。
ビジネスモデル×業界(セグメント)を起点に、ターゲット企業の収集・調査(gBizINFO/EDINET)、
SEOコンテンツ生成、テレアポ管理などを行う。設計書は docs/airerp-marketing-cloud/ を参照。

- architecture.md  システム相関図・データフロー・実装フェーズ
- schema.sql       Supabaseスキーマ全文(supabase/migrations/ に同内容)
- phase1-design.md フェーズ1(企業管理)の詳細設計

## 技術スタック

- Next.js (App Router) + TypeScript
- Tailwind CSS
- @anthropic-ai/sdk (claude-sonnet-4-6)
- @supabase/supabase-js (DBはSupabase Postgresに一元化)
- 重いバッチ(動画処理等)は将来GCPに配置

## ディレクトリ構成

- src/app/companies/         企業一覧・詳細・取り込み(モジュール1)
- src/app/segments/          ビジネスモデル×業界の管理
- src/app/keywords/          キーワード生成・順位トラッキング設定(モジュール2)
- src/app/contents/          コンテンツ生成・レビュー・WordPress公開(モジュール2,3)
- src/app/calls/             架電リスト・架電画面(モジュール6)
- src/app/login/ src/middleware.ts  認証(マジックリンク+ドメイン制限)
- src/app/api/               Route Handlers(外部API呼び出しはすべてここに閉じる)
- src/app/api/cron/serp/     SERP順位の定期取得(Vercel Cron)
- src/lib/supabase.ts        ブラウザ用Supabaseクライアント(@supabase/ssr)
- src/lib/supabase-server.ts サーバー用(service role)クライアント
- src/lib/gbizinfo.ts        gBizINFO APIクライアント
- src/lib/serp.ts            SERP取得(SerpAPI実装、差し替え可能)
- src/lib/wordpress.ts       WordPress REST API
- src/lib/claude.ts          スコアリング・キーワード生成・コンテンツ生成
- src/types/index.ts         型定義
- supabase/migrations/       スキーママイグレーション

## 環境変数

READMEのセットアップ手順を参照。必須: ANTHROPIC_API_KEY / NEXT_PUBLIC_SUPABASE_URL /
NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY。
機能別: GBIZINFO_API_TOKEN / SERPAPI_KEY / CRON_SECRET / WORDPRESS_URL /
WORDPRESS_USER / WORDPRESS_APP_PASSWORD / ALLOWED_EMAIL_DOMAIN / EDINET_API_KEY(未使用)

## 実装ルール

- 個人情報(contacts等)を登録・更新するコードでは source_url(取得元)を必須にする
- do_not_contact = true の企業・担当者をリスト生成や架電対象に含めない
- Claude生成コンテンツは status を draft で保存し、自動で published にしない
