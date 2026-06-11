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
- src/app/api/               Route Handlers(外部API呼び出しはすべてここに閉じる)
- src/lib/supabase.ts        ブラウザ用Supabaseクライアント
- src/lib/supabase-server.ts サーバー用(service role)クライアント
- src/lib/gbizinfo.ts        gBizINFO APIクライアント
- src/lib/claude.ts          スコアリング等のClaude API呼び出し
- src/types/index.ts         型定義
- supabase/migrations/       スキーママイグレーション

## 環境変数

- ANTHROPIC_API_KEY
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
- SUPABASE_SERVICE_ROLE_KEY
- GBIZINFO_API_TOKEN
- EDINET_API_KEY(フェーズ1後半で使用)

## 実装ルール

- 個人情報(contacts等)を登録・更新するコードでは source_url(取得元)を必須にする
- do_not_contact = true の企業・担当者をリスト生成や架電対象に含めない
- Claude生成コンテンツは status を draft で保存し、自動で published にしない
