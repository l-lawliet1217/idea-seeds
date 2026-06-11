-- ============================================================
-- AirERP Marketing Cloud - Supabase (Postgres) スキーマ
-- 構成方針:
--   - マスタデータ・業務データ・時系列データをすべてSupabaseに一元化
--   - 認証は Supabase Auth(@mar-che.com ドメイン制限)
--   - コンテンツ(Blog/WP/台本/SNS投稿/架電スクリプト)は contents に統一
--   - 個人情報を持つテーブルは取得元URL・取得日・do_not_contact を必須化
-- ============================================================

-- ---------- ENUM定義 ----------

CREATE TYPE company_status AS ENUM (
  'candidate',      -- 候補(自動収集直後)
  'qualified',      -- 調査済み・ターゲット確定
  'approaching',    -- アプローチ中
  'negotiating',    -- 商談中
  'client',         -- 受注
  'lost',           -- 失注
  'excluded'        -- 対象外
);

CREATE TYPE contact_role AS ENUM (
  'executive',      -- 役員
  'marketing',      -- マーケティング担当
  'other'
);

CREATE TYPE relation_type AS ENUM (
  'vendor',         -- 支援ベンダー
  'investor'        -- 投資家
);

CREATE TYPE content_type AS ENUM (
  'blog',
  'whitepaper',         -- セグメント向けホワイトペーパー(モジュール2)
  'proposal',           -- 企業別提案書ホワイトペーパー(モジュール3)
  'youtube_script',
  'sns_x',
  'sns_facebook',
  'sns_linkedin',
  'call_script'
);

CREATE TYPE content_status AS ENUM (
  'draft',          -- Claude生成直後
  'in_review',      -- 人間レビュー中(自動公開はしない)
  'approved',       -- レビュー承認済み
  'scheduled',      -- 公開予約済み
  'published',      -- 公開済み
  'archived'
);

CREATE TYPE asset_type AS ENUM ('pdf', 'image', 'video', 'thumbnail');

CREATE TYPE video_status AS ENUM (
  'uploaded_raw',   -- 収録動画アップロード直後
  'processing',     -- GCPで無音カット・文字起こし処理中
  'ready',          -- 処理完了・レビュー待ち
  'published'       -- YouTube公開済み
);

CREATE TYPE call_result AS ENUM (
  'connected',      -- 通話できた
  'no_answer',      -- 不在
  'refused',        -- 拒否(do_not_contact 連動)
  'appointment',    -- アポ獲得
  'callback'        -- 再架電
);

CREATE TYPE call_item_status AS ENUM ('pending', 'called', 'excluded');

-- ---------- ユーザー ----------

-- Supabase Auth (auth.users) と1:1。サインアップ時にトリガーで作成する
CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- モジュール1: ターゲット企業管理
-- ============================================================

CREATE TABLE business_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  gbizinfo_code TEXT,           -- gBizINFO業種コード
  jsic_code TEXT,               -- 日本標準産業分類コード
  source_note TEXT,             -- 経産省/環境省などの参照元メモ
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 「ビジネスモデル×業界」= 全モジュールが参照する攻略単位
CREATE TABLE segments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_model_id UUID NOT NULL REFERENCES business_models(id),
  industry_id UUID NOT NULL REFERENCES industries(id),
  name TEXT NOT NULL,           -- 表示名(例: SaaS×製造業)
  priority INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (business_model_id, industry_id)
);

CREATE TABLE companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID REFERENCES segments(id),
  corporate_number TEXT UNIQUE, -- 法人番号(国税庁API)
  name TEXT NOT NULL,
  website_url TEXT,
  prefecture TEXT,
  revenue_jpy BIGINT,           -- gBizINFO由来
  employees INT,                -- gBizINFO由来
  budget_score INT,             -- 月額60万円の支払余力スコア(0-100、自動算出)
  budget_score_reason TEXT,     -- スコア根拠(Claude生成)
  status company_status NOT NULL DEFAULT 'candidate',
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
  source TEXT,                  -- gbizinfo / edinet / manual
  source_url TEXT,              -- 取得元URL(個人情報運用ルール: 必須)
  collected_at TIMESTAMPTZ,     -- 取得日(同上)
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_companies_segment ON companies(segment_id);
CREATE INDEX idx_companies_status ON companies(status);

