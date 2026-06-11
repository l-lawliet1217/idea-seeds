import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase-server";
import { daysUntilBirthday } from "@/lib/givers";

// 日次リマインド: 接触超過の友人と直近の誕生日をSlackに通知
// SLACK_WEBHOOK_URL 未設定時は集計結果を返すだけ
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();
  const today = new Date().toISOString().slice(0, 10);

  const [overdueRes, friendsRes, triggersRes] = await Promise.all([
    supabase
      .from("givers_friends")
      .select("name, tier, next_contact_date")
      .lte("next_contact_date", today)
      .neq("tier", "T5")
      .order("tier")
      .limit(20),
    supabase.from("givers_friends").select("name, birthday").not("birthday", "is", null),
    supabase
      .from("givers_triggers")
      .select("content, givers_friends(name)")
      .eq("status", "open")
      .limit(10),
  ]);

  const overdue = overdueRes.data ?? [];
  const birthdays = (friendsRes.data ?? [])
    .map((f) => ({ name: f.name, days: daysUntilBirthday(f.birthday) }))
    .filter((b) => b.days !== null && b.days <= 14)
    .sort((a, b) => (a.days ?? 0) - (b.days ?? 0));
  const openTriggers = triggersRes.data ?? [];

  const lines: string[] = [];
  if (overdue.length > 0) {
    lines.push(
      `接触超過 ${overdue.length}名: ` +
        overdue.map((f) => `${f.name}(${f.tier})`).join(", ")
    );
  }
  if (birthdays.length > 0) {
    lines.push(
      "直近の誕生日: " +
        birthdays.map((b) => `${b.name}(${b.days === 0 ? "今日" : `${b.days}日後`})`).join(", ")
    );
  }
  if (openTriggers.length > 0) {
    lines.push(`未対応トリガー ${openTriggers.length}件`);
  }

  let notified = false;
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (webhook && lines.length > 0) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: `GiversNetwork デイリーリマインド\n${lines.join("\n")}`,
        }),
      });
      notified = true;
    } catch {
      notified = false;
    }
  }

  return NextResponse.json({
    overdue: overdue.length,
    birthdays: birthdays.length,
    open_triggers: openTriggers.length,
    notified,
  });
}
