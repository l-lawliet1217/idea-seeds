-- 一括ジョブ(kind='all')のフェーズ管理。
-- research → enrich → keyman の順にサーバー側で進める。phaseは現在のフェーズ名。
ALTER TABLE research_jobs ADD COLUMN IF NOT EXISTS phase TEXT;
