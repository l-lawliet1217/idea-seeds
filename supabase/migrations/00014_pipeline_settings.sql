-- 常駐パイプライン設定(シングルトン1行)。
-- enabled: 自動収集のON/OFF / keyman_enabled: ③キーマン工程を自動で回すか(高コストゲート)
-- daily_budget_jpy: 1日の概算コスト上限(円)。0=無制限。
CREATE TABLE IF NOT EXISTS pipeline_settings (
  id INT PRIMARY KEY DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  keyman_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  daily_budget_jpy INT NOT NULL DEFAULT 1000,
  locked_until TIMESTAMPTZ,  -- 常駐パイプラインの多重起動防止ロック
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT pipeline_settings_singleton CHECK (id = 1)
);
INSERT INTO pipeline_settings (id) VALUES (1) ON CONFLICT DO NOTHING;

ALTER TABLE pipeline_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS authenticated_all ON pipeline_settings;
CREATE POLICY authenticated_all ON pipeline_settings
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 当日(JST)の概算API支出(USD)を合計する。予算チェックを軽量に行うため。
CREATE OR REPLACE FUNCTION today_spend_usd() RETURNS numeric LANGUAGE sql STABLE AS $$
  SELECT COALESCE(SUM(estimated_cost_usd), 0)
  FROM api_usage_logs
  WHERE created_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Tokyo') AT TIME ZONE 'Asia/Tokyo';
$$;
