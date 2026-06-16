-- AI企業リサーチのバックグラウンドジョブ。
-- タブを閉じてもサーバー(Vercel Cron)が選択セグメント群を順次リサーチする。
CREATE TABLE research_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_model_id UUID REFERENCES business_models(id),
  database_id UUID REFERENCES industry_databases(id),
  max_segments INT NOT NULL DEFAULT 500,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued / running / done / error / canceled
  total INT NOT NULL DEFAULT 0,           -- 対象セグメント数(作成時の未収集件数とmax_segmentsの小さい方)
  processed INT NOT NULL DEFAULT 0,
  inserted INT NOT NULL DEFAULT 0,
  failed INT NOT NULL DEFAULT 0,
  cost_usd NUMERIC NOT NULL DEFAULT 0,
  error TEXT,
  heartbeat_at TIMESTAMPTZ,               -- 実行中ワーカーの生存確認(多重起動防止)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_research_jobs_status ON research_jobs(status);

ALTER TABLE research_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON research_jobs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
