-- GiversNetwork拡張: マッチング・紹介・アウトリーチ・トリガー
-- (ローカル版givers-networkのGoogle Sheetsスキーマを移植)

ALTER TABLE givers_friends
  ADD COLUMN wants_to_meet TEXT,          -- 会いたい人
  ADD COLUMN needs TEXT,                  -- ニーズ
  ADD COLUMN contributions TEXT,          -- 貢献できること
  ADD COLUMN phase TEXT,                  -- 経営フェーズ
  ADD COLUMN personality TEXT,            -- 性格
  ADD COLUMN contact_cycle_months INT NOT NULL DEFAULT 3, -- 接触サイクル(月)
  ADD COLUMN sns_urls JSONB;

ALTER TABLE givers_contact_logs
  ADD COLUMN duration_minutes INT;

-- 紹介(マッチング採用後のステータス管理)
CREATE TYPE intro_status AS ENUM (
  'candidate',   -- 候補
  'pitched',     -- 個人打診中
  'connected',   -- 接続済み
  'completed',   -- 完了
  'rejected'     -- 取り下げ
);

CREATE TABLE givers_introductions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_a_id UUID NOT NULL REFERENCES givers_friends(id) ON DELETE CASCADE,
  friend_b_id UUID NOT NULL REFERENCES givers_friends(id) ON DELETE CASCADE,
  status intro_status NOT NULL DEFAULT 'candidate',
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (friend_a_id, friend_b_id)
);

-- マッチング採用/却下のフィードバック(次回の判定プロンプトに学習例として注入)
CREATE TYPE match_decision AS ENUM ('adopted', 'rejected');

CREATE TABLE givers_match_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_a_id UUID NOT NULL REFERENCES givers_friends(id) ON DELETE CASCADE,
  friend_b_id UUID NOT NULL REFERENCES givers_friends(id) ON DELETE CASCADE,
  decision match_decision NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- アウトリーチ(打診文・接続文・誕生日メッセージの下書き)
CREATE TYPE outreach_kind AS ENUM ('pitch', 'connection', 'birthday', 'follow');
CREATE TYPE outreach_status AS ENUM ('draft', 'sent');

CREATE TABLE givers_outreach (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_id UUID NOT NULL REFERENCES givers_friends(id) ON DELETE CASCADE,
  kind outreach_kind NOT NULL,
  message TEXT NOT NULL,
  status outreach_status NOT NULL DEFAULT 'draft',
  introduction_id UUID REFERENCES givers_introductions(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ
);

-- トリガー(友人に起きた出来事の追跡)
CREATE TYPE trigger_status AS ENUM ('open', 'in_progress', 'done');

CREATE TABLE givers_triggers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  friend_id UUID NOT NULL REFERENCES givers_friends(id) ON DELETE CASCADE,
  trigger_type TEXT,            -- 資金調達 / 採用 / 移転 / メディア掲載 など
  content TEXT NOT NULL,
  status trigger_status NOT NULL DEFAULT 'open',
  source TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_givers_intro_status ON givers_introductions(status);
CREATE INDEX idx_givers_outreach_status ON givers_outreach(status);
CREATE INDEX idx_givers_triggers_status ON givers_triggers(status);

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY['givers_introductions','givers_match_feedback','givers_outreach','givers_triggers'])
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;
