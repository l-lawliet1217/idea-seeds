// GiversNetworkのマッチング・誕生日ロジック
// (ローカル版 lib/matching.ts / birthday.ts の軽量トークナイズ方式を移植)

import { GiverFriend } from "@/types";

// カタカナ3字以上 / 漢字2字以上 / 英数3字以上を語として抽出。
// 漢字の連続は2-gramにも分解して部分一致を拾う
export function tokenize(text: string): Set<string> {
  const tokens = new Set<string>();
  for (const m of text.matchAll(/[ァ-ヴー]{3,}|[一-龠]{2,}|[A-Za-z0-9]{3,}/g)) {
    const word = m[0].toLowerCase();
    tokens.add(word);
    if (/^[一-龠]+$/.test(word)) {
      for (let i = 0; i + 2 <= word.length; i++) {
        tokens.add(word.slice(i, i + 2));
      }
    }
  }
  return tokens;
}

export function profileText(f: GiverFriend): string {
  return [
    f.company,
    f.position,
    f.industry,
    f.phase,
    f.contributions,
    f.needs,
    f.notes,
  ]
    .filter(Boolean)
    .join(" ");
}

export function overlapScore(a: Set<string>, b: Set<string>): number {
  let score = 0;
  for (const token of a) if (b.has(token)) score++;
  return score;
}

export type MatchPair = {
  a: GiverFriend;
  b: GiverFriend;
  score: number;
};

// 「会いたい人」を持つ友人を起点に、共通語スコアで候補ペアを抽出する。
// excludeKeys は "aId:bId"(順不同で両方向)のセット
export function findCandidatePairs(
  friends: GiverFriend[],
  excludeKeys: Set<string>,
  limit: number
): MatchPair[] {
  const seekers = friends.filter((f) => f.wants_to_meet?.trim());
  const pairs: MatchPair[] = [];
  const seen = new Set<string>();

  for (const seeker of seekers) {
    const want = tokenize(`${seeker.wants_to_meet} ${seeker.needs ?? ""}`);
    for (const other of friends) {
      if (other.id === seeker.id) continue;
      const key = [seeker.id, other.id].sort().join(":");
      if (seen.has(key) || excludeKeys.has(key)) continue;
      const score = overlapScore(want, tokenize(profileText(other)));
      if (score >= 1) {
        seen.add(key);
        pairs.push({ a: seeker, b: other, score });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score).slice(0, limit);
}

export function pairKey(aId: string, bId: string): string {
  return [aId, bId].sort().join(":");
}

// 誕生日(年あり/なし両対応)から次の誕生日までの残日数を返す
export function daysUntilBirthday(birthday: string | null): number | null {
  if (!birthday) return null;
  const m = birthday.match(/(\d{1,2})-(\d{1,2})$/) ?? birthday.match(/^(\d{1,2})\/(\d{1,2})$/);
  if (!m) return null;
  const month = Number(m[1]);
  const day = Number(m[2]);
  const now = new Date();
  let next = new Date(now.getFullYear(), month - 1, day);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (next < today) next = new Date(now.getFullYear() + 1, month - 1, day);
  return Math.round((next.getTime() - today.getTime()) / (24 * 3600 * 1000));
}

// 最終接触日 + 接触サイクル(月) = 次回接触日
export function calcNextContactDate(
  lastContact: string,
  cycleMonths: number
): string {
  const d = new Date(lastContact);
  d.setMonth(d.getMonth() + (cycleMonths || 3));
  return d.toISOString().slice(0, 10);
}
