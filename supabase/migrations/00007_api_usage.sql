-- Claude API利用量の記録(コスト可視化用)

CREATE TABLE api_usage_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind TEXT NOT NULL,                -- research / content / scoring / matching など
  model TEXT NOT NULL,
  input_tokens INT NOT NULL DEFAULT 0,
  output_tokens INT NOT NULL DEFAULT 0,
  cache_read_tokens INT NOT NULL DEFAULT 0,
  cache_creation_tokens INT NOT NULL DEFAULT 0,
  web_searches INT NOT NULL DEFAULT 0,
  estimated_cost_usd NUMERIC(10, 6) NOT NULL DEFAULT 0,
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_api_usage_logs_created ON api_usage_logs(created_at DESC);

ALTER TABLE api_usage_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON api_usage_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
