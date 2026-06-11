import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export type BudgetScoreResult = {
  score: number; // 0-100
  reason: string;
};

type ScoreInput = {
  name: string;
  revenue_jpy: number | null;
  employees: number | null;
  industry: string | null;
  prefecture: string | null;
};

// 月額60万円のSEO支援サービスを継続契約できる支払余力を推定する
export async function scoreBudget(input: ScoreInput): Promise<BudgetScoreResult> {
  // ルールベース足切り
  if (input.employees !== null && input.employees < 5) {
    return { score: 10, reason: "従業員5名未満のため、月額60万円の継続支出は困難と判断。" };
  }
  if (input.revenue_jpy !== null && input.revenue_jpy < 100_000_000) {
    return { score: 10, reason: "売上1億円未満のため、月額60万円の継続支出は困難と判断。" };
  }

  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 500,
    messages: [
      {
        role: "user",
        content: `あなたはB2B営業のターゲット選定アナリストです。
以下の企業が「月額60万円(年720万円)のSEO支援サービス」を継続契約できる支払余力を0-100で採点してください。
一般にマーケティング予算は売上の3-5%が目安です。データが欠けている場合は業種・従業員数から保守的に推定してください。

企業情報:
- 企業名: ${input.name}
- 売上高: ${input.revenue_jpy !== null ? `${input.revenue_jpy.toLocaleString()}円` : "不明"}
- 従業員数: ${input.employees ?? "不明"}
- 業種: ${input.industry ?? "不明"}
- 所在地: ${input.prefecture ?? "不明"}

次のJSONのみを出力してください(コードブロック不要):
{"score": 数値, "reason": "日本語1-2文の根拠"}`,
      },
    ],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error("スコアリング結果のJSONを抽出できませんでした");
  }
  const parsed = JSON.parse(match[0]);
  const score = Math.max(0, Math.min(100, Number(parsed.score)));
  return { score, reason: String(parsed.reason ?? "") };
}

// セグメント(ビジネスモデル×業界)向けのSEOキーワード候補を生成する
export async function generateKeywords(input: {
  segmentName: string;
  businessModel: string | null;
  industry: string | null;
}): Promise<string[]> {
  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: `あなたはB2B SEOのキーワードプランナーです。
「${input.segmentName}」(ビジネスモデル: ${input.businessModel ?? "不明"} / 業界: ${input.industry ?? "不明"})の見込み顧客が検索しそうな日本語SEOキーワードを30個提案してください。
- 情報収集型と比較検討型を混ぜる
- 1-4語の検索クエリ形式
- JSONの文字列配列のみを出力(コードブロック不要)`,
      },
    ],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("キーワードのJSONを抽出できませんでした");
  const parsed: unknown = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("キーワードの形式が不正です");
  return parsed.map(String).filter((s) => s.trim().length > 0);
}

export type GeneratedContent = {
  title: string;
  body: string; // Markdown
};

type GenerateContentInput = {
  contentType:
    | "blog"
    | "whitepaper"
    | "proposal"
    | "call_script"
    | "youtube_script"
    | "sns_x"
    | "sns_facebook"
    | "sns_linkedin";
  segmentName: string | null;
  keywords: string[];
  companyName?: string;
  companyContext?: string; // SERP順位など企業固有の調査メモ
  parentSummary?: string; // 派生元コンテンツ(ホワイトペーパー等)の要約
};

const CONTENT_INSTRUCTIONS: Record<GenerateContentInput["contentType"], string> = {
  blog: `SEOブログ記事をMarkdownで書いてください。
- 2000-3000字、h2/h3で構成、指定キーワードを自然に使う
- 導入で読者の課題を提示し、最後にホワイトペーパーのダウンロード導線(プレースホルダ: [ホワイトペーパーDL])を置く`,
  whitepaper: `ホワイトペーパーの本文をMarkdownで書いてください。
- 構成: エグゼクティブサマリー / 業界の課題 / データで見る現状 / 解決アプローチ / 導入ステップ / 会社紹介(プレースホルダ)
- 3000-4000字、見出しはh2/h3`,
  proposal: `ターゲット企業向けのSEO支援提案書をMarkdownで書いてください。
- 構成: 貴社サイトの現状分析 / 課題仮説 / 改善施策(キーワード戦略・コンテンツ・テクニカル) / 想定成果 / 支援体制と料金(月額60万円) / 進め方
- 現状分析には提供された調査データを必ず引用する`,
  call_script: `テレアポ用トークスクリプトをMarkdownで書いてください。
- 構成: 挨拶とフック(15秒) / 課題ヒアリング質問3つ / 提供価値の説明 / よくある断り文句への切り返し3パターン / クロージング(アポ打診)
- 話し言葉で、1ターンは短く`,
  youtube_script: `YouTube動画(8-10分想定)の台本をMarkdownで書いてください。
- 構成: フック(冒頭15秒) / イントロ / 本編3-4チャプター(チャプターごとにh2) / まとめ / CTA(概要欄のホワイトペーパー誘導)
- 話し言葉。カメラに向かって一人で話す想定
- 参照する既存コンテンツがあればその内容に忠実に`,
  sns_x: `X(旧Twitter)の投稿文を3案、Markdownで書いてください。
- 各案140字以内、番号付き見出し(h2)で区切る
- 1案は問題提起型、1案はデータ引用型、1案はノウハウ型
- 末尾に記事リンクのプレースホルダ [記事URL] を置く。ハッシュタグは2個まで`,
  sns_facebook: `Facebookの投稿文を1案、Markdownで書いてください。
- 300-500字。冒頭2行で惹きつけ、改行を多めに読みやすく
- 末尾に記事リンクのプレースホルダ [記事URL]`,
  sns_linkedin: `LinkedInの投稿文を1案、Markdownで書いてください。
- 400-600字。ビジネス意思決定者向けのトーンで、具体的な数字や示唆を入れる
- 末尾に記事リンクのプレースホルダ [記事URL]`,
};

export async function generateContent(
  input: GenerateContentInput
): Promise<GeneratedContent> {
  const context = [
    input.segmentName && `対象セグメント: ${input.segmentName}`,
    input.keywords.length > 0 && `対象キーワード: ${input.keywords.join(", ")}`,
    input.companyName && `ターゲット企業: ${input.companyName}`,
    input.companyContext && `調査データ:\n${input.companyContext}`,
    input.parentSummary && `参照する既存コンテンツの要約:\n${input.parentSummary}`,
  ]
    .filter(Boolean)
    .join("\n\n");

  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 8000,
    messages: [
      {
        role: "user",
        content: `あなたはSEO支援会社のコンテンツライターです。

${context}

${CONTENT_INSTRUCTIONS[input.contentType]}

次のJSONのみを出力してください(コードブロック不要):
{"title": "タイトル", "body": "Markdown本文"}`,
      },
    ],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("生成結果のJSONを抽出できませんでした");
  const parsed = JSON.parse(match[0]);
  if (!parsed.title || !parsed.body) {
    throw new Error("生成結果に title / body がありません");
  }
  return { title: String(parsed.title), body: String(parsed.body) };
}
