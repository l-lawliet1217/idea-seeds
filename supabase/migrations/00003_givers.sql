-- モジュール7: GiversNetwork(経営者ネットワーク管理)
-- 既存デプロイ版(Phase 0)はモックデータのため、本体スキーマにネイティブ実装する

CREATE TYPE friend_tier AS ENUM ('T1', 'T2', 'T3', 'T4', 'T5');

CREATE TABLE givers_friends (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  company TEXT,
  position TEXT,
  industry TEXT,
  tier friend_tier NOT NULL DEFAULT 'T3',
  next_contact_date DATE,
  last_contact_date DATE,
  birthday DATE,
  tags TEXT[],
  notes TEXT,
  -- 本体の企業マスタと紐づけば営業文脈でも参照できる
  company_id UUID REFERENCES companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_givers_friends_tier ON givers_friends(tier);
CREATE INDEX idx_givers_friends_next_contact ON givers_friends(next_contact_date);

-- 接触履歴
CREATE TABLE givers_contact_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_id UUID NOT NULL REFERENCES givers_friends(id) ON DELETE CASCADE,
  contacted_at DATE NOT NULL DEFAULT CURRENT_DATE,
  channel TEXT,                 -- meeting / call / message など
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_givers_contact_logs_friend ON givers_contact_logs(friend_id, contacted_at DESC);

ALTER TABLE givers_friends ENABLE ROW LEVEL SECURITY;
ALTER TABLE givers_contact_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON givers_friends
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY authenticated_all ON givers_contact_logs
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
