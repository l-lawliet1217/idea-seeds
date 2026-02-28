# idea seeds - Claude Code 設定

## 基本

- 返答は日本語で統一する
- 簡潔に答える
- 絵文字は使わない
- 大きな変更をする前に確認を取る

## アプリ概要

新規事業アイデアの「タネ」を蓄積・分析するツール。
チャット形式で気づきを入力 → ClaudeがPEST/Jobs/5Forces/3C/4Pで自動分析 → Supabaseに保存 → 既存タネとの組み合わせを提案。

## 技術スタック

- Next.js (App Router) + TypeScript
- Tailwind CSS
- @anthropic-ai/sdk (claude-sonnet-4-6)
- @supabase/supabase-js

## ディレクトリ構成

- src/app/page.tsx          チャット画面（メイン）
- src/app/seeds/page.tsx    タネ一覧
- src/app/api/chat/route.ts 分析・保存・組み合わせ提案API
- src/app/api/seeds/route.ts タネ一覧取得API
- src/lib/supabase.ts       Supabaseクライアント
- src/lib/prompts.ts        Claudeへのプロンプト
- src/types/index.ts        型定義

## Supabaseスキーマ

```sql
CREATE TABLE seeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  raw_input TEXT NOT NULL,
  pest JSONB,
  jobs JSONB,
  frameworks JSONB,
  service_ideas JSONB,
  tags TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## 環境変数

- ANTHROPIC_API_KEY
- NEXT_PUBLIC_SUPABASE_URL
- NEXT_PUBLIC_SUPABASE_ANON_KEY
