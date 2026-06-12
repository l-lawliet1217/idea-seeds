-- 特化先データベース(都道府県・経済センサス・Yahoo!プレイスカテゴリ等の分類体系)
-- industries(特化先項目)は所属データベースを持つ

CREATE TABLE industry_databases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  source_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE industry_databases ENABLE ROW LEVEL SECURITY;
CREATE POLICY authenticated_all ON industry_databases
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE industries ADD COLUMN database_id UUID REFERENCES industry_databases(id);
CREATE INDEX idx_industries_database ON industries(database_id);

-- 初期データベース
INSERT INTO industry_databases (name) VALUES
  ('都道府県'),
  ('統計局|経済センサス'),
  ('総務省|統計基準等|分類項目名'),
  ('Yahoo!プレイス|店舗カテゴリ'),
  ('総務省|日本標準産業分類 中分類')
ON CONFLICT (name) DO NOTHING;

-- 都道府県データベースの項目(セグメント名の組み立てを考慮し「県」等は付けない)
INSERT INTO industries (name, database_id)
SELECT v.name, d.id
FROM (VALUES
  ('北海道'),('青森'),('岩手'),('宮城'),('秋田'),('山形'),('福島'),
  ('茨城'),('栃木'),('群馬'),('埼玉'),('千葉'),('東京'),('神奈川'),
  ('新潟'),('富山'),('石川'),('福井'),('山梨'),('長野'),('岐阜'),
  ('静岡'),('愛知'),('三重'),('滋賀'),('京都'),('大阪'),('兵庫'),
  ('奈良'),('和歌山'),('鳥取'),('島根'),('岡山'),('広島'),('山口'),
  ('徳島'),('香川'),('愛媛'),('高知'),('福岡'),('佐賀'),('長崎'),
  ('熊本'),('大分'),('宮崎'),('鹿児島'),('沖縄')
) AS v(name)
CROSS JOIN (SELECT id FROM industry_databases WHERE name = '都道府県') AS d
WHERE NOT EXISTS (
  SELECT 1 FROM industries i WHERE i.name = v.name AND i.database_id = d.id
);
