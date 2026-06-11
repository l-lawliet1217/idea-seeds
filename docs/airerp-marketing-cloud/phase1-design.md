# フェーズ1 詳細設計: ターゲット企業管理モジュール

対象: モジュール1(企業の管理・調査)。schema.sql の
business_models / industries / segments / companies / contacts / company_relations / activities を使用する。

## 事前準備(APIキーの申請)

実装前に以下の申請を済ませておく(いずれも無料・数日かかる場合あり)。

| API | 用途 | 申請先 |
|---|---|---|
| gBizINFO REST API | 業種・売上・従業員数による企業検索 | https://info.gbiz.go.jp/hojin/api_registration/form |
| 法人番号システムWeb-API | 法人番号による名寄せ | https://www.houjin-bangou.nta.go.jp/webapi/ |
| EDINET API v2 | 上場企業の役員情報(有価証券報告書) | https://api.edinet-fsa.go.jp/ |

## 画面設計

### /segments - 攻略単位の管理
- ビジネスモデル×業界のマトリクス表示。セルをクリックでsegment作成
- segmentごとに企業数・キーワード数・優先度を表示
- 業界マスタはgBizINFO業種コード(日本標準産業分類)から選択式

### /companies - 企業一覧
- フィルタ: segment / status / budget_score範囲 / do_not_contact除外
- 一覧カラム: 企業名・segment・売上・従業員数・スコア・status・最終接点日
- 一括操作: status変更、架電リストへの追加(フェーズ3で有効化)

### /companies/import - 取り込みウィザード
1. segmentを選択
2. gBizINFO検索条件を指定(業種コード・売上範囲・従業員数範囲・都道府県)
3. 検索結果をプレビュー(既存企業は法人番号で重複除外)
4. 取り込み実行 → companiesにstatus=candidateで一括INSERT
5. バックグラウンドでスコアリング(下記)を実行

### /companies/[id] - 企業詳細
- タブ構成: 概要 / 担当者 / 関連会社 / タイムライン
- 概要: gBizINFO由来データ + budget_score + スコア根拠 + status変更
- 担当者: contacts一覧。手動追加時は source_url 必須(入力フォームでバリデーション)
- 関連会社: company_relations(ベンダー/投資家)。手動追加
- タイムライン: activities を時系列表示
- 「EDINETから役員取得」ボタン: 上場企業(法人番号でEDINET書類検索が当たる場合)のみ有効

## API設計(Route Handlers)

| Method | Path | 処理 |
|---|---|---|
| GET/POST | /api/segments | segment一覧・作成 |
| GET | /api/companies | 一覧(フィルタはクエリパラメータ) |
| POST | /api/companies/import | gBizINFO検索→プレビュー返却(dryRun=true)/ 取り込み実行 |
| GET/PATCH | /api/companies/[id] | 詳細・更新(status変更含む) |
| POST | /api/companies/[id]/score | スコアリング再実行 |
| POST | /api/companies/[id]/edinet | EDINET役員情報取得→contactsへ反映(プレビュー後確定) |
| GET/POST | /api/companies/[id]/contacts | 担当者一覧・追加 |
| GET/POST | /api/companies/[id]/relations | ベンダー/投資家一覧・追加 |

設計方針:
- 外部API(gBizINFO/EDINET)の呼び出しはすべてサーバーサイド(Route Handler)に閉じる
- 取り込み・スコアリングは件数が多いと長時間化するため、50件単位のチャンク処理にし、進捗をDBに記録してポーリング表示する

## スコアリング(月額60万円の支払余力)

入力: revenue_jpy, employees, 業種, 上場有無
出力: budget_score (0-100), budget_score_reason

1. ルールベースで足切り: 売上1億円未満または従業員5名未満は score=10 固定
2. それ以外はClaude APIで判定。プロンプトには「月額60万円のSEO支援サービスを継続できるか」を、売上に対するマーケ予算比率の一般値(売上の3-5%)を前提に推定させ、score と reason(日本語1-2文)をJSONで返させる
3. 結果は companies に保存し、reason を一覧のツールチップで表示

## gBizINFO連携の実装メモ

- 検索: `GET https://info.gbiz.go.jp/hojin/v1/hojin?business_item={業種}&sales_from=...&page=...`(ヘッダ `X-hojinInfo-api-token`)
- レート制制限があるため、取り込みは1秒1リクエスト程度に抑えるスロットリングを入れる
- 法人番号をcompanies.corporate_numberのユニークキーとして名寄せする
- source='gbizinfo', source_url にgBizINFOの法人ページURL, collected_at=取得時刻 を必ず記録(個人情報運用ルール)

## EDINET連携の実装メモ

- 書類一覧API(`/api/v2/documents.json?date=...`)で有価証券報告書を特定し、XBRLから役員情報を抽出する
- 抽出した役員は role='executive'、source_url にEDINETの書類URLを設定し、**確定前に必ず画面でプレビュー**(自動でcontactsに入れない)

## 実装リポジトリの構成案(新規リポジトリ airerp-marketing-cloud)

```
src/
  app/
    (auth)/login/
    segments/
    companies/
      import/
      [id]/
    api/
      segments/route.ts
      companies/route.ts
      companies/import/route.ts
      companies/[id]/route.ts
      companies/[id]/score/route.ts
      companies/[id]/edinet/route.ts
  lib/
    supabase/        # クライアント(server/client分離)
    gbizinfo.ts      # gBizINFO APIクライアント
    edinet.ts        # EDINET APIクライアント
    claude.ts        # スコアリング・生成共通
    prompts/
  types/
supabase/
  migrations/        # schema.sql を初回マイグレーションとして配置
```

環境変数: ANTHROPIC_API_KEY / NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY / GBIZINFO_API_TOKEN / EDINET_API_KEY

## フェーズ1の完了条件

1. segmentを作成し、gBizINFO検索から企業を100件取り込める
2. 取り込んだ企業に budget_score が自動付与される
3. 企業詳細で担当者・関連会社を手動登録できる(source_url必須が効いている)
4. 認証(@mar-che.com限定)が機能している
