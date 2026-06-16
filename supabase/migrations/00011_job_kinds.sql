-- バックグラウンドジョブを3種類(research / enrich / keyman)に拡張する。
-- research_jobs を汎用ジョブテーブルとして使い回す。
ALTER TABLE research_jobs ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'research';

-- enrich(法人番号取得)の試行済みフラグ。
-- not_found/失敗のセグメントを毎回拾い続けて無限ループになるのを防ぐ。
ALTER TABLE companies ADD COLUMN IF NOT EXISTS enrich_done BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_companies_enrich_done ON companies(enrich_done);
