-- セグメントに企業収集済みフラグを追加
-- リサーチ完了時に自動でtrueになり、以降のリサーチ対象から除外される

ALTER TABLE segments
  ADD COLUMN IF NOT EXISTS research_done BOOLEAN NOT NULL DEFAULT FALSE;
