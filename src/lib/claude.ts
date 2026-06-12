import Anthropic from "@anthropic-ai/sdk";

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    // レート制限(429)はSDKが指数バックオフで自動リトライする。回数を多めに設定
    _client = new Anthropic({ maxRetries: 5 });
  }
  return _client;
}

// Anthropic APIのエラーを利用者向けの日本語に変換する
export function friendlyClaudeError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/credit balance is too low/i.test(message)) {
    return "Anthropic APIのクレジット残高が不足しています。https://platform.claude.com/ の Plans & Billing でAPIクレジットを購入してください(Claude.aiの月額サブスクリプションとは別の課金です)";
  }
  if (/rate.?limit/i.test(message)) {
    return "Anthropic APIのレート制限に達しました。数分待ってから再実行してください";
  }
  if (/overloaded/i.test(message)) {
    return "Anthropic APIが混雑しています。少し待ってから再実行してください";
  }
  return message;
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

// ---------- GiversNetwork: マッチング判定・メッセージ生成 ----------

export type MatchJudgement = {
  index: number;
  adopt: boolean;
  reason: string;
};

// 候補ペアをバッチで判定する。過去の採用/却下をfew-shotとして注入
export async function judgeMatchCandidates(
  pairs: { index: number; seeker: string; candidate: string }[],
  feedbackExamples: string[]
): Promise<MatchJudgement[]> {
  const feedbackBlock =
    feedbackExamples.length > 0
      ? `過去の判断例(これに整合させること):\n${feedbackExamples.join("\n")}\n\n`
      : "";

  const pairsBlock = pairs
    .map((p) => `[${p.index}]\n会いたい側: ${p.seeker}\n候補: ${p.candidate}`)
    .join("\n\n");

  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 3000,
    messages: [
      {
        role: "user",
        content: `あなたは経営者ネットワークの紹介マッチング判定者です。
「会いたい側」の希望と「候補」のプロフィールを照合し、紹介する価値が高いペアだけを採用してください。
判定基準は厳格に:
- 希望と候補の事業・立場が具体的に噛み合っていること
- VC×スタートアップの場合は投資ステージと調達フェーズが整合していること
- 業界が同じだけ・抽象的な相性だけでの採用は不可

${feedbackBlock}候補ペア:
${pairsBlock}

次のJSON配列のみを出力(コードブロック不要):
[{"index": 番号, "adopt": true/false, "reason": "日本語1文"}]`,
      },
    ],
  });

  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\[[\s\S]*\]/);
  if (!match) throw new Error("マッチング判定のJSONを抽出できませんでした");
  const parsed: unknown = JSON.parse(match[0]);
  if (!Array.isArray(parsed)) throw new Error("マッチング判定の形式が不正です");
  return parsed.map((row) => ({
    index: Number((row as MatchJudgement).index),
    adopt: !!(row as MatchJudgement).adopt,
    reason: String((row as MatchJudgement).reason ?? ""),
  }));
}

export type GiversMessageKind = "pitch" | "connection" | "birthday" | "follow";

const GIVERS_MESSAGE_INSTRUCTIONS: Record<GiversMessageKind, string> = {
  pitch:
    "紹介打診のメッセージ。相手(会いたい側の友人)に「こういう方がいるが、お繋ぎしてよいか」を打診する。候補者の魅力と繋がる価値を具体的に。",
  connection:
    "両者へ送る接続(引き合わせ)メッセージ。双方の簡単な紹介と、繋いだ理由、次のアクション(日程調整など)を含める。",
  birthday:
    "誕生日のお祝いメッセージ。短く心のこもった内容で、近況を伺う一言を添える。",
  follow:
    "しばらく接触していない相手へのフォローアップ。重くならず、近況伺いと軽い再会提案を。",
};

export async function generateGiversMessage(input: {
  kind: GiversMessageKind;
  friendProfile: string; // 送り先の情報
  otherProfile?: string; // 紹介相手の情報(pitch/connection時)
  context?: string;
}): Promise<string> {
  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `あなたは経営者ネットワーカーの代筆者です。SNSのDMで送る自然な日本語メッセージを書いてください。
種別: ${GIVERS_MESSAGE_INSTRUCTIONS[input.kind]}

送り先: ${input.friendProfile}
${input.otherProfile ? `紹介相手: ${input.otherProfile}` : ""}
${input.context ? `補足: ${input.context}` : ""}

- 敬意がありつつカジュアルすぎないトーン
- 300字以内
- メッセージ本文のみを出力(前置き・引用符不要)`,
      },
    ],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  return text.trim();
}

// URL先のページや議事録テキストから友人プロフィールを抽出する
export type ExtractedProfile = {
  name: string;
  company: string | null;
  position: string | null;
  industry: string | null;
  phase: string | null;
  wants_to_meet: string | null;
  needs: string | null;
  contributions: string | null;
  notes: string | null;
};

