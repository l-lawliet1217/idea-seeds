import { NextResponse } from "next/server";
import { getSupabaseAdmin, fetchAllRows } from "@/lib/supabase-server";

// 特化先項目の一括登録。「名前」または「名前,業種コード」を1行1項目で受け取る
export async function POST(req: Request) {
  const body = await req.json();
  const databaseId: string | undefined = body.database_id;
  const lines: string[] = Array.isArray(body.items)
    ? body.items
    : String(body.text ?? "")
        .split("\n")
        .map((line: string) => line.trim())
        .filter(Boolean);

  if (!databaseId || lines.length === 0) {
    return NextResponse.json(
      { error: "database_id と items(または text)は必須です" },
      { status: 400 }
    );
  }

  const supabase = getSupabaseAdmin();
  let existing: { name: string }[];
  try {
    // SELECTは既定で最大1000行のため全件ページングで取得する
    existing = await fetchAllRows<{ name: string }>(() =>
      supabase.from("industries").select("name").eq("database_id", databaseId)
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "取得に失敗しました";
    return NextResponse.json({ error: message }, { status: 500 });
  }
  const existingNames = new Set(existing.map((row) => row.name));

  const rows: { name: string; gbizinfo_code: string | null; database_id: string }[] = [];
  for (const line of lines) {
    const [name, code] = line.split(",").map((s: string) => s.trim());
    if (!name || existingNames.has(name)) continue;
    existingNames.add(name);
    rows.push({ name, gbizinfo_code: code || null, database_id: databaseId });
  }

  if (rows.length === 0) {
    return NextResponse.json({ inserted: 0, skipped: lines.length });
  }
  // INSERTも大量行をまとめて送ると失敗しうるため、1000件ずつに分割する
  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await supabase
      .from("industries")
      .insert(rows.slice(i, i + chunkSize));
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({
    inserted: rows.length,
    skipped: lines.length - rows.length,
  });
}