-- 役員・マーケティング担当者(個人情報: 公開情報のみ・取得元必須)
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  role contact_role NOT NULL DEFAULT 'other',
  title TEXT,                   -- 役職名
  email TEXT,
  phone TEXT,
  source_url TEXT NOT NULL,     -- 取得元URL(必須)
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  do_not_contact BOOLEAN NOT NULL DEFAULT FALSE,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contacts_company ON contacts(company_id);

-- 支援ベンダー・投資家
CREATE TABLE company_relations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  related_name TEXT NOT NULL,   -- ベンダー/投資家の会社名
  relation_type relation_type NOT NULL,
  phone TEXT,
  source_url TEXT,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT
);

CREATE INDEX idx_company_relations_company ON company_relations(company_id);

-- ============================================================
-- モジュール2: SEO(キーワード・順位トラッキング)
-- ============================================================

CREATE TABLE keywords (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id),
  keyword TEXT NOT NULL,
  search_volume INT,
  intent TEXT,                  -- informational / transactional など
  is_tracked BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (segment_id, keyword)
);

-- 順位取得の量・頻度を後から変更できる設定(「統計的に有意」の定義を持つ場所)
CREATE TABLE tracking_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id UUID NOT NULL REFERENCES segments(id) UNIQUE,
  fetch_frequency_hours INT NOT NULL DEFAULT 24,
  fetch_depth INT NOT NULL DEFAULT 20,   -- SERP上位何件まで保存するか
  device TEXT NOT NULL DEFAULT 'desktop',
  min_sample_days INT NOT NULL DEFAULT 30,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- SERP取得結果(時系列・大量データ)。上位N件を全行保存することで
-- 自社順位もターゲット企業の順位(モジュール3)も同じデータから導出する
CREATE TABLE serp_results (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  keyword_id UUID NOT NULL REFERENCES keywords(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL,
  position INT NOT NULL,
  url TEXT NOT NULL,
  domain TEXT NOT NULL,         -- URLから抽出(企業マッチング用)
  title TEXT,
  serp_features JSONB
);

CREATE INDEX idx_serp_results_keyword_time ON serp_results(keyword_id, fetched_at DESC);
CREATE INDEX idx_serp_results_domain ON serp_results(domain, fetched_at DESC);

-- ============================================================
-- モジュール3: 企業別SEO調査(Ahrefs)
-- ============================================================

CREATE TABLE ahrefs_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  domain_rating NUMERIC,
  backlinks_count BIGINT,
  referring_domains BIGINT,
  organic_traffic BIGINT,
  organic_keywords BIGINT,
  raw JSONB                     -- APIレスポンス全体(後から示唆抽出に使う)
);

CREATE INDEX idx_ahrefs_company_time ON ahrefs_snapshots(company_id, fetched_at DESC);

-- ============================================================
-- コンテンツ共通(モジュール2,3,4,5,6の成果物)
-- ============================================================

CREATE TABLE contents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type content_type NOT NULL,
  segment_id UUID REFERENCES segments(id),
  company_id UUID REFERENCES companies(id),    -- 企業別提案書のみ使用
  parent_content_id UUID REFERENCES contents(id), -- 派生元(Blog→台本/SNS等)
  title TEXT NOT NULL,
  body TEXT,                    -- Markdown本文
  keywords_used UUID[],         -- 使用キーワードID
  status content_status NOT NULL DEFAULT 'draft',
  reviewer_id UUID REFERENCES profiles(id),
  review_note TEXT,
  wordpress_post_id INT,        -- WordPress投稿後のID
  published_url TEXT,
  scheduled_at TIMESTAMPTZ,     -- SNS予約投稿用
  platform_post_id TEXT,        -- X/FB/LinkedIn投稿後のID
  published_at TIMESTAMPTZ,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_contents_type_status ON contents(content_type, status);
CREATE INDEX idx_contents_segment ON contents(segment_id);
CREATE INDEX idx_contents_company ON contents(company_id);

-- PDF・画像・動画などの添付(実体はSupabase Storage / GCS)
CREATE TABLE content_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  asset_type asset_type NOT NULL,
  storage_path TEXT NOT NULL,   -- supabase://bucket/path または gs://bucket/path
  meta JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- モジュール4: YouTube
