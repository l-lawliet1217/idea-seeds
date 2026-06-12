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

export type IndustryDatabase = {
  id: string;
  name: string;
  source_note: string | null;
  industries?: { count: number }[];
};

export type Industry = {
  id: string;
  name: string;
  gbizinfo_code: string | null;
  jsic_code: string | null;
  source_note: string | null;
  database_id: string | null;
  industry_databases?: { name: string } | null;
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

export type Keyword = {
  id: string;
  segment_id: string;
  keyword: string;
  search_volume: number | null;
  intent: string | null;
  is_tracked: boolean;
  created_at: string;
};

export type TrackingSettings = {
  id?: string;
  segment_id: string;
  fetch_frequency_hours: number;
  fetch_depth: number;
  device: string;
  min_sample_days: number;
};

export type ContentType =
  | "blog"
  | "whitepaper"
  | "proposal"
  | "youtube_script"
  | "sns_x"
  | "sns_facebook"
  | "sns_linkedin"
  | "call_script";

export const CONTENT_TYPE_LABELS: Record<ContentType, string> = {
  blog: "Blog記事",
  whitepaper: "ホワイトペーパー",
  proposal: "提案書",
  youtube_script: "YouTube台本",
  sns_x: "X投稿",
  sns_facebook: "Facebook投稿",
  sns_linkedin: "LinkedIn投稿",
  call_script: "架電スクリプト",
};

export type ContentStatus =
  | "draft"
  | "in_review"
  | "approved"
  | "scheduled"
  | "published"
  | "archived";

export const CONTENT_STATUS_LABELS: Record<ContentStatus, string> = {
  draft: "下書き",
  in_review: "レビュー中",
  approved: "承認済み",
  scheduled: "公開予約",
  published: "公開済み",
  archived: "アーカイブ",
};

export type Content = {
  id: string;
  content_type: ContentType;
  segment_id: string | null;
  company_id: string | null;
  parent_content_id: string | null;
  title: string;
  body: string | null;
  keywords_used: string[] | null;
  status: ContentStatus;
  review_note: string | null;
  wordpress_post_id: number | null;
  published_url: string | null;
  published_at: string | null;
  created_at: string;
  segments?: { id: string; name: string } | null;
  companies?: { id: string; name: string } | null;
};

export type CallResult =
  | "connected"
  | "no_answer"
  | "refused"
  | "appointment"
  | "callback";

export const CALL_RESULT_LABELS: Record<CallResult, string> = {
  connected: "通話",
  no_answer: "不在",
  refused: "拒否",
  appointment: "アポ獲得",
  callback: "再架電",
};

export type CallList = {
  id: string;
  name: string;
  segment_id: string | null;
  script_content_id: string | null;
  filter_criteria: Record<string, unknown> | null;
  created_at: string;
  segments?: { id: string; name: string } | null;
  call_list_items?: { count: number }[];
};

export type CallListItem = {
  id: string;
  call_list_id: string;
  company_id: string;
  contact_id: string | null;
  priority: number;
  status: "pending" | "called" | "excluded";
  companies?: Company & { contacts: Contact[] };
};

export type FriendTier = "T1" | "T2" | "T3" | "T4" | "T5";

export const FRIEND_TIERS: FriendTier[] = ["T1", "T2", "T3", "T4", "T5"];

export type GiverFriend = {
  id: string;
  name: string;
  company: string | null;
  position: string | null;
  industry: string | null;
  tier: FriendTier;
  next_contact_date: string | null;
  last_contact_date: string | null;
  birthday: string | null;
  tags: string[] | null;
  notes: string | null;
  company_id: string | null;
  wants_to_meet: string | null;
  needs: string | null;
  contributions: string | null;
  phase: string | null;
  personality: string | null;
  contact_cycle_months: number;
  created_at: string;
};

export type GiverContactLog = {
  id: string;
  friend_id: string;
  contacted_at: string;
  channel: string | null;
  memo: string | null;
  duration_minutes: number | null;
};

export type IntroStatus =
  | "candidate"
  | "pitched"
  | "connected"
  | "completed"
  | "rejected";

export const INTRO_STATUS_LABELS: Record<IntroStatus, string> = {
  candidate: "候補",
  pitched: "個人打診",
  connected: "接続",
  completed: "完了",
  rejected: "取り下げ",
};

export type GiverIntroduction = {
  id: string;
  friend_a_id: string;
  friend_b_id: string;
  status: IntroStatus;
  reason: string | null;
  created_at: string;
  friend_a?: { id: string; name: string; company: string | null };
  friend_b?: { id: string; name: string; company: string | null };
};

export type OutreachKind = "pitch" | "connection" | "birthday" | "follow";

export const OUTREACH_KIND_LABELS: Record<OutreachKind, string> = {
  pitch: "紹介打診",
  connection: "接続",
  birthday: "誕生日",
  follow: "フォロー",
};

export type GiverOutreach = {
  id: string;
  friend_id: string;
  kind: OutreachKind;
  message: string;
  status: "draft" | "sent";
  created_at: string;
  sent_at: string | null;
  givers_friends?: { id: string; name: string };
};

export type TriggerStatus = "open" | "in_progress" | "done";

export const TRIGGER_STATUS_LABELS: Record<TriggerStatus, string> = {
  open: "未対応",
  in_progress: "対応中",
  done: "対応済",
};

export type GiverTrigger = {
  id: string;
  friend_id: string;
  trigger_type: string | null;
  content: string;
  status: TriggerStatus;
  source: string | null;
  created_at: string;
  givers_friends?: { id: string; name: string };
};

export type MatchCandidate = {
  a: { id: string; name: string; company: string | null };
  b: { id: string; name: string; company: string | null };
  score: number;
  reason: string;
};
