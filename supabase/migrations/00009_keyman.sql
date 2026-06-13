-- キーマン・ベンダー調査用の拡張
-- contacts: 部署・SNS(参考システムcompany-researchのスキーマを踏襲)
-- company_relations: 種別・詳細・website
-- companies: キーマン調査済みフラグ

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS sns_x TEXT,
  ADD COLUMN IF NOT EXISTS sns_facebook TEXT,
  ADD COLUMN IF NOT EXISTS sns_linkedin TEXT,
  ADD COLUMN IF NOT EXISTS sns_instagram TEXT;

ALTER TABLE company_relations
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS detail TEXT,
  ADD COLUMN IF NOT EXISTS website_url TEXT;

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS keyman_research_done BOOLEAN NOT NULL DEFAULT FALSE;
