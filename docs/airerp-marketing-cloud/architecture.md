# AirERP Marketing Cloud - システム構成

## 決定事項

- 単一Next.jsアプリ(App Router)をVercelにデプロイ。モジュールはルートグループで分割
- データ・認証・ストレージはSupabaseに一元化(Airtable / Stackerは不使用)
- 動画処理など重いバッチのみGCP(Cloud Run Jobs + Cloud Storage + Cloud Scheduler)
- 軽い定期処理(SERP取得・メトリクス収集)はVercel Cron
- コンテンツ生成はClaude API、公開前に必ず人間レビュー(contents.status で制御)
- 利用者は社内メンバーのみ(Supabase Authでドメイン制限)

## システム相関図

```mermaid
flowchart LR
  subgraph Vercel["Vercel - Next.js 単一アプリ"]
    M1["/companies 企業管理"]
    M2["/blog SEO・Blog"]
    M3["/whitepapers 提案書"]
    M4["/youtube 動画"]
    M5["/sns SNS"]
    M6["/calls テレアポ"]
    M7["/givers GiversNetwork"]
    CRON["Vercel Cron 順位・メトリクス収集"]
  end

  subgraph Supabase
    DB[("Postgres 全データ")]
    AUTH["Auth ドメイン制限"]
    ST["Storage PDF・画像"]
  end

  subgraph GCP
    GCS["Cloud Storage 動画ファイル"]
    RUN["Cloud Run Jobs ffmpeg・Whisper"]
    SCHED["Cloud Scheduler"]
  end

  subgraph External["外部API"]
    GBIZ["gBizINFO / 法人番号 / EDINET"]
    SERP["SERP API"]
    AHREFS["Ahrefs API"]
    CLAUDE["Claude API"]
    WP["WordPress REST"]
    YT["YouTube Data / Analytics"]
    SNSAPI["X / Facebook / LinkedIn (後回し)"]
    ZOOM["Zoom Phone"]
  end

  Vercel --> AUTH
  Vercel --> DB
  Vercel --> ST
  M1 --> GBIZ
  CRON --> SERP
  M3 --> AHREFS
  M2 --> CLAUDE
  M3 --> CLAUDE
  M4 --> CLAUDE
  M5 --> CLAUDE
  M6 --> CLAUDE
  M2 --> WP
  M3 --> WP
  M4 --> GCS
  SCHED --> RUN
  RUN --> GCS
  RUN --> DB
  M4 --> YT
  CRON --> YT
  M5 --> SNSAPI
  M6 --> ZOOM
```

## データフロー(モジュール間の依存)

```mermaid
flowchart LR
  S["segments ビジネスモデル×業界"] --> C["companies / contacts (モジュール1)"]
  S --> K["keywords"]
  K --> R["serp_results 順位時系列 (モジュール2)"]
  K --> B["contents: blog / whitepaper (モジュール2)"]
  R --> P["contents: proposal 企業別提案書 (モジュール3)"]
  C --> P
  AH["ahrefs_snapshots"] --> P
  B --> Y["contents: youtube_script → videos (モジュール4)"]
  B --> SN["contents: sns_* (モジュール5)"]
  B --> CS["contents: call_script (モジュール6)"]
  C --> CL["call_lists → calls (モジュール6)"]
  CS --> CL
  P --> CL
```

ポイント:

- `segments`(ビジネスモデル×業界)が全モジュールの起点。
- 生成物はすべて `contents` 1テーブル(type別)。Blog→YouTube台本→SNS投稿→架電スクリプトの派生関係は `parent_content_id` で追える。
- `serp_results` はSERP上位N件を全行保存する。自社順位(モジュール2)もターゲット企業の順位(モジュール3)も同じデータからdomainマッチで導出でき、API取得が二重にならない。
- 架電拒否は `calls.result = 'refused'` のトリガーで `do_not_contact` に自動反映し、以後のリスト生成から除外される(個人情報運用ルールのオプトアウト対応)。
- 接点履歴は `activities` に集約し、企業詳細画面で1本のタイムラインとして表示する。

## テーブル一覧(全文は schema.sql)

| モジュール | テーブル | 役割 |
|---|---|---|
| 共通 | profiles | 社内ユーザー(Supabase Auth連携) |
| 1 | business_models / industries / segments | 攻略単位の定義 |
| 1 | companies / contacts / company_relations | 企業・担当者・ベンダー/投資家 |
| 2 | keywords / tracking_settings / serp_results | キーワードと順位時系列(取得量は後から変更可) |
| 3 | ahrefs_snapshots | Ahrefs調査データ |
| 2-6 | contents / content_assets | 全生成物とPDF・画像 |
| 4 | videos / video_metrics | 動画と再生データ |
| 5 | sns_metrics | SNS表示データ |
| 6 | call_lists / call_list_items / calls | 架電リストと通話ログ |
| 横断 | activities | 企業別タイムライン |
| 7 | (givers スキーマ) | GiversNetworkを別スキーマで移植 |

## 実装順

1. フェーズ1: segments + 企業管理(モジュール1)
2. フェーズ2: キーワード・SERP・Blog生成・WordPress投稿(モジュール2)
3. フェーズ3: 架電リスト・スクリプト・Zoom Phone連携(モジュール6)
4. フェーズ4以降: 提案書(3)→ YouTube(4)→ SNS(5)→ GiversNetwork移植(7)
