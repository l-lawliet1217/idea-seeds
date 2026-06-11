export type CompanyStatus =
  | "candidate"
  | "qualified"
  | "approaching"
  | "negotiating"
  | "client"
  | "lost"
  | "excluded";

export const COMPANY_STATUS_LABELS: Record<CompanyStatus, string> = {
  candidate: "候補",
  qualified: "調査済",
  approaching: "アプローチ中",
  negotiating: "商談中",
  client: "受注",
  lost: "失注",
  excluded: "対象外",
};

export type ContactRole = "executive" | "marketing" | "other";

export const CONTACT_ROLE_LABELS: Record<ContactRole, string> = {
  executive: "役員",
  marketing: "マーケ担当",
  other: "その他",
};

export type RelationType = "vendor" | "investor";

export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  vendor: "支援ベンダー",
  investor: "投資家",
};

export type BusinessModel = {
  id: string;
  name: string;
  description: string | null;
};

export type Industry = {
  id: string;
  name: string;
  gbizinfo_code: string | null;
  jsic_code: string | null;
  source_note: string | null;
};

export type Segment = {
  id: string;
  business_model_id: string;
  industry_id: string;
  name: string;
  priority: number;
  is_active: boolean;
  business_models?: BusinessModel;
  industries?: Industry;
};

export type Company = {
  id: string;
  segment_id: string | null;
  corporate_number: string | null;
  name: string;
  website_url: string | null;
  prefecture: string | null;
  revenue_jpy: number | null;
  employees: number | null;
  budget_score: number | null;
  budget_score_reason: string | null;
  status: CompanyStatus;
  do_not_contact: boolean;
  source: string | null;
  source_url: string | null;
  collected_at: string | null;
  note: string | null;
  created_at: string;
  segments?: Segment;
};

export type Contact = {
  id: string;
  company_id: string;
  name: string;
  role: ContactRole;
  title: string | null;
  email: string | null;
  phone: string | null;
  source_url: string;
  do_not_contact: boolean;
  note: string | null;
  created_at: string;
};

export type CompanyRelation = {
  id: string;
  company_id: string;
  related_name: string;
  relation_type: RelationType;
  phone: string | null;
  source_url: string | null;
  note: string | null;
};

export type Activity = {
  id: number;
  company_id: string;
  activity_type: string;
  summary: string | null;
  occurred_at: string;
};

export type CompanyDetail = Company & {
  contacts: Contact[];
  company_relations: CompanyRelation[];
  activities: Activity[];
};

export type ImportCandidate = {
  corporate_number: string;
  name: string;
  prefecture: string | null;
  employees: number | null;
  website_url: string | null;
};