export async function extractFriendProfile(
  sourceText: string
): Promise<ExtractedProfile> {
  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `以下のテキスト(Webページ・SNSプロフィール・議事録など)から、経営者ネットワーク管理用の人物プロフィールを抽出してください。
記載がない項目は null。推測で埋めない。notesには出典に書かれた特徴的な事実を2-3行で。

テキスト:
${sourceText.slice(0, 8000)}

次のJSONのみを出力(コードブロック不要):
{"name": "氏名", "company": "会社名", "position": "役職", "industry": "業界", "phase": "経営フェーズ(シード/シリーズA/上場など)", "wants_to_meet": "会いたい人の特徴", "needs": "ニーズ", "contributions": "貢献できること", "notes": "メモ"}`,
      },
    ],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("プロフィール抽出のJSONを取得できませんでした");
  const parsed = JSON.parse(match[0]);
  if (!parsed.name) throw new Error("氏名を抽出できませんでした");
  const str = (v: unknown) => (v ? String(v) : null);
  return {
    name: String(parsed.name),
    company: str(parsed.company),
    position: str(parsed.position),
    industry: str(parsed.industry),
    phase: str(parsed.phase),
    wants_to_meet: str(parsed.wants_to_meet),
    needs: str(parsed.needs),
    contributions: str(parsed.contributions),
    notes: str(parsed.notes),
  };
}

// 検索上位サイトのうち、セグメントに本当に該当するものをHaiku(軽量・低コスト)で選別する
export type SiteRelevanceResult = {
  indices: number[];
  usage: Anthropic.Messages.Usage;
};

export async function judgeSiteRelevance(
  segmentName: string,
  sites: { title: string | null; url: string }[]
): Promise<SiteRelevanceResult> {
  const list = sites
    .map((s, i) => `[${i}] ${s.title ?? "(タイトル不明)"} - ${s.url}`)
    .join("\n");
  const res = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `以下はGoogle検索「${segmentName}」の上位結果です。
このうち「${segmentName}」という特化型サービスのサイト本体に該当しそうなものの番号だけを選んでください。
除外: ニュース記事、ブログ、まとめ/比較記事、求人広告の個別ページ、大手総合サイト、Wikipedia。

${list}

JSON配列のみ出力(該当なしなら[]): 例 [0,2]`,
      },
    ],
  });
  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const m = text.match(/\[[^\]]*\]/);
  let indices: number[] = [];
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      if (Array.isArray(parsed)) {
        indices = parsed
          .map(Number)
          .filter((n) => Number.isInteger(n) && n >= 0 && n < sites.length);
      }
    } catch {
      indices = [];
    }
  }
  return { indices, usage: res.usage };
}

// 各サイトの証拠テキストから「運営会社の正式社名」だけを抽出する(Haiku・低コスト)
export type CompanyNameExtraction = {
  names: Record<number, string | null>;
  usage: Anthropic.Messages.Usage;
};

export async function extractCompanyNames(
  sites: { index: number; service_name: string | null; url: string; evidence: string[] }[]
): Promise<CompanyNameExtraction> {
  const blocks = sites
    .map(
      (s) =>
        `[${s.index}] サービス: ${s.service_name ?? "?"} (${s.url})\n証拠:\n${s.evidence.map((e) => `- ${e}`).join("\n") || "- (なし)"}`
    )
    .join("\n\n");

  const res = await getClient().messages.create({
    model: "claude-haiku-4-5",
    max_tokens: 400,
    messages: [
      {
        role: "user",
        content: `各サイトについて、証拠テキストから「そのサイトを運営する会社の正式社名」を抽出してください。

厳守するルール:
- [copyright]や[運営会社表記]の文脈にある社名を最優先する
- 「株式会社〇〇が運営する」のような助詞・動詞(が運営する、を提供 等)は社名に含めない。社名そのものだけを出す
- 求人広告・記事・取引先として本文に登場する企業名は運営会社ではないので選ばない
- 証拠に存在しない社名を推測・生成しない
- 確信が持てない場合は null

${blocks}

次のJSONのみを出力(コードブロック不要)。キーは各サイトの番号:
{"0": "株式会社シーズ", "1": null}`,
      },
    ],
  });

  const text = res.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { text: string }).text)
    .join("");
  const m = text.match(/\{[\s\S]*\}/);
  const names: Record<number, string | null> = {};
  if (m) {
    try {
      const parsed = JSON.parse(m[0]);
      for (const [key, value] of Object.entries(parsed)) {
        const i = Number(key);
        if (!Number.isInteger(i)) continue;
        names[i] =
          typeof value === "string" && value.trim() ? value.trim().slice(0, 60) : null;
      }
    } catch {
      // 解析失敗時は全てnull扱い
    }
  }
  return { names, usage: res.usage };
}

// アウトリーチ文を指示に従って書き直す
export async function rewriteMessage(
  message: string,
  instruction: string
): Promise<string> {
  const res = await getClient().messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1500,
    messages: [
      {
        role: "user",
        content: `以下のメッセージを指示に従って書き直してください。本文のみを出力(前置き不要)。

指示: ${instruction}

メッセージ:
${message}`,
      },
    ],
  });
  const text = res.content[0].type === "text" ? res.content[0].text : "";
  return text.trim();
}
