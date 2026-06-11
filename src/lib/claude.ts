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