-- ============================================================

CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  script_content_id UUID REFERENCES contents(id),  -- 台本
  raw_video_path TEXT,          -- 収録動画(GCS)
  processed_video_path TEXT,    -- 無音カット後(GCS)
  transcript TEXT,              -- Whisper文字起こし
  youtube_video_id TEXT,
  title TEXT,
  description TEXT,
  status video_status NOT NULL DEFAULT 'uploaded_raw',
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- YouTube Analytics 日次スナップショット(時系列)
CREATE TABLE video_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL,
  views BIGINT,
  watch_time_minutes BIGINT,
  likes INT,
  comments INT,
  subscribers_gained INT
);

CREATE INDEX idx_video_metrics_video_time ON video_metrics(video_id, fetched_at DESC);

-- ============================================================
-- モジュール5: SNS(投稿はcontentsで管理、ここはメトリクスのみ)
-- ============================================================

CREATE TABLE sns_metrics (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES contents(id) ON DELETE CASCADE,
  fetched_at TIMESTAMPTZ NOT NULL,
  impressions BIGINT,
  likes INT,
  shares INT,
  clicks INT
);

CREATE INDEX idx_sns_metrics_content_time ON sns_metrics(content_id, fetched_at DESC);

-- ============================================================
-- モジュール6: テレアポ
-- ============================================================

CREATE TABLE call_lists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  segment_id UUID REFERENCES segments(id),
  script_content_id UUID REFERENCES contents(id), -- 架電スクリプト
  filter_criteria JSONB,        -- リスト生成条件(budget_score >= 60 等)
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE call_list_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_list_id UUID NOT NULL REFERENCES call_lists(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id),
  contact_id UUID REFERENCES contacts(id),
  priority INT NOT NULL DEFAULT 0,
  status call_item_status NOT NULL DEFAULT 'pending',
  UNIQUE (call_list_id, company_id)
);

CREATE INDEX idx_call_list_items_list ON call_list_items(call_list_id, status);

-- 通話ログ(Zoom Phone連携・時系列)
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  call_list_item_id UUID REFERENCES call_list_items(id),
  company_id UUID NOT NULL REFERENCES companies(id),
  contact_id UUID REFERENCES contacts(id),
  caller_id UUID REFERENCES profiles(id),
  zoom_call_id TEXT,
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_seconds INT,
  result call_result,
  memo TEXT
);

CREATE INDEX idx_calls_company_time ON calls(company_id, called_at DESC);

-- 「refused」記録時に会社のdo_not_contactを自動でTRUEにする
CREATE OR REPLACE FUNCTION sync_do_not_contact() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.result = 'refused' THEN
    UPDATE companies SET do_not_contact = TRUE, updated_at = NOW()
      WHERE id = NEW.company_id;
    IF NEW.contact_id IS NOT NULL THEN
      UPDATE contacts SET do_not_contact = TRUE WHERE id = NEW.contact_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_calls_do_not_contact
  AFTER INSERT OR UPDATE OF result ON calls
  FOR EACH ROW EXECUTE FUNCTION sync_do_not_contact();

-- ============================================================
-- 横断: 企業タイムライン(全モジュールの接点履歴を1本化)
-- ============================================================

CREATE TABLE activities (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL,  -- call / content_published / proposal_sent など
  ref_table TEXT,
  ref_id TEXT,
  summary TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  meta JSONB
);

CREATE INDEX idx_activities_company_time ON activities(company_id, occurred_at DESC);

-- ============================================================
-- モジュール7: GiversNetwork
-- 既存アプリのテーブルは専用スキーマに分離して移植し、
-- 本体スキーマとはビュー/FKで段階的に接続する
-- ============================================================

CREATE SCHEMA IF NOT EXISTS givers;
-- (既存 givers-network のテーブル定義を移植後、companies/contacts との
--  突合ビューをここに追加する)

-- ============================================================
-- RLS: 社内メンバー(認証済みユーザー)のみ全操作可
-- サインアップは Supabase Auth 側で @mar-che.com ドメインに制限する
-- ============================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN
    SELECT tablename FROM pg_tables WHERE schemaname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format(
      'CREATE POLICY authenticated_all ON %I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t
    );
  END LOOP;
END $$;
