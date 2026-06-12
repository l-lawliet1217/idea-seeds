-- AI企業リサーチ用の列を追加
-- サービスサイト(媒体)と運営会社を区別して保持する

ALTER TABLE companies
  ADD COLUMN service_name TEXT,   -- サイト/サービス名(例: 北海道介護求人ナビ)
  ADD COLUMN service_url TEXT,    -- サイトURL
  ADD COLUMN capital_jpy BIGINT,  -- 資本金
  ADD COLUMN phone TEXT;          -- 代表電話
