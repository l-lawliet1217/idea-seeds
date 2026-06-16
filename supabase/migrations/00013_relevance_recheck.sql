-- 過去に自動収集した候補企業を home(h1/description)で再判定する recheck ジョブ用。
-- 再判定済みフラグ(未済みのみ処理し、再実行ループを防ぐ)。
ALTER TABLE companies ADD COLUMN IF NOT EXISTS relevance_checked BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_companies_relevance_checked ON companies(relevance_checked);
